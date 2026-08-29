import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFlowDto, UpdateFlowDto } from './automations.dto';
import { emptyGraph } from './engine/graph';
import { matchesKeyword } from './engine/keyword-match';
import { resumeFlow, runFlow } from './engine/run-flow';
import type { FlowGraph } from './engine/types';

const INSTANCE_SELECT = { id: true, name: true, phoneNumber: true, displayName: true } satisfies Prisma.WhatsAppInstanceSelect;

const FLOW_LIST_SELECT = {
  id: true,
  name: true,
  triggerType: true,
  triggerKeywords: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  folder: { select: { id: true, name: true } },
  instances: { select: INSTANCE_SELECT },
} satisfies Prisma.FlowSelect;

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Carpetas ---

  listFolders(companyId: string) {
    return this.prisma.flowFolder.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  createFolder(companyId: string, name: string) {
    return this.prisma.flowFolder.create({ data: { companyId, name: name.trim() } }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una carpeta con ese nombre');
      throw error;
    });
  }

  async deleteFolder(companyId: string, id: string) {
    const folder = await this.prisma.flowFolder.findFirst({ where: { id, companyId } });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    // Los flujos de la carpeta no se borran, solo quedan "Sin carpeta" (mismo trato que
    // Department/Project con sus relaciones opcionales — ver schema.prisma).
    await this.prisma.flowFolder.delete({ where: { id } });
    return { success: true };
  }

  // --- Flujos ---

  async stats(companyId: string) {
    const [total, active, withInstanceCounts] = await Promise.all([
      this.prisma.flow.count({ where: { companyId } }),
      this.prisma.flow.count({ where: { companyId, active: true } }),
      this.prisma.flow.findMany({ where: { companyId }, select: { _count: { select: { instances: true } } } }),
    ]);
    // "Compartido" = aplica a más de un bot. withAi queda en 0 hasta que exista el nodo de
    // IA (fase futura) — se devuelve ya para que el dashboard no maneje campos ausentes.
    const shared = withInstanceCounts.filter((flow) => flow._count.instances > 1).length;
    return { total, active, withAi: 0, shared };
  }

  async listFlows(companyId: string, filters: { folderId?: string; instanceId?: string; search?: string }) {
    const where: Prisma.FlowWhereInput = {
      companyId,
      ...(filters.folderId ? { folderId: filters.folderId } : {}),
      ...(filters.instanceId ? { instances: { some: { id: filters.instanceId } } } : {}),
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
    };
    return this.prisma.flow.findMany({ where, select: FLOW_LIST_SELECT, orderBy: { updatedAt: 'desc' } });
  }

  async getOwnedFlow(companyId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({ where: { id, companyId }, include: { instances: { select: INSTANCE_SELECT } } });
    if (!flow) throw new NotFoundException('Flujo no encontrado');
    return flow;
  }

  async getFlow(companyId: string, id: string) {
    return this.getOwnedFlow(companyId, id);
  }

  private async validateInstanceIds(companyId: string, instanceIds: string[]) {
    const ids = [...new Set(instanceIds.filter(Boolean))];
    if (!ids.length) throw new BadRequestException('Selecciona al menos un bot');
    const found = await this.prisma.whatsAppInstance.count({ where: { id: { in: ids }, companyId } });
    if (found !== ids.length) throw new BadRequestException('Uno de los bots seleccionados no existe');
    return ids;
  }

  async createFlow(companyId: string, userId: string, dto: CreateFlowDto) {
    const keywords = dto.triggerKeywords.map((keyword) => keyword.trim()).filter(Boolean);
    if (!keywords.length) throw new BadRequestException('Agrega al menos una palabra clave');

    const instanceIds = await this.validateInstanceIds(companyId, dto.instanceIds);

    if (dto.folderId) {
      const folder = await this.prisma.flowFolder.findFirst({ where: { id: dto.folderId, companyId } });
      if (!folder) throw new BadRequestException('La carpeta seleccionada no existe');
    }

    return this.prisma.flow.create({
      data: {
        companyId,
        instances: { connect: instanceIds.map((id) => ({ id })) },
        folderId: dto.folderId || null,
        name: dto.name.trim(),
        triggerKeywords: keywords,
        graph: emptyGraph() as unknown as Prisma.InputJsonValue,
        createdByUserId: userId,
      },
      include: { instances: { select: INSTANCE_SELECT } },
    });
  }

  async updateFlow(companyId: string, id: string, dto: UpdateFlowDto) {
    await this.getOwnedFlow(companyId, id);

    if (dto.folderId) {
      const folder = await this.prisma.flowFolder.findFirst({ where: { id: dto.folderId, companyId } });
      if (!folder) throw new BadRequestException('La carpeta seleccionada no existe');
    }
    if (dto.triggerKeywords && !dto.triggerKeywords.map((k) => k.trim()).filter(Boolean).length) {
      throw new BadRequestException('Agrega al menos una palabra clave');
    }
    const instanceIds = dto.instanceIds !== undefined ? await this.validateInstanceIds(companyId, dto.instanceIds) : undefined;

    return this.prisma.flow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.folderId !== undefined ? { folderId: dto.folderId || null } : {}),
        ...(dto.triggerKeywords !== undefined ? { triggerKeywords: dto.triggerKeywords.map((k) => k.trim()).filter(Boolean) } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(instanceIds !== undefined ? { instances: { set: instanceIds.map((instanceId) => ({ id: instanceId })) } } : {}),
        ...(dto.graph !== undefined ? { graph: dto.graph as unknown as Prisma.InputJsonValue } : {}),
      },
      include: { instances: { select: INSTANCE_SELECT } },
    });
  }

  async deleteFlow(companyId: string, id: string) {
    await this.getOwnedFlow(companyId, id);
    await this.prisma.flow.delete({ where: { id } });
    return { success: true };
  }

  async duplicateFlow(companyId: string, userId: string, id: string) {
    const flow = await this.getOwnedFlow(companyId, id);
    return this.prisma.flow.create({
      data: {
        companyId,
        instances: { connect: flow.instances.map((instance) => ({ id: instance.id })) },
        folderId: flow.folderId,
        name: `Copia de ${flow.name}`,
        triggerType: flow.triggerType,
        triggerKeywords: flow.triggerKeywords,
        graph: flow.graph as unknown as Prisma.InputJsonValue,
        active: false,
        createdByUserId: userId,
      },
    });
  }

  // Corre el motor real contra el grafo guardado — nada se persiste (ver el comentario sobre
  // FlowExecution en schema.prisma): es una prueba efímera para quien está editando, no una
  // conversación real. Exige la misma palabra clave que exigiría producción para que "lo que
  // ves en el simulador" sea fiel a "lo que pasaría de verdad".
  async simulate(companyId: string, id: string, message: string, resumeFromNodeId?: string) {
    const flow = await this.getOwnedFlow(companyId, id);
    const graph = flow.graph as unknown as FlowGraph;

    if (resumeFromNodeId) {
      const result = resumeFlow(graph, resumeFromNodeId, message);
      return { triggered: true, ...result };
    }

    if (!matchesKeyword(flow.triggerKeywords, message)) {
      return { triggered: false, effects: [], status: 'COMPLETED' as const, context: {} };
    }
    const result = runFlow(graph);
    return { triggered: true, ...result };
  }
}
