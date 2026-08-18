import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // `AuditLog.companyId` is required, so a platform-admin action logs against the tenant
  // it was performed on (not the admin's own company) — that's also exactly the context
  // the "Seguridad" screen needs to show ("Empresa X fue suspendida por...").
  private logAction(actorUserId: string, targetCompanyId: string, action: string, entity: string, entityId?: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: { companyId: targetCompanyId, userId: actorUserId, action, entity, entityId, metadata: metadata as Prisma.InputJsonValue | undefined },
    }).catch(() => undefined);
  }

  listCompanies() {
    return this.prisma.company.findMany({
      include: {
        plan: { select: { id: true, name: true } },
        users: { where: { role: 'OWNER' }, select: { id: true, name: true, email: true }, take: 1 },
        _count: { select: { instances: true, conversations: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCompany(actorUserId: string, companyId: string, data: { active?: boolean; planId?: string | null; licenseRenewsAt?: string | null }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    if (data.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan) throw new NotFoundException('Plan no encontrado');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.planId !== undefined ? { planId: data.planId } : {}),
        ...(data.licenseRenewsAt !== undefined ? { licenseRenewsAt: data.licenseRenewsAt ? new Date(data.licenseRenewsAt) : null } : {}),
      },
      include: { plan: { select: { id: true, name: true } } },
    });

    if (data.active !== undefined && data.active !== company.active) {
      await this.logAction(actorUserId, companyId, data.active ? 'COMPANY_ACTIVATED' : 'COMPANY_SUSPENDED', 'Company', companyId);
    }
    if (data.planId !== undefined && data.planId !== company.planId) {
      await this.logAction(actorUserId, companyId, 'COMPANY_PLAN_CHANGED', 'Company', companyId, { planId: data.planId });
    }

    return updated;
  }

  async impersonate(actorUserId: string, companyId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { companyId, role: 'OWNER', active: true },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new BadRequestException('Esta empresa no tiene un usuario OWNER activo al cual acceder');

    await this.logAction(actorUserId, companyId, 'COMPANY_IMPERSONATED', 'Company', companyId, { asUserId: owner.id });

    const payload = { sub: owner.id, companyId: owner.companyId, email: owner.email, name: owner.name, role: owner.role };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: '30m' }),
      user: payload,
      company: { id: owner.company.id, name: owner.company.name, slug: owner.company.slug },
    };
  }

  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' }, include: { _count: { select: { companies: true } } } });
  }

  createPlan(input: { name: string; billingCycle?: string; price?: number; maxAgents?: number; maxInstances?: number }) {
    return this.prisma.plan.create({
      data: {
        name: input.name.trim(),
        billingCycle: input.billingCycle || 'MONTHLY',
        price: input.price ?? 0,
        maxAgents: input.maxAgents,
        maxInstances: input.maxInstances,
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe un plan con ese nombre');
      throw error;
    });
  }

  async updatePlan(id: string, input: { name?: string; billingCycle?: string; price?: number; maxAgents?: number; maxInstances?: number; active?: boolean }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.billingCycle !== undefined ? { billingCycle: input.billingCycle } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.maxAgents !== undefined ? { maxAgents: input.maxAgents } : {}),
        ...(input.maxInstances !== undefined ? { maxInstances: input.maxInstances } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    await this.prisma.plan.delete({ where: { id } });
    return { success: true };
  }

  listSuggestions() {
    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        company: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  listSecurityLog() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
    });
  }
}
