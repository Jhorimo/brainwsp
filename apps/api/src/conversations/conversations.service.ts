import { extname } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InstanceStatus, MessageDirection, MessageStatus, MessageType, UserRole, type ConversationStatus } from '@prisma/client';
import { AgentAccessService } from '../common/services/agent-access.service';
import type { JwtUser } from '../common/types/jwt-user';
import { DealsService } from '../crm/deals.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';

// What the "Responder" quote preview needs to render — both in the composer's reply bar
// and above the quoting message's own bubble.
const quotedMessageSelect = {
  id: true,
  type: true,
  body: true,
  caption: true,
  fileName: true,
  direction: true,
  author: { select: { id: true, name: true, pushName: true } },
} as const;

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
    private readonly agentAccess: AgentAccessService,
    private readonly deals: DealsService,
  ) {}

  // null = no restriction (sees every department, same as today). An array (possibly
  // empty) means "AGENT restricted to these departments + unassigned conversations" —
  // only the AGENT role is ever scoped this way, matching the module-permission gate.
  private async resolveDepartmentRestriction(user: JwtUser): Promise<string[] | null> {
    if (user.role !== UserRole.AGENT) return null;
    const { departmentIds } = await this.agentAccess.getAgentAccess(user.sub);
    return departmentIds;
  }

  async list(user: JwtUser, status?: ConversationStatus) {
    const restriction = await this.resolveDepartmentRestriction(user);
    return this.prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        ...(status ? { status } : {}),
        ...(restriction ? { OR: [{ departmentId: null }, { departmentId: { in: restriction } }] } : {}),
      },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true, notes: true, tags: { select: { tag: true } } } },
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

  async messages(user: JwtUser, conversationId: string) {
    await this.getOwned(user, conversationId);
    const items = await this.prisma.message.findMany({
      where: { companyId: user.companyId, conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: {
        author: { select: { id: true, name: true, pushName: true } },
        reactions: { select: { id: true, emoji: true, fromMe: true, reactorJid: true, contactId: true } },
        quotedMessage: { select: quotedMessageSelect },
      },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
    return items;
  }

  async sendText(user: JwtUser, conversationId: string, text: string, sentByUserId?: string, quotedMessageId?: string) {
    const conversation = await this.getOwned(user, conversationId);
    return this.deliverText(user.companyId, conversation, text, sentByUserId, await this.resolveQuote(user.companyId, conversationId, quotedMessageId));
  }

  // Agent-initiated first contact: no inbound message exists yet, so the Contact/Conversation
  // rows have to be created here instead of by the worker's `persistIncoming`.
  async startConversation(companyId: string, instanceId: string, rawPhone: string, text: string, sentByUserId?: string) {
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

    return this.deliverText(companyId, conversation, text, sentByUserId);
  }

  // A quote only makes sense pointing at a message already in this same conversation —
  // silently drop anything else (stale id from a since-switched chat, cross-conversation id)
  // instead of failing the whole send, since the message itself is still perfectly valid.
  private async resolveQuote(companyId: string, conversationId: string, quotedMessageId?: string) {
    if (!quotedMessageId) return undefined;
    const quoted = await this.prisma.message.findFirst({ where: { id: quotedMessageId, companyId, conversationId }, select: { id: true } });
    return quoted?.id;
  }

  // Shared by `sendText` (ownership already verified by `getOwned`) and `startConversation`
  // (owns it implicitly — it just created/upserted the conversation itself).
  private async deliverText(companyId: string, conversation: { id: string; instanceId: string; contactId: string; aiEnabled: boolean }, text: string, sentByUserId?: string, quotedMessageId?: string) {
    const conversationId = conversation.id;
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
        sentByUserId,
        quotedMessageId,
      },
      include: { quotedMessage: { select: quotedMessageSelect } },
    });
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
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } }, hydrated.departmentId);
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    }
    return message;
  }

  async sendMedia(
    user: JwtUser,
    conversationId: string,
    file: Express.Multer.File,
    caption?: string,
    ptt?: boolean,
    sentByUserId?: string,
    quotedMessageId?: string,
  ) {
    const companyId = user.companyId;
    const type = messageTypeFromMimetype(file.mimetype);
    if (!type) throw new BadRequestException('Tipo de archivo no soportado');

    const conversation = await this.getOwned(user, conversationId);
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
        sentByUserId,
        quotedMessageId: await this.resolveQuote(companyId, conversationId, quotedMessageId),
        ...(type === MessageType.AUDIO && ptt ? { metadata: { ptt: true } } : {}),
      },
      include: { quotedMessage: { select: quotedMessageSelect } },
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
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } }, hydrated.departmentId);
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    }
    return message;
  }

  async sendSticker(user: JwtUser, conversationId: string, stickerId: string, sentByUserId?: string) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
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
        sentByUserId,
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
      void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } }, hydrated.departmentId);
      if (wasAiEnabled) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    }
    return message;
  }

  // No Message row to create here — a reaction rides on an existing one. The actual send
  // (and persisting/broadcasting the result) happens in the worker, mirroring how an incoming
  // reaction is handled; this just validates ownership and hands off the job.
  async sendReaction(user: JwtUser, conversationId: string, messageId: string, emoji: string) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
    const message = await this.prisma.message.findFirst({ where: { id: messageId, companyId, conversationId } });
    if (!message) throw new NotFoundException('Mensaje no encontrado');

    await this.queues.outbound.add('send-reaction', { instanceId: conversation.instanceId, targetMessageId: messageId, emoji }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
    return { success: true };
  }

  async updateMessageFlags(
    user: JwtUser,
    conversationId: string,
    messageId: string,
    data: { pinned?: boolean; starred?: boolean },
  ) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
    const message = await this.prisma.message.findFirst({ where: { id: messageId, companyId, conversationId } });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    const updated = await this.prisma.message.update({ where: { id: messageId }, data });
    void this.realtime.publish(companyId, 'message.updated', updated, conversation.departmentId);
    return updated;
  }

  async forwardMessage(user: JwtUser, conversationId: string, messageId: string, targetConversationId: string, sentByUserId?: string) {
    const companyId = user.companyId;
    await this.getOwned(user, conversationId);
    const source = await this.prisma.message.findFirst({ where: { id: messageId, companyId, conversationId } });
    if (!source) throw new NotFoundException('Mensaje no encontrado');
    const target = await this.getOwned(user, targetConversationId);

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
        sentByUserId,
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
    if (hydrated) void this.realtime.publish(companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } }, hydrated.departmentId);
    return message;
  }

  async updateContactNotes(user: JwtUser, conversationId: string, notes: string) {
    const conversation = await this.getOwned(user, conversationId);
    await this.prisma.contact.update({ where: { id: conversation.contactId }, data: { notes } });
    return { notes };
  }

  async addContactTag(user: JwtUser, conversationId: string, tagId: string) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, companyId } });
    if (!tag) throw new NotFoundException('Etiqueta no encontrada');
    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: conversation.contactId, tagId } },
      update: {},
      create: { contactId: conversation.contactId, tagId },
    });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    return hydrated;
  }

  async removeContactTag(user: JwtUser, conversationId: string, tagId: string) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
    await this.prisma.contactTag.deleteMany({ where: { contactId: conversation.contactId, tagId } });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    return hydrated;
  }

  async updateStage(user: JwtUser, conversationId: string, stageId: string | null | undefined) {
    const companyId = user.companyId;
    const conversation = await this.getOwned(user, conversationId);
    if (stageId) {
      // A stage only makes sense within its own department's pipeline — reject silently
      // mismatched stage/department combinations rather than storing a dangling reference.
      const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, companyId } });
      if (!stage) throw new NotFoundException('Etapa no encontrada');
      if (stage.departmentId !== conversation.departmentId) throw new BadRequestException('Esa etapa no pertenece al departamento de esta conversación');
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { stageId: stageId || null } });
    const hydrated = await this.getHydrated(companyId, conversationId);
    if (hydrated) void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
    void this.deals.syncStageFromConversation(companyId, conversationId, stageId || null);
    return hydrated;
  }

  async update(
    user: JwtUser,
    conversationId: string,
    data: { status?: ConversationStatus; assignedUserId?: string | null; departmentId?: string | null; projectId?: string | null; pinned?: boolean; aiEnabled?: boolean },
  ) {
    const companyId = user.companyId;
    const current = await this.getOwned(user, conversationId);
    if (data.assignedUserId) {
      const assignee = await this.prisma.user.findFirst({ where: { id: data.assignedUserId, companyId, active: true } });
      if (!assignee) throw new NotFoundException('Agente no encontrado');
    }

    // Al asignar un agente sin indicar departamento a la vez, hereda el departamento del
    // agente — solo si pertenece a exactamente uno (si tiene varios o ninguno, se deja la
    // asignación manual tal cual, sin adivinar).
    let resolvedDepartmentId = data.departmentId;
    if (data.assignedUserId && resolvedDepartmentId === undefined) {
      const memberships = await this.prisma.departmentUser.findMany({ where: { userId: data.assignedUserId }, select: { departmentId: true } });
      if (memberships.length === 1) resolvedDepartmentId = memberships[0].departmentId;
    }

    if (resolvedDepartmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: resolvedDepartmentId, companyId, active: true } });
      if (!department) throw new NotFoundException('Departamento no encontrado');
    }
    if (data.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: data.projectId, companyId, active: true } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
    }
    // La etapa pertenece al pipeline del departamento anterior — al cambiar de
    // departamento, se reemplaza por la primera etapa del nuevo (o ninguna si no tiene).
    const departmentChanged = resolvedDepartmentId !== undefined && resolvedDepartmentId !== current.departmentId;
    let nextStageId: string | null | undefined;
    if (departmentChanged) {
      nextStageId = resolvedDepartmentId
        ? (await this.prisma.pipelineStage.findFirst({ where: { departmentId: resolvedDepartmentId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }))?.id ?? null
        : null;
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...data,
        ...(resolvedDepartmentId !== undefined ? { departmentId: resolvedDepartmentId } : {}),
        ...(departmentChanged ? { stageId: nextStageId } : {}),
      },
    });
    const hydrated = await this.getHydrated(companyId, conversationId);
    // Notify both the old and new department rooms so an agent watching either side
    // of a reassignment sees the conversation appear/disappear from their list live.
    if (hydrated) {
      void this.realtime.publish(companyId, 'conversation.updated', hydrated, hydrated.departmentId);
      if (departmentChanged) void this.realtime.publish(companyId, 'conversation.updated', hydrated, current.departmentId);
    }
    if (departmentChanged) void this.deals.syncStageFromConversation(companyId, conversationId, nextStageId ?? null);
    return hydrated;
  }

  private async getOwned(user: JwtUser, id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, companyId: user.companyId } });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');
    const restriction = await this.resolveDepartmentRestriction(user);
    if (restriction && conversation.departmentId && !restriction.includes(conversation.departmentId)) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return conversation;
  }

  private getHydrated(companyId: string, id: string) {
    return this.prisma.conversation.findFirst({
      where: { id, companyId },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true, notes: true, tags: { select: { tag: true } } } },
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
