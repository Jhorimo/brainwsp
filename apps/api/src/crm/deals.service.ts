import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';

export interface DealFilters {
  q?: string;
  departmentId?: string;
  stageId?: string;
  assignedUserId?: string;
}

// El contacto/conversación de origen traen datos que ya se ven en Conversaciones (teléfono,
// notas, etiquetas, proyecto) — se leen de ahí en vez de duplicarlos como campos propios,
// así siempre reflejan lo último que el agente vio/editó en el chat.
export const DEAL_INCLUDE = {
  assignedUser: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, color: true, isWon: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  contact: { select: { phone: true, notes: true, tags: { include: { tag: { select: { id: true, name: true, color: true } } } } } },
  conversation: { select: { project: { select: { id: true, name: true } } } },
} satisfies Prisma.DealInclude;

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
  ) {}

  async list(companyId: string, filters: DealFilters) {
    const where: Prisma.DealWhereInput = {
      companyId,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
      ...(filters.q
        ? { OR: [{ title: { contains: filters.q, mode: 'insensitive' } }, { personName: { contains: filters.q, mode: 'insensitive' } }, { companyName: { contains: filters.q, mode: 'insensitive' } }] }
        : {}),
    };
    const deals = await this.prisma.deal.findMany({ where, include: DEAL_INCLUDE, orderBy: { createdAt: 'desc' }, take: 300 });
    return deals.map(this.serialize);
  }

  async create(companyId: string, input: {
    title: string; departmentId: string; stageId: string; value?: number; probability?: number; expectedCloseAt?: string;
    assignedUserId?: string; companyName?: string; personName?: string; personEmail?: string; personPhone?: string;
    contactId?: string; conversationId?: string;
  }) {
    await this.assertStageInDepartment(companyId, input.departmentId, input.stageId);
    if (input.assignedUserId) await this.assertUserBelongs(companyId, input.assignedUserId);
    const deal = await this.prisma.deal.create({
      data: {
        companyId,
        title: input.title.trim(),
        departmentId: input.departmentId,
        stageId: input.stageId,
        value: input.value ?? 0,
        probability: input.probability,
        expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : undefined,
        assignedUserId: input.assignedUserId,
        companyName: input.companyName,
        personName: input.personName,
        personEmail: input.personEmail,
        personPhone: input.personPhone,
        contactId: input.contactId,
        conversationId: input.conversationId,
      },
      include: DEAL_INCLUDE,
    });
    const serialized = this.serialize(deal);
    void this.realtime.publish(companyId, 'deal.created', serialized);
    return serialized;
  }

  async update(companyId: string, id: string, input: Partial<{
    title: string; stageId: string; value: number; probability: number; expectedCloseAt: string | null;
    assignedUserId: string | null; companyName: string; personName: string; personEmail: string; personPhone: string;
    tagIds: string[];
  }>) {
    const deal = await this.prisma.deal.findFirst({ where: { id, companyId } });
    if (!deal) throw new NotFoundException('Trato no encontrado');
    if (input.stageId) await this.assertStageInDepartment(companyId, deal.departmentId, input.stageId);
    if (input.assignedUserId) await this.assertUserBelongs(companyId, input.assignedUserId);

    const { tagIds, expectedCloseAt, ...rest } = input;
    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          ...rest,
          ...(expectedCloseAt !== undefined ? { expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null } : {}),
        },
      });
      if (tagIds !== undefined) {
        await tx.dealTag.deleteMany({ where: { dealId: id } });
        if (tagIds.length) await tx.dealTag.createMany({ data: [...new Set(tagIds)].map((tagId) => ({ dealId: id, tagId })) });
      }
    });
    const serialized = await this.hydrate(id);
    void this.realtime.publish(companyId, 'deal.updated', serialized);

    // La Etapa de la conversación de origen (si tiene una) es la misma etiqueta que ve el
    // agente en Conversaciones — moverla acá en el Kanban debe reflejarse allá también.
    if (input.stageId && deal.conversationId) {
      await this.prisma.conversation.updateMany({ where: { id: deal.conversationId }, data: { stageId: input.stageId } });
      void this.realtime.publish(companyId, 'conversation.updated', { id: deal.conversationId, stage: serialized.stage }, deal.departmentId);
    }
    return serialized;
  }

  async remove(companyId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, companyId } });
    if (!deal) throw new NotFoundException('Trato no encontrado');
    await this.prisma.deal.delete({ where: { id } });
    void this.realtime.publish(companyId, 'deal.removed', { id });
    return { success: true };
  }

  // Dirección inversa: la Etapa de la conversación cambió (a mano o por auto-asignación de
  // departamento) — si tiene un Trato enganchado, sigue el mismo movimiento en el Kanban.
  async syncStageFromConversation(companyId: string, conversationId: string, stageId: string | null) {
    if (!stageId) return;
    const deal = await this.prisma.deal.findFirst({ where: { companyId, conversationId } });
    if (!deal || deal.stageId === stageId) return;
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, companyId, departmentId: deal.departmentId } });
    if (!stage) return;
    await this.prisma.deal.update({ where: { id: deal.id }, data: { stageId } });
    void this.realtime.publish(companyId, 'deal.updated', await this.hydrate(deal.id));
  }

  // Reusado por LeadsService.convert() para devolver/emitir el Deal recién creado con la
  // misma forma enriquecida (teléfono/notas/etiquetas/proyecto) que ya usa esta lista.
  async hydrate(id: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id }, include: DEAL_INCLUDE });
    return this.serialize(deal);
  }

  private serialize(deal: Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>) {
    const { tags, contact, conversation, ...rest } = deal;
    return {
      ...rest,
      tags: tags.map((t) => t.tag),
      phone: contact?.phone || rest.personPhone || null,
      notes: contact?.notes || null,
      contactTags: contact?.tags.map((t) => t.tag) || [],
      project: conversation?.project || null,
    };
  }

  private async assertStageInDepartment(companyId: string, departmentId: string, stageId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, companyId, departmentId } });
    if (!stage) throw new BadRequestException('Esa etapa no pertenece al departamento del trato');
  }

  private async assertUserBelongs(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId, active: true } });
    if (!user) throw new BadRequestException('El usuario responsable no pertenece a la empresa');
  }
}
