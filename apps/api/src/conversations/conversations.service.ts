import { extname } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InstanceStatus, MessageDirection, MessageStatus, MessageType, type ConversationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';

function messageTypeFromMimetype(mimetype: string): MessageType | null {
  if (mimetype === 'image/webp') return MessageType.STICKER;
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
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true, tags: { select: { tag: true } } } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true } },
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
      include: {
        author: { select: { id: true, name: true, pushName: true } },
        reactions: { select: { id: true, emoji: true, fromMe: true, reactorJid: true, contactId: true } },
      },
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
    // A human agent sending anything is the handoff signal — hand control back from the AI.
    const wasAiEnabled = conversation.aiEnabled;
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), ...(wasAiEnabled ? { aiEnabled: false } : {}) } });
    await this.queues.outbound.add('send-text', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) {
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    }
    return message;
  }

  // Agent-initiated first contact: no inbound message exists yet, so the Contact/Conversation
  // rows have to be created here instead of by the worker's `persistIncoming`.
  async startConversation(companyId: string, instanceId: string, rawPhone: string, text: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id: instanceId, companyId, active: true } });
    if (!instance) throw new NotFoundException('Instancia de WhatsApp no encontrada');
    if (instance.status !== InstanceStatus.CONNECTED) throw new BadRequestException('La instancia de WhatsApp no está conectada');

    const phone = rawPhone.replace(/[^0-9]/g, '');
    if (phone.length < 8) throw new BadRequestException('Número de destino inválido');
    const waId = `${phone}@s.whatsapp.net`;

    const contact = await this.prisma.contact.upsert({
      where: { companyId_waId: { companyId, waId } },
      update: { phone },
      create: { companyId, waId, phone },
    });

    const conversation = await this.prisma.conversation.upsert({
      where: { instanceId_contactId: { instanceId, contactId: contact.id } },
      update: {},
      create: { companyId, instanceId, contactId: contact.id },
    });

    return this.sendText(companyId, conversation.id, text);
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
    const wasAiEnabled = conversation.aiEnabled;
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), ...(wasAiEnabled ? { aiEnabled: false } : {}) } });
    await this.queues.outbound.add('send-media', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) {
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    }
    return message;
  }

  async sendSticker(companyId: string, conversationId: string, stickerId: string) {
    const conversation = await this.getOwned(companyId, conversationId);
    const sticker = await this.prisma.stickerItem.findFirst({ where: { id: stickerId, companyId } });
    if (!sticker) throw new NotFoundException('Sticker no encontrado');

    const message = await this.prisma.message.create({
      data: {
        companyId,
        conversationId,
        instanceId: conversation.instanceId,
        contactId: conversation.contactId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.STICKER,
        status: MessageStatus.QUEUED,
        mimeType: 'image/webp',
        mediaUrl: sticker.mediaUrl,
      },
    });
    const wasAiEnabled = conversation.aiEnabled;
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), ...(wasAiEnabled ? { aiEnabled: false } : {}) } });
    await this.queues.outbound.add('send-media', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) {
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    }
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

  async addContactTag(companyId: string, conversationId: string, tagId: string) {
    const conversation = await this.getOwned(companyId, conversationId);
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, companyId } });
    if (!tag) throw new NotFoundException('Etiqueta no encontrada');
    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: conversation.contactId, tagId } },
      update: {},
      create: { contactId: conversation.contactId, tagId },
    });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    return hydrated;
  }

  async removeContactTag(companyId: string, conversationId: string, tagId: string) {
    const conversation = await this.getOwned(companyId, conversationId);
    await this.prisma.contactTag.deleteMany({ where: { contactId: conversation.contactId, tagId } });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    return hydrated;
  }

  async updateStage(companyId: string, conversationId: string, stageId: string | null | undefined) {
    const conversation = await this.getOwned(companyId, conversationId);
    if (stageId) {
      // A stage only makes sense within its own department's pipeline — reject silently
      // mismatched stage/department combinations rather than storing a dangling reference.
      const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, companyId } });
      if (!stage) throw new NotFoundException('Etapa no encontrada');
      if (stage.departmentId !== conversation.departmentId) throw new BadRequestException('Esa etapa no pertenece al departamento de esta conversación');
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { stageId: stageId || null } });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated);
    return hydrated;
  }

  async update(
    companyId: string,
    conversationId: string,
    data: { status?: ConversationStatus; assignedUserId?: string | null; departmentId?: string | null; projectId?: string | null; pinned?: boolean; aiEnabled?: boolean },
  ) {
    const current = await this.getOwned(companyId, conversationId);
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
    // The stage belongs to the old department's pipeline — carrying it over to a
    // different department would leave it pointing at a stage that no longer applies.
    const departmentChanged = data.departmentId !== undefined && data.departmentId !== current.departmentId;
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { ...data, ...(departmentChanged ? { stageId: null } : {}) } });
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
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true, tags: { select: { tag: true } } } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true } },
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
