import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class InstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  list(companyId: string) {
    return this.prisma.whatsAppInstance.findMany({
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
  }

  async create(companyId: string, name: string, slug: string, provider = WhatsAppProvider.BAILEYS) {
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

  private async getOwned(companyId: string, id: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id, companyId, active: true } });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    return instance;
  }
}
