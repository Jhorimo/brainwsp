import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Company, Prisma, User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { slugify } from '../common/utils/slug';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { company: true },
    });

    if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const payload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: payload,
      company: { id: user.company.id, name: user.company.name, slug: user.company.slug },
    };
  }

  async register(input: { companyName: string; name: string; email: string; password: string }) {
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
        return { user, company };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Ya existe una cuenta con ese correo');
      }
      throw error;
    }

    const { user, company } = created;
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

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
