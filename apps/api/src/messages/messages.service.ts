import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType, WhatsAppProvider } from '@prisma/client';
import type { ApiClientContext } from '../common/types/jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RealtimeBus } from '../realtime/realtime.bus';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly realtime: RealtimeBus,
  ) {}

  async sendText(client: ApiClientContext, to: string, message: string, instanceSlug?: string) {
    const context = await this.resolveContext(client, to, instanceSlug);
    const record = await this.prisma.message.create({
      data: {
        companyId: client.companyId,
        instanceId: context.instance.id,
        contactId: context.contact.id,
        conversationId: context.conversation.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.QUEUED,
        body: message,
      },
    });

    await this.prisma.conversation.update({
      where: { id: context.conversation.id },
      data: { lastMessageAt: new Date() },
    });

    await this.queues.outbound.add('send-text', { messageId: record.id }, {
      jobId: record.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    await this.emitQueued(client.companyId, context.conversation.id, record);
    return this.accepted(record.id, context.instance.slug);
  }

  async sendDocument(
    client: ApiClientContext,
    input: { to: string; url: string; fileName: string; mimeType?: string; caption?: string; instanceSlug?: string },
  ) {
    const context = await this.resolveContext(client, input.to, input.instanceSlug);
    const record = await this.prisma.message.create({
      data: {
        companyId: client.companyId,
        instanceId: context.instance.id,
        contactId: context.contact.id,
        conversationId: context.conversation.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.DOCUMENT,
        status: MessageStatus.QUEUED,
        mediaUrl: input.url,
        fileName: input.fileName,
        mimeType: input.mimeType || 'application/pdf',
        caption: input.caption,
      },
    });

    await this.prisma.conversation.update({
      where: { id: context.conversation.id },
      data: { lastMessageAt: new Date() },
    });

    await this.queues.outbound.add('send-document', { messageId: record.id }, {
      jobId: record.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    await this.emitQueued(client.companyId, context.conversation.id, record);
    return this.accepted(record.id, context.instance.slug);
  }

  async status(client: ApiClientContext, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: client.companyId },
      select: { id: true, status: true, error: true, sentAt: true, deliveredAt: true, readAt: true, createdAt: true },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    return message;
  }

  private accepted(messageId: string, instance: string) {
    return {
      success: true,
      message_id: messageId,
      status: 'queued',
      instance,
    };
  }

  private async resolveContext(client: ApiClientContext, rawTo: string, instanceSlug?: string) {
    const instance = client.instanceId
      ? await this.prisma.whatsAppInstance.findFirst({ where: { id: client.instanceId, companyId: client.companyId, active: true } })
      : instanceSlug
        ? await this.prisma.whatsAppInstance.findFirst({ where: { companyId: client.companyId, slug: instanceSlug, active: true } })
        : await this.prisma.whatsAppInstance.findFirst({ where: { companyId: client.companyId, active: true }, orderBy: { createdAt: 'asc' } });

    if (!instance) throw new BadRequestException('No existe una instancia de WhatsApp disponible para esta credencial');
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new BadRequestException('El provider META_CLOUD está reservado para la siguiente fase y todavía no puede enviar mensajes');
    }

    const phone = rawTo.replace(/[^0-9]/g, '');
    if (phone.length < 8) throw new BadRequestException('Número de destino inválido');
    const waId = `${phone}@s.whatsapp.net`;

    const contact = await this.prisma.contact.upsert({
      where: { companyId_waId: { companyId: client.companyId, waId } },
      update: { phone },
      create: { companyId: client.companyId, waId, phone },
    });

    const conversation = await this.prisma.conversation.upsert({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: contact.id } },
      update: { lastMessageAt: new Date() },
      create: {
        companyId: client.companyId,
        instanceId: instance.id,
        contactId: contact.id,
      },
    });

    return { instance, contact, conversation };
  }

  private async emitQueued(companyId: string, conversationId: string, message: unknown) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    if (conversation) void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...conversation, messages: [message] } }, conversation.departmentId);
  }
}
