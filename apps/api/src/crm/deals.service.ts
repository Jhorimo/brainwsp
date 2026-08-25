import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DealFilters {
  q?: string;
  departmentId?: string;
  stageId?: string;
  assignedUserId?: string;
}

const DEAL_INCLUDE = {
  assignedUser: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, color: true, isWon: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.DealInclude;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.serialize(deal);
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
    const updated = await this.prisma.deal.findUniqueOrThrow({ where: { id }, include: DEAL_INCLUDE });
    return this.serialize(updated);
  }

  async remove(companyId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, companyId } });
    if (!deal) throw new NotFoundException('Trato no encontrado');
    await this.prisma.deal.delete({ where: { id } });
    return { success: true };
  }

  private serialize(deal: Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>) {
    const { tags, ...rest } = deal;
    return { ...rest, tags: tags.map((t) => t.tag) };
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
