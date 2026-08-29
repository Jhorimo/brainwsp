import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { describeUserAgent } from '../common/utils/user-agent';
import { PrismaService } from '../prisma/prisma.service';

interface LogActionInput {
  companyId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private logAction(input: LogActionInput) {
    return this.prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ip: input.ip,
        userAgent: input.userAgent,
        success: input.success ?? true,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
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

  async updateCompany(actorUserId: string, companyId: string, data: { active?: boolean; planId?: string | null; licenseRenewsAt?: string | null }, ip?: string, userAgent?: string) {
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
      await this.logAction({ companyId, userId: actorUserId, action: data.active ? 'COMPANY_ACTIVATED' : 'COMPANY_SUSPENDED', entity: 'Company', entityId: companyId, ip, userAgent });
    }
    if (data.planId !== undefined && data.planId !== company.planId) {
      await this.logAction({ companyId, userId: actorUserId, action: 'COMPANY_PLAN_CHANGED', entity: 'Company', entityId: companyId, ip, userAgent, metadata: { planId: data.planId } });
    }

    return updated;
  }

  async impersonate(actorUserId: string, actorName: string, companyId: string, ip?: string, userAgent?: string) {
    const owner = await this.prisma.user.findFirst({
      where: { companyId, role: 'OWNER', active: true },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new BadRequestException('Esta empresa no tiene un usuario OWNER activo al cual acceder');

    // A diferencia de las demás acciones de admin (donde `userId` = el admin que actúa),
    // acá se guarda el usuario IMPERSONADO como `userId` — así "Seguridad" puede mostrar
    // "Cuenta: {dueño de la empresa}" directamente vía la relación, sin lookups extra. El
    // admin que lo hizo queda en `metadata.actorName` para el detalle ("por {actorName}").
    await this.logAction({ companyId, userId: owner.id, action: 'COMPANY_IMPERSONATED', entity: 'Company', entityId: companyId, ip, userAgent, metadata: { actorName, actorId: actorUserId } });

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

  createPlan(input: { name: string; billingCycle?: string; price?: number; priceUsd?: number; maxAgents?: number; maxInstances?: number; maxMessages?: number }) {
    return this.prisma.plan.create({
      data: {
        name: input.name.trim(),
        billingCycle: input.billingCycle || 'MONTHLY',
        price: input.price ?? 0,
        priceUsd: input.priceUsd ?? 0,
        maxAgents: input.maxAgents,
        maxInstances: input.maxInstances,
        maxMessages: input.maxMessages,
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe un plan con ese nombre');
      throw error;
    });
  }

  async updatePlan(id: string, input: { name?: string; billingCycle?: string; price?: number; priceUsd?: number; maxAgents?: number; maxInstances?: number; maxMessages?: number; active?: boolean }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.billingCycle !== undefined ? { billingCycle: input.billingCycle } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.priceUsd !== undefined ? { priceUsd: input.priceUsd } : {}),
        ...(input.maxAgents !== undefined ? { maxAgents: input.maxAgents } : {}),
        ...(input.maxInstances !== undefined ? { maxInstances: input.maxInstances } : {}),
        ...(input.maxMessages !== undefined ? { maxMessages: input.maxMessages } : {}),
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

  async listSecurityLog(filters: { q?: string; event?: string; status?: 'success' | 'failed' }) {
    const items = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.event ? { action: filters.event } : {}),
        ...(filters.status ? { success: filters.status === 'success' } : {}),
        ...(filters.q
          ? { OR: [{ ip: { contains: filters.q } }, { user: { email: { contains: filters.q, mode: 'insensitive' } } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
    });
    return items.map((item) => ({ ...item, device: describeUserAgent(item.userAgent) }));
  }
}
