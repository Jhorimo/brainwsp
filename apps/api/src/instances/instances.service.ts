import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InstanceStatus, MessageDirection, WhatsAppProvider } from '@prisma/client';
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
    // No bloquea una sesión ya conectada (esta ruta solo se llama para conectar/reconectar) —
    // ver el comentario en "Mi Plan" del plan de implementación: solo se corta la posibilidad
    // de conectar algo nuevo, no lo que ya estaba andando.
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { licenseRenewsAt: true } });
    if (company?.licenseRenewsAt && company.licenseRenewsAt < new Date()) {
      const formatted = company.licenseRenewsAt.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
      throw new ForbiddenException(`Tu plan venció el ${formatted} — actualiza tu plan en "Mi Plan" para volver a conectar tu WhatsApp.`);
    }

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

  // One-off resync for contacts whose cached avatar went stale before the contacts.update
  // listener existed to keep it current — see SessionManager.forceRefreshAvatars.
  async refreshAvatars(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.queues.commands.add('refresh-avatars', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, instanceId: id };
  }

  async update(companyId: string, id: string, data: { name?: string; slug?: string }) {
    await this.getOwned(companyId, id);
    if (data.slug !== undefined) {
      const existing = await this.prisma.whatsAppInstance.findUnique({
        where: { companyId_slug: { companyId, slug: data.slug } },
      });
      if (existing && existing.id !== id) throw new ConflictException('Ya existe una instancia con ese slug');
    }
    return this.prisma.whatsAppInstance.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
      },
    });
  }

  // Si la instancia nunca se conectó ni tiene historial, se borra de verdad (limpieza de
  // instancias creadas por error). Si ya se usó, no la borramos en cascada — se archiva
  // (`active: false`, igual que otras entidades) para conservar conversaciones/mensajes
  // reales; `list()` ya filtra por `active: true` así que desaparece del panel igual.
  // Una credencial de API vinculada sí bloquea ambos casos: hay que eliminarla primero
  // desde "API e integraciones" para no romper la integración externa en silencio.
  async remove(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    const [conversationCount, messageCount, credentialCount] = await Promise.all([
      this.prisma.conversation.count({ where: { instanceId: id } }),
      this.prisma.message.count({ where: { instanceId: id } }),
      this.prisma.apiCredential.count({ where: { instanceId: id } }),
    ]);
    if (credentialCount > 0) {
      throw new ConflictException('Esta instancia tiene una credencial de API vinculada. Elimínala primero en "API e integraciones" y luego podrás quitar la instancia.');
    }

    const everUsed = Boolean(instance.phoneNumber || instance.lastConnectedAt || conversationCount > 0 || messageCount > 0);
    if (everUsed) {
      if (instance.status !== InstanceStatus.DISCONNECTED && instance.status !== InstanceStatus.LOGGED_OUT) {
        await this.queues.commands.add('logout', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
      }
      await this.prisma.whatsAppInstance.update({ where: { id }, data: { active: false, autoConnect: false } });
      return { success: true, archived: true };
    }

    await this.prisma.whatsAppInstance.delete({ where: { id } });
    return { success: true, archived: false };
  }

  private async getOwned(companyId: string, id: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id, companyId, active: true } });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    return instance;
  }
}
