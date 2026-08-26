import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType, WhatsAppProvider } from '@prisma/client';
import { basename, extname } from 'node:path';
import type { ApiClientContext } from '../common/types/jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';

const MAX_LEGACY_DOCUMENT_BYTES = 48 * 1024 * 1024;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly realtime: RealtimeBus,
    private readonly storage: StorageService,
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

  async sendBase64Document(
    client: ApiClientContext,
    input: { to: string; file: string; fileName: string; caption?: string; instanceSlug?: string },
  ) {
    const parsed = input.file.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    const mimeType = parsed?.[1]?.trim().toLowerCase() || 'application/pdf';
    const encoded = (parsed?.[2] || input.file).replace(/\s+/g, '');
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
      throw new BadRequestException('El documento base64 no es válido');
    }

    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length) throw new BadRequestException('El documento está vacío');
    if (buffer.length > MAX_LEGACY_DOCUMENT_BYTES) {
      throw new BadRequestException('El documento supera el límite de 48 MB');
    }

    let safeName = basename(input.fileName.trim()).replace(/[\u0000-\u001f\u007f]/g, '');
    if (!safeName) safeName = 'documento';
    if (!extname(safeName) && mimeType === 'application/pdf') safeName += '.pdf';
    const extension = extname(safeName).replace('.', '').toLowerCase() || (mimeType === 'application/pdf' ? 'pdf' : 'bin');
    const upload = await this.storage.uploadBuffer(buffer, mimeType, extension);

    return this.sendDocument(client, {
      to: input.to,
      url: upload.internalUrl,
      fileName: safeName,
      mimeType,
      caption: input.caption,
      instanceSlug: input.instanceSlug,
    });
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
