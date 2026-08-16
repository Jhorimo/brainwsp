import { extname } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType, type ConversationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';

function messageTypeFromMimetype(mimetype: string): MessageType | null {
  if (mimetype.startsWith('image/')) return MessageType.IMAGE;
  if (mimetype.startsWith('video/')) return MessageType.VIDEO;
  if (mimetype.startsWith('audio/')) return MessageType.AUDIO;
  if (mimetype === 'application/pdf' || mimetype.startsWith('application/')) return MessageType.DOCUMENT;
  return null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly realtime: RealtimeBus,
    private readonly storage: StorageService,
  ) {}

  list(companyId: string, status?: ConversationStatus) {
    return this.prisma.conversation.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, body: true, caption: true, type: true, direction: true, status: true, createdAt: true, author: { select: { id: true, name: true, pushName: true } } },
        },
      },
      orderBy: [{ pinned: 'desc' }, { lastMessageAt: 'desc' }],
      take: 100,
    });
  }

  async messages(companyId: string, conversationId: string) {
    await this.getOwned(companyId, conversationId);
    const items = await this.prisma.message.findMany({
      where: { companyId, conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: { author: { select: { id: true, name: true, pushName: true } } },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
    return items;
  }

  async sendText(companyId: string, conversationId: string, text: string) {
    const conversation = await this.getOwned(companyId, conversationId);
    const message = await this.prisma.message.create({
      data: {
        companyId,
        conversationId,
        instanceId: conversation.instanceId,
        contactId: conversation.contactId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.QUEUED,
        body: text,
      },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    await this.queues.outbound.add('send-text', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
    return message;
  }

  async sendMedia(
    companyId: string,
    conversationId: string,
    file: Express.Multer.File,
    caption?: string,
    ptt?: boolean,
  ) {
    const type = messageTypeFromMimetype(file.mimetype);
    if (!type) throw new BadRequestException('Tipo de archivo no soportado');

    const conversation = await this.getOwned(companyId, conversationId);
    const { internalUrl } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));

    const message = await this.prisma.message.create({
      data: {
        companyId,
        conversationId,
        instanceId: conversation.instanceId,
        contactId: conversation.contactId,
        direction: MessageDirection.OUTBOUND,
        type,
        status: MessageStatus.QUEUED,
        caption: caption || undefined,
        fileName: file.originalname,
        mimeType: file.mimetype,
        mediaUrl: internalUrl,
        ...(type === MessageType.AUDIO && ptt ? { metadata: { ptt: true } } : {}),
      },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    await this.queues.outbound.add('send-media', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
    return message;
  }

  async updateMessageFlags(
    companyId: string,
    conversationId: string,
    messageId: string,
    data: { pinned?: boolean; starred?: boolean },
  ) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, companyId, conversationId } });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    const updated = await this.prisma.message.update({ where: { id: messageId }, data });
    void this.realtime.publish(companyId, 'message.updated', updated);
    return updated;
  }

  async forwardMessage(companyId: string, conversationId: string, messageId: string, targetConversationId: string) {
    const source = await this.prisma.message.findFirst({ where: { id: messageId, companyId, conversationId } });
    if (!source) throw new NotFoundException('Mensaje no encontrado');
    const target = await this.getOwned(companyId, targetConversationId);

    const message = await this.prisma.message.create({
      data: {
        companyId,
        conversationId: target.id,
        instanceId: target.instanceId,
        contactId: target.contactId,
        direction: MessageDirection.OUTBOUND,
        type: source.type,
        status: MessageStatus.QUEUED,
        body: source.body,
        caption: source.caption,
        fileName: source.fileName,
        mimeType: source.mimeType,
        mediaUrl: source.mediaUrl,
      },
    });
    await this.prisma.conversation.update({ where: { id: target.id }, data: { lastMessageAt: new Date() } });
    await this.queues.outbound.add(source.mediaUrl ? 'send-media' : 'send-text', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, target.id);
    if (hydrated) void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
    return message;
  }

  async updateContactNotes(companyId: string, conversationId: string, notes: string) {
    const conversation = await this.getOwned(companyId, conversationId);
    await this.prisma.contact.update({ where: { id: conversation.contactId }, data: { notes } });
    return { notes };
  }

  async update(
    companyId: string,
    conversationId: string,
    data: { status?: ConversationStatus; assignedUserId?: string | null; departmentId?: string | null; projectId?: string | null; pinned?: boolean },
  ) {
    await this.getOwned(companyId, conversationId);
    if (data.assignedUserId) {
      const user = await this.prisma.user.findFirst({ where: { id: data.assignedUserId, companyId, active: true } });
      if (!user) throw new NotFoundException('Agente no encontrado');
    }
    if (data.departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: data.departmentId, companyId, active: true } });
      if (!department) throw new NotFoundException('Departamento no encontrado');
    }
    if (data.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: data.projectId, companyId, active: true } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    return hydrated;
  }

  private async getOwned(companyId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, companyId } });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');
    return conversation;
  }

  private getHydrated(companyId: string, id: string) {
    return this.prisma.conversation.findFirst({
      where: { id, companyId },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, body: true, caption: true, type: true, direction: true, status: true, createdAt: true, author: { select: { id: true, name: true, pushName: true } } },
        },
      },
    });
  }
}
