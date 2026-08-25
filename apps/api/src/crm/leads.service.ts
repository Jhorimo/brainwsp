import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { DealsService } from './deals.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';

export interface LeadFilters {
  q?: string;
  status?: LeadStatus;
  channel?: string;
  assignedUserId?: string;
}

// Mismo criterio que DEAL_INCLUDE: teléfono/notas/etiquetas vienen del Contacto y el
// proyecto de la Conversación de origen — se leen de ahí, no se duplican en el Lead.
const LEAD_INCLUDE = {
  assignedUser: { select: { id: true, name: true } },
  contact: { select: { phone: true, notes: true, tags: { include: { tag: { select: { id: true, name: true, color: true } } } } } },
  conversation: { select: { project: { select: { id: true, name: true } } } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
    private readonly deals: DealsService,
  ) {}

  async list(companyId: string, filters: LeadFilters) {
    const where: Prisma.LeadWhereInput = {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
      ...(filters.q
        ? { OR: [{ title: { contains: filters.q, mode: 'insensitive' } }, { personName: { contains: filters.q, mode: 'insensitive' } }, { companyName: { contains: filters.q, mode: 'insensitive' } }, { personEmail: { contains: filters.q, mode: 'insensitive' } }] }
        : {}),
    };
    const leads = await this.prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: { createdAt: 'desc' }, take: 300 });
    return leads.map(this.serialize);
  }

  async create(companyId: string, input: {
    title: string; personName?: string; personEmail?: string; personPhone?: string; companyName?: string;
    status?: LeadStatus; channel?: string; source?: string; score?: number; value?: number;
    assignedUserId?: string; departmentId?: string; contactId?: string; conversationId?: string;
  }) {
    if (input.assignedUserId) await this.assertUserBelongs(companyId, input.assignedUserId);
    if (input.departmentId) await this.assertDepartmentBelongs(companyId, input.departmentId);
    const lead = await this.prisma.lead.create({
      data: { companyId, ...input, title: input.title.trim() },
      include: LEAD_INCLUDE,
    });
    const serialized = this.serialize(lead);
    void this.realtime.publish(companyId, 'lead.created', serialized);
    return serialized;
  }

  async update(companyId: string, id: string, input: Partial<{
    title: string; personName: string; personEmail: string; personPhone: string; companyName: string;
    status: LeadStatus; channel: string; source: string; score: number; value: number;
    assignedUserId: string | null; departmentId: string | null;
  }>) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Prospecto no encontrado');
    if (input.assignedUserId) await this.assertUserBelongs(companyId, input.assignedUserId);
    if (input.departmentId) await this.assertDepartmentBelongs(companyId, input.departmentId);
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { ...input, ...(input.title !== undefined ? { title: input.title.trim() } : {}) },
      include: LEAD_INCLUDE,
    });
    const serialized = this.serialize(updated);
    void this.realtime.publish(companyId, 'lead.updated', serialized);
    return serialized;
  }

  async remove(companyId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Prospecto no encontrado');
    await this.prisma.lead.delete({ where: { id } });
    void this.realtime.publish(companyId, 'lead.removed', { id });
    return { success: true };
  }

  // Crea un Deal en la primera etapa del departamento del prospecto, copiando sus datos, y
  // deja el Lead marcado como convertido (no se borra, queda de historial). Si ya estaba
  // convertido, no se puede volver a convertir.
  async convert(companyId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Prospecto no encontrado');
    if (lead.convertedDealId) throw new BadRequestException('Este prospecto ya fue convertido en un trato');
    if (!lead.departmentId) throw new BadRequestException('Asigna un departamento al prospecto antes de convertirlo en trato');

    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { departmentId: lead.departmentId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (!firstStage) throw new BadRequestException('Ese departamento todavía no tiene etapas — créalas en Equipo y agentes');

    const deal = await this.prisma.deal.create({
      data: {
        companyId,
        title: lead.title,
        value: lead.value ?? 0,
        departmentId: lead.departmentId,
        stageId: firstStage.id,
        assignedUserId: lead.assignedUserId,
        companyName: lead.companyName,
        personName: lead.personName,
        personEmail: lead.personEmail,
        personPhone: lead.personPhone,
        contactId: lead.contactId,
        conversationId: lead.conversationId,
      },
    });
    const updatedLead = await this.prisma.lead.update({
      where: { id },
      data: { convertedDealId: deal.id },
      include: LEAD_INCLUDE,
    });
    const serializedLead = this.serialize(updatedLead);
    const hydratedDeal = await this.deals.hydrate(deal.id);
    void this.realtime.publish(companyId, 'lead.updated', serializedLead);
    void this.realtime.publish(companyId, 'deal.created', hydratedDeal);
    return hydratedDeal;
  }

  private serialize(lead: Prisma.LeadGetPayload<{ include: typeof LEAD_INCLUDE }>) {
    const { contact, conversation, ...rest } = lead;
    return {
      ...rest,
      phone: contact?.phone || rest.personPhone || null,
      notes: contact?.notes || null,
      contactTags: contact?.tags.map((t) => t.tag) || [],
      project: conversation?.project || null,
    };
  }

  private async assertUserBelongs(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId, active: true } });
    if (!user) throw new BadRequestException('El usuario responsable no pertenece a la empresa');
  }

  private async assertDepartmentBelongs(companyId: string, departmentId: string) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
    if (!department) throw new BadRequestException('Ese departamento no pertenece a la empresa');
  }
}
