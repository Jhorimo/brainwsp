import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection, WhatsAppProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class InstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async list(companyId: string) {
    const instances = await this.prisma.whatsAppInstance.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        qr: true,
        reconnectAttempt: true,
        lastError: true,
        lastConnectedAt: true,
        lastDisconnectedAt: true,
        autoConnect: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!instances.length) return instances;

    // Un solo groupBy para todas las instancias en vez de 2 counts por tarjeta — evita
    // N+1 queries cuando la empresa tiene varios números.
    const counts = await this.prisma.message.groupBy({
      by: ['instanceId', 'direction'],
      where: { companyId, instanceId: { in: instances.map((i) => i.id) } },
      _count: { _all: true },
    });
    const byInstance = new Map<string, { inboundCount: number; outboundCount: number }>();
    for (const row of counts) {
      const bucket = byInstance.get(row.instanceId) ?? { inboundCount: 0, outboundCount: 0 };
      if (row.direction === MessageDirection.INBOUND) bucket.inboundCount = row._count._all;
      else bucket.outboundCount = row._count._all;
      byInstance.set(row.instanceId, bucket);
    }

    return instances.map((instance) => ({
      ...instance,
      ...(byInstance.get(instance.id) ?? { inboundCount: 0, outboundCount: 0 }),
    }));
  }

  async create(
    companyId: string,
    name: string,
    slug: string,
    provider: WhatsAppProvider = WhatsAppProvider.BAILEYS,
  ) {
    const existing = await this.prisma.whatsAppInstance.findUnique({
      where: { companyId_slug: { companyId, slug } },
    });
    if (existing) throw new ConflictException('Ya existe una instancia con ese slug');

    return this.prisma.whatsAppInstance.create({
      data: { companyId, name, slug, provider },
    });
  }

  async connect(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new ConflictException('Esta acción está disponible para instancias Baileys');
    }
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: true } });
    await this.queues.commands.add('connect', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'CONNECTING', instanceId: id };
  }

  async disconnect(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: false } });
    await this.queues.commands.add('disconnect', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'DISCONNECTING', instanceId: id };
  }

  async logout(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: false } });
    await this.queues.commands.add('logout', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'LOGGING_OUT', instanceId: id };
  }

  async update(companyId: string, id: string, data: { name?: string }) {
    await this.getOwned(companyId, id);
    return this.prisma.whatsAppInstance.update({
      where: { id },
      data: { ...(data.name !== undefined ? { name: data.name.trim() } : {}) },
    });
  }

  // Borrado real (no el `active: false` que usan otras entidades) porque esto es para
  // limpiar instancias creadas por error — pero solo si de verdad nunca se usaron: nunca
  // se conectaron y no tienen conversaciones/mensajes/credenciales de API dependiendo de
  // ellas, para no arrastrar en cascada historial real de chat.
  async remove(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    const [conversationCount, messageCount, credentialCount] = await Promise.all([
      this.prisma.conversation.count({ where: { instanceId: id } }),
      this.prisma.message.count({ where: { instanceId: id } }),
      this.prisma.apiCredential.count({ where: { instanceId: id } }),
    ]);
    if (instance.phoneNumber || instance.lastConnectedAt || conversationCount > 0 || messageCount > 0 || credentialCount > 0) {
      throw new ConflictException('Esta instancia ya se usó (se conectó, tiene conversaciones o una credencial de API) y no se puede eliminar. Puedes desactivarla en su lugar.');
    }
    await this.prisma.whatsAppInstance.delete({ where: { id } });
    return { success: true };
  }

  private async getOwned(companyId: string, id: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id, companyId, active: true } });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    return instance;
  }
}
