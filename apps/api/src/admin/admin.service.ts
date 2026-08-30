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

    // Se pisa "desde cuándo" el plan/licencia actual está activo cada vez que el plan cambia
    // o se toca la fecha de vencimiento a mano — no cuando solo se activa/suspende la empresa.
    const touchesLicense = (data.planId !== undefined && data.planId !== company.planId) || data.licenseRenewsAt !== undefined;
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.planId !== undefined ? { planId: data.planId } : {}),
        ...(data.licenseRenewsAt !== undefined ? { licenseRenewsAt: data.licenseRenewsAt ? new Date(data.licenseRenewsAt) : null } : {}),
        ...(touchesLicense ? { planStartedAt: new Date() } : {}),
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

  async createPlan(input: { name: string; billingCycle?: string; price?: number; priceUsd?: number; maxAgents?: number; maxInstances?: number; maxMessages?: number; isDefault?: boolean; trialDays?: number; features?: string[] }) {
    // Solo un plan puede ser el default de registro — mismo patrón que Department.isDefault
    // (ver team.service.ts): desmarcar todos antes de crear este con la marca puesta.
    if (input.isDefault) await this.prisma.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    return this.prisma.plan.create({
      data: {
        name: input.name.trim(),
        billingCycle: input.billingCycle || 'MONTHLY',
        price: input.price ?? 0,
        priceUsd: input.priceUsd ?? 0,
        maxAgents: input.maxAgents,
        maxInstances: input.maxInstances,
        maxMessages: input.maxMessages,
        isDefault: input.isDefault ?? false,
        ...(input.trialDays !== undefined ? { trialDays: input.trialDays } : {}),
        ...(input.features !== undefined ? { features: input.features } : {}),
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe un plan con ese nombre');
      throw error;
    });
  }

  async updatePlan(id: string, input: { name?: string; billingCycle?: string; price?: number; priceUsd?: number; maxAgents?: number; maxInstances?: number; maxMessages?: number; active?: boolean; isDefault?: boolean; trialDays?: number; features?: string[] }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (input.isDefault) await this.prisma.plan.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
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
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.trialDays !== undefined ? { trialDays: input.trialDays } : {}),
        ...(input.features !== undefined ? { features: input.features } : {}),
      },
    });
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    await this.prisma.plan.delete({ where: { id } });
    return { success: true };
  }

  // --- Métodos de pago manual (catálogo global de la plataforma) ---

  listPaymentMethods() {
    return this.prisma.platformPaymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async getPaymentMethodQrObjectName(id: string) {
    const method = await this.prisma.platformPaymentMethod.findUnique({ where: { id }, select: { qrImageUrl: true } });
    if (!method?.qrImageUrl) throw new NotFoundException('Este método de pago no tiene QR');
    return method.qrImageUrl.split('/').pop() as string;
  }

  createPaymentMethod(input: { label: string; accountNumber: string; accountHolder: string; instructions?: string; qrImageUrl?: string }) {
    return this.prisma.platformPaymentMethod.create({
      data: {
        label: input.label.trim(),
        accountNumber: input.accountNumber.trim(),
        accountHolder: input.accountHolder.trim(),
        instructions: input.instructions?.trim() || null,
        qrImageUrl: input.qrImageUrl || null,
      },
    });
  }

  async updatePaymentMethod(id: string, input: { label?: string; accountNumber?: string; accountHolder?: string; instructions?: string; qrImageUrl?: string | null; active?: boolean; sortOrder?: number }) {
    const method = await this.prisma.platformPaymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Método de pago no encontrado');
    return this.prisma.platformPaymentMethod.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber.trim() } : {}),
        ...(input.accountHolder !== undefined ? { accountHolder: input.accountHolder.trim() } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions?.trim() || null } : {}),
        ...(input.qrImageUrl !== undefined ? { qrImageUrl: input.qrImageUrl } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  async deletePaymentMethod(id: string) {
    const method = await this.prisma.platformPaymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Método de pago no encontrado');
    await this.prisma.platformPaymentMethod.delete({ where: { id } });
    return { success: true };
  }

  // --- Solicitudes de pago manual ---

  listPaymentRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.paymentRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, billingCycle: true, price: true, priceUsd: true } },
        paymentMethod: { select: { id: true, label: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  async getPaymentRequestProof(id: string) {
    const request = await this.prisma.paymentRequest.findUnique({ where: { id }, select: { proofUrl: true, proofMimeType: true } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    return request;
  }

  // Aprobar mueve la licencia real de la empresa — la duración sale del billingCycle del plan
  // solicitado (mensual = +30 días, anual = +365), contados desde HOY (no se acumula sobre el
  // vencimiento anterior, para no premiar a alguien que pagó tarde con más días de los que
  // compró). FREE no debería llegar a un pago real, pero por las dudas no mueve la fecha.
  async approvePaymentRequest(actorUserId: string, id: string, ip?: string, userAgent?: string) {
    const request = await this.prisma.paymentRequest.findUnique({ where: { id }, include: { plan: true } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') throw new BadRequestException('Esta solicitud ya fue revisada');

    const days = request.plan.billingCycle === 'ANNUAL' ? 365 : request.plan.billingCycle === 'MONTHLY' ? 30 : 0;
    const licenseRenewsAt = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : undefined;

    const [updatedRequest] = await this.prisma.$transaction([
      this.prisma.paymentRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedByUserId: actorUserId, reviewedAt: new Date() },
      }),
      this.prisma.company.update({
        where: { id: request.companyId },
        data: { planId: request.planId, planStartedAt: new Date(), ...(licenseRenewsAt ? { licenseRenewsAt } : {}) },
      }),
    ]);

    await this.logAction({ companyId: request.companyId, userId: actorUserId, action: 'PAYMENT_REQUEST_APPROVED', entity: 'PaymentRequest', entityId: id, ip, userAgent, metadata: { planId: request.planId } });
    return updatedRequest;
  }

  async rejectPaymentRequest(actorUserId: string, id: string, note?: string, ip?: string, userAgent?: string) {
    const request = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') throw new BadRequestException('Esta solicitud ya fue revisada');

    const updated = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewNote: note?.trim() || null, reviewedByUserId: actorUserId, reviewedAt: new Date() },
    });
    await this.logAction({ companyId: request.companyId, userId: actorUserId, action: 'PAYMENT_REQUEST_REJECTED', entity: 'PaymentRequest', entityId: id, ip, userAgent });
    return updated;
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
