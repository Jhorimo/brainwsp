import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Company, Prisma, User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { JwtUser } from '../common/types/jwt-user';
import { generateApiCredential, hashApiSecret, encryptApiSecret } from '../common/utils/secret';
import { slugify } from '../common/utils/slug';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';

type GoogleLoginTicket = { purpose: 'google-login'; userId: string; googleId: string };
type GoogleSignupTicket = { purpose: 'google-signup'; googleId: string; email: string; name: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // Resolved fresh from the DB (not decoded from the JWT) so nav/module visibility
  // reflects the latest permissions an admin set, without requiring the agent to re-login.
  async getProfile(user: JwtUser) {
    const [dbUser, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.sub }, select: { allowedModules: true } }),
      this.prisma.departmentUser.findMany({ where: { userId: user.sub }, select: { department: { select: { id: true, name: true } } } }),
    ]);
    return {
      ...user,
      allowedModules: dbUser?.allowedModules ?? [],
      departments: memberships.map((m) => m.department),
    };
  }

  // Best-effort: el registro de acceso nunca debe romper el login/registro en sí.
  private logAccess(input: { action: string; success: boolean; userId?: string | null; companyId?: string | null; ip?: string; userAgent?: string; metadata?: Record<string, unknown> }) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        entity: 'User',
        success: input.success,
        userId: input.userId ?? undefined,
        companyId: input.companyId ?? undefined,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    }).catch(() => undefined);
  }

  async login(email: string, password: string, remember?: boolean, ip?: string, userAgent?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { company: true },
    });

    // `passwordHash` is null for accounts that only ever signed in with Google — nothing
    // to compare against, so treat that the same as a wrong password rather than letting
    // bcrypt.compare(password, null) throw.
    if (!user?.active || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      void this.logAccess({
        action: 'LOGIN',
        success: false,
        userId: user?.id,
        companyId: user?.companyId,
        ip,
        userAgent,
        metadata: { email: normalizedEmail, reason: user && !user.active ? 'INACTIVE_ACCOUNT' : 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    void this.logAccess({ action: 'LOGIN', success: true, userId: user.id, companyId: user.companyId, ip, userAgent });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user, user.company, remember);
  }

  // Sin "Recuérdame" el token usa la TTL corta configurada globalmente (JWT_TTL, 12h por
  // defecto) — con "Recuérdame" dura 30 días, para que valga la pena guardarlo en
  // localStorage en vez de sessionStorage (ver setAuthSession en el frontend).
  private async issueSession(user: User, company: Company, remember?: boolean) {
    const payload = { sub: user.id, companyId: user.companyId, email: user.email, name: user.name, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload, remember ? { expiresIn: '30d' } : undefined),
      user: payload,
      company: { id: company.id, name: company.name, slug: company.slug },
    };
  }

  async updateProfile(userId: string, name: string) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
    return { id: user.id, name: user.name };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // A Google-only account (passwordHash null) has nothing to verify the "current"
    // password against — this is really "set my first password", not "change" it.
    if (!user || (user.passwordHash && !(await bcrypt.compare(currentPassword, user.passwordHash)))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    return { success: true };
  }

  async register(input: { companyName: string; name: string; email: string; password: string }, ip?: string, userAgent?: string) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const { user, company } = await this.createCompanyWithOwner({ ...input, passwordHash });
    void this.logAccess({ action: 'REGISTER', success: true, userId: user.id, companyId: company.id, ip, userAgent });
    return this.issueSession(user, company);
  }

  // Shared by email/password registration and by the "sign up with Google" completion
  // step — both ultimately need the same thing: a brand-new Company plus its OWNER user
  // and starter API credential.
  private async createCompanyWithOwner(input: { companyName: string; name: string; email: string; passwordHash?: string; googleId?: string }) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new BadRequestException('Ya existe una cuenta con ese correo');

    const slug = await this.generateUniqueSlug(input.companyName);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({ data: { name: input.companyName.trim(), slug } });
        const user = await tx.user.create({
          data: {
            companyId: company.id,
            name: input.name.trim(),
            email,
            passwordHash: input.passwordHash,
            googleId: input.googleId,
            role: UserRole.OWNER,
          },
        });

        // AUTH KEY "Principal" de la empresa, sin instancia todavía (instanceId queda
        // null): así el sistema que integra (p.ej. BrainPOS Restaurante) puede autenticar
        // POST /api/user/device con este mismo AUTH KEY desde el primer momento, sin que
        // el OWNER tenga que crear una instancia manualmente antes — ver
        // UserDeviceService.createDevice, que aprovisiona la instancia en ese primer uso.
        const { appKey, authKey } = generateApiCredential();
        await tx.apiCredential.create({
          data: {
            companyId: company.id,
            name: 'Principal',
            appKey,
            authHash: hashApiSecret(authKey),
            authKeyEncrypted: encryptApiSecret(authKey),
          },
        });

        await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { user, company };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Dos registros simultáneos con el mismo nombre de empresa pueden calcular el
        // mismo slug candidato antes de que cualquiera de los dos se guarde (la
        // comprobación previa en generateUniqueSlug no cierra esa ventana de carrera).
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('slug')) {
          throw new BadRequestException('Ese nombre de empresa se acaba de registrar. Intenta de nuevo.');
        }
        throw new BadRequestException('Ya existe una cuenta con ese correo');
      }
      throw error;
    }
  }

  // --- Ingresar / registrarse con Google ---
  //
  // 1. GET /auth/google redirects to Google.
  // 2. GET /auth/google/callback exchanges the code for the Google profile and hands back
  //    a short-lived, single-purpose ticket (never the real session) — one shape for an
  //    existing account, another for an email Google confirmed but that has no BrainWSP
  //    account yet.
  // 3. The frontend posts that ticket to exchangeGoogleTicket(). An existing account logs
  //    in immediately; a new one gets `needsCompany: true` until it also sends a
  //    companyName, at which point it's the same "create a company" flow register() uses.

  buildGoogleAuthUrl() {
    if (!this.googleAuth.isConfigured()) {
      throw new BadRequestException('Ingresar con Google no está configurado en el servidor (faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    }
    return this.googleAuth.buildAuthUrl();
  }

  async handleGoogleCallback(code: string) {
    const profile = await this.googleAuth.exchangeCode(code);
    const user = await this.prisma.user.findFirst({ where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] } });

    if (user) {
      const ticket: GoogleLoginTicket = { purpose: 'google-login', userId: user.id, googleId: profile.googleId };
      return this.jwt.signAsync(ticket, { expiresIn: '2m' });
    }

    const ticket: GoogleSignupTicket = { purpose: 'google-signup', googleId: profile.googleId, email: profile.email, name: profile.name };
    return this.jwt.signAsync(ticket, { expiresIn: '5m' });
  }

  async exchangeGoogleTicket(ticket: string, companyName: string | undefined, ip?: string, userAgent?: string) {
    let payload: GoogleLoginTicket | GoogleSignupTicket;
    try {
      payload = await this.jwt.verifyAsync(ticket);
    } catch {
      throw new BadRequestException('El enlace de acceso con Google venció, inténtalo de nuevo');
    }

    if (payload.purpose === 'google-login') {
      const user = await this.prisma.user.findUnique({ where: { id: payload.userId }, include: { company: true } });
      if (!user?.active) throw new UnauthorizedException('Cuenta no encontrada o inactiva');
      // First Google sign-in for an account that registered with email/password — link it
      // so the next login can also match by googleId (not just by email).
      if (!user.googleId) await this.prisma.user.update({ where: { id: user.id }, data: { googleId: payload.googleId } });
      void this.logAccess({ action: 'LOGIN', success: true, userId: user.id, companyId: user.companyId, ip, userAgent, metadata: { via: 'google' } });
      await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return this.issueSession(user, user.company);
    }

    if (!companyName?.trim()) {
      return { needsCompany: true as const, email: payload.email, name: payload.name };
    }

    const { user, company } = await this.createCompanyWithOwner({
      companyName,
      name: payload.name,
      email: payload.email,
      googleId: payload.googleId,
    });
    void this.logAccess({ action: 'REGISTER', success: true, userId: user.id, companyId: company.id, ip, userAgent, metadata: { via: 'google' } });
    return this.issueSession(user, company);
  }

  private async generateUniqueSlug(companyName: string): Promise<string> {
    const root = slugify(companyName);
    let candidate = root;
    let attempt = 1;
    while (attempt <= 50) {
      const existing = await this.prisma.company.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${root}-${attempt}`;
    }
    return `${root}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
