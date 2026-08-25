import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Company, Prisma, User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { JwtUser } from '../common/types/jwt-user';
import { generateApiCredential, hashApiSecret, encryptApiSecret } from '../common/utils/secret';
import { slugify } from '../common/utils/slug';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

    if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) {
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

    const payload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return {
      // Sin "Recuérdame" el token usa la TTL corta configurada globalmente (JWT_TTL,
      // 12h por defecto) — con "Recuérdame" dura 30 días, para que valga la pena
      // guardarlo en localStorage en vez de sessionStorage (ver setAuthSession en el
      // frontend). Sin esto, el checkbox guardaba el token pero igual expiraba pronto.
      accessToken: await this.jwt.signAsync(payload, remember ? { expiresIn: '30d' } : undefined),
      user: payload,
      company: { id: user.company.id, name: user.company.name, slug: user.company.slug },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    return { success: true };
  }

  async register(input: { companyName: string; name: string; email: string; password: string }, ip?: string, userAgent?: string) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new BadRequestException('Ya existe una cuenta con ese correo');

    const slug = await this.generateUniqueSlug(input.companyName);
    const passwordHash = await bcrypt.hash(input.password, 12);

    let created: { user: User; company: Company };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({ data: { name: input.companyName.trim(), slug } });
        const user = await tx.user.create({
          data: { companyId: company.id, name: input.name.trim(), email, passwordHash, role: UserRole.OWNER },
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

    const { user, company } = created;
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    void this.logAccess({ action: 'REGISTER', success: true, userId: user.id, companyId: company.id, ip, userAgent });

    const payload = { sub: user.id, companyId: company.id, email: user.email, name: user.name, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: payload,
      company: { id: company.id, name: company.name, slug: company.slug },
    };
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
