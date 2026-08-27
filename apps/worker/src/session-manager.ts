import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import {
  InstanceStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  type PrismaClient,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import { usePrismaAuthState } from './auth-state.js';
import { maybeReplyWithAi } from './ai-agent.js';
import { extensionFromMime, extractMessage, jidToPhone } from './message-utils.js';
import type { RealtimePublisher } from './realtime.js';
import { uploadBuffer } from './storage.js';

const LEASE_TTL_MS = 30_000;
const LEASE_RENEW_MS = 10_000;

export class SessionManager {
  private readonly sockets = new Map<string, WASocket>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly leaseTimers = new Map<string, NodeJS.Timeout>();
  private readonly manualStops = new Set<string>();
  private readonly leaseLost = new Set<string>();
  private readonly redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly realtime: RealtimePublisher,
    private readonly logger: Logger,
    private readonly outboundQueue: Queue,
  ) {}

  async bootstrap() {
    const instances = await this.prisma.whatsAppInstance.findMany({
      where: {
        active: true,
        autoConnect: true,
        provider: 'BAILEYS',
        status: { notIn: [InstanceStatus.LOGGED_OUT] },
      },
      select: { id: true },
    });

    for (const instance of instances) {
      void this.connect(instance.id).catch((error) => this.logger.error({ err: error, instanceId: instance.id }, 'bootstrap connect failed'));
    }
  }

  getSocket(instanceId: string) {
    return this.sockets.get(instanceId);
  }

  async ensureConnected(instanceId: string, timeoutMs = 15_000): Promise<WASocket> {
    const currentState = await this.prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { status: true },
    });
    const existing = this.sockets.get(instanceId);
    if (existing && currentState?.status === InstanceStatus.CONNECTED) return existing;

    if (!existing) await this.connect(instanceId);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const socket = this.sockets.get(instanceId);
      const instance = await this.prisma.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { status: true },
      });
      if (socket && instance?.status === InstanceStatus.CONNECTED) return socket;
      if (instance?.status === InstanceStatus.QR_PENDING) throw new Error('WhatsApp requiere escanear el QR antes de enviar');
      if (instance?.status === InstanceStatus.LOGGED_OUT) throw new Error('La sesión de WhatsApp fue cerrada; genera un QR nuevo');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('WhatsApp aún no está conectado; el mensaje será reintentado');
  }

  async connect(instanceId: string) {
    if (this.sockets.has(instanceId)) return;
    this.manualStops.delete(instanceId);

    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
    if (!instance?.active || !instance.autoConnect || instance.provider !== 'BAILEYS') return;

    const hasLease = await this.ensureLease(instanceId);
    if (!hasLease) {
      this.logger.info({ instanceId }, 'instance owned by another worker');
      return;
    }

    await this.setInstanceState(instanceId, InstanceStatus.CONNECTING, { lastError: null });
    const auth = await usePrismaAuthState(this.prisma, instanceId);
    const childLogger = this.logger.child({ instanceId });

    // An outdated WA Web protocol version is the classic cause of messages
    // arriving on the recipient's device stuck on "Esperando este mensaje":
    // their client questions a message signed with a version it no longer
    // trusts. Falls back to the version bundled with Baileys if offline.
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    const socket = makeWASocket({
      auth: {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, childLogger as never),
      },
      version,
      logger: childLogger as never,
      browser: Browsers.macOS('Google Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const stored = await this.prisma.message.findUnique({
          where: { instanceId_waMessageId: { instanceId, waMessageId: key.id } },
          select: { metadata: true },
        });
        const rawContent = (stored?.metadata as { rawContent?: string } | null)?.rawContent;
        if (!rawContent) return undefined;
        return JSON.parse(rawContent, BufferJSON.reviver) as proto.IMessage;
      },
    });

    this.sockets.set(instanceId, socket);
    socket.ev.on('creds.update', auth.saveCreds);

    socket.ev.on('connection.update', async (update) => {
      if (update.qr) {
        await this.setInstanceState(instanceId, InstanceStatus.QR_PENDING, { qr: update.qr, lastError: null });
      }

      if (update.connection === 'open') {
        const jid = socket.user?.id || '';
        const phoneNumber = jidToPhone(jid) || jid.split(':')[0]?.replace(/\D/g, '') || null;
        await this.prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: {
            status: InstanceStatus.CONNECTED,
            qr: null,
            phoneNumber,
            displayName: socket.user?.name || null,
            reconnectAttempt: 0,
            lastError: null,
            lastConnectedAt: new Date(),
          },
        });
        await this.emitInstance(instanceId);
        childLogger.info({ phoneNumber }, 'WhatsApp connected');
        this.backfillAvatars(instanceId, socket).catch((error) => {
          childLogger.warn({ err: error }, 'avatar backfill failed');
        });
      }

      if (update.connection === 'close') {
        this.sockets.delete(instanceId);
        const statusCode = this.disconnectCode(update.lastDisconnect?.error);
        const manual = this.manualStops.has(instanceId);
        if (this.leaseLost.delete(instanceId)) {
          childLogger.warn('socket closed after Redis lease ownership was lost');
          return;
        }

        if (manual) {
          await this.setInstanceState(instanceId, InstanceStatus.DISCONNECTED, {
            qr: null,
            lastDisconnectedAt: new Date(),
          });
          await this.releaseLease(instanceId);
          return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          await this.setInstanceState(instanceId, InstanceStatus.LOGGED_OUT, {
            qr: null,
            lastError: 'WhatsApp cerró la sesión. Se requiere volver a vincular el dispositivo.',
            lastDisconnectedAt: new Date(),
          });
          await this.releaseLease(instanceId);
          return;
        }

        if (statusCode === DisconnectReason.connectionReplaced) {
          await this.setInstanceState(instanceId, InstanceStatus.ERROR, {
            qr: null,
            lastError: 'La conexión fue reemplazada por otra sesión activa.',
            lastDisconnectedAt: new Date(),
          });
          await this.releaseLease(instanceId);
          return;
        }

        await this.scheduleReconnect(instanceId, statusCode);
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        await this.persistIncoming(instanceId, message, socket).catch((error) => {
          childLogger.error({ err: error, messageId: message.key.id }, 'failed to persist incoming message');
        });
      }
    });

    socket.ev.on('messages.reaction', async (reactions) => {
      for (const { key, reaction } of reactions) {
        await this.persistReaction(instanceId, key, reaction).catch((error) => {
          childLogger.error({ err: error, messageId: key.id }, 'failed to persist reaction');
        });
      }
    });

    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (!update.key.id || typeof update.update.status !== 'number') continue;
        const status = this.mapBaileysStatus(update.update.status);
        if (!status) continue;
        const now = new Date();
        const data = status === MessageStatus.READ
          ? { status, readAt: now, deliveredAt: now, sentAt: now }
          : status === MessageStatus.DELIVERED
            ? { status, deliveredAt: now, sentAt: now }
            : { status, sentAt: now };
        const changed = await this.prisma.message.updateMany({
          where: { instanceId, waMessageId: update.key.id },
          data,
        });
        if (changed.count) {
          const instanceData = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId }, select: { companyId: true } });
          if (instanceData) await this.realtime.publish(instanceData.companyId, 'message.updated', { waMessageId: update.key.id, status });
        }
      }
    });
  }

  async disconnect(instanceId: string) {
    this.manualStops.add(instanceId);
    this.clearReconnectTimer(instanceId);
    const socket = this.sockets.get(instanceId);
    this.sockets.delete(instanceId);
    if (socket) socket.end(new Error('manual disconnect'));
    await this.setInstanceState(instanceId, InstanceStatus.DISCONNECTED, { qr: null, lastDisconnectedAt: new Date() });
    await this.releaseLease(instanceId);
  }

  async logout(instanceId: string) {
    this.manualStops.add(instanceId);
    this.clearReconnectTimer(instanceId);
    const socket = this.sockets.get(instanceId);
    this.sockets.delete(instanceId);
    try {
      if (socket) await socket.logout();
    } catch (error) {
      this.logger.warn({ err: error, instanceId }, 'logout returned an error; local auth will still be cleared');
    }
    const auth = await usePrismaAuthState(this.prisma, instanceId);
    await auth.clear();
    await this.setInstanceState(instanceId, InstanceStatus.LOGGED_OUT, {
      qr: null,
      phoneNumber: null,
      displayName: null,
      reconnectAttempt: 0,
      lastDisconnectedAt: new Date(),
      lastError: null,
    });
    await this.releaseLease(instanceId);
  }

  async close() {
    for (const instanceId of this.sockets.keys()) {
      this.manualStops.add(instanceId);
      this.sockets.get(instanceId)?.end(new Error('worker shutdown'));
      await this.releaseLease(instanceId);
    }
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    for (const timer of this.leaseTimers.values()) clearInterval(timer);
    this.reconnectTimers.clear();
    this.leaseTimers.clear();
    await this.redis.quit();
  }

  private async persistIncoming(instanceId: string, message: WAMessage, socket: WASocket) {
    if (message.key.fromMe || !message.key.remoteJid || !message.key.id || !message.message) return;
    // Reactions and protocol envelopes (revokes, edits, app-state sync notices) ride the
    // same `messages.upsert` stream as real messages. Reactions are already handled by the
    // dedicated `messages.reaction` event above (see persistReaction); neither carries real
    // chat content, so without this guard they fell through `extractMessage` to
    // MessageType.UNKNOWN and showed up as an empty "UNKNOWN" bubble in the chat.
    if (message.message.reactionMessage || message.message.protocolMessage) return;
    const remoteJid = message.key.remoteJid;
    if (remoteJid === 'status@broadcast') return;

    // Baileys can re-emit the same message after a reconnect/history sync.
    // Check idempotency before incrementing unread counters or publishing realtime events.
    const alreadyStored = await this.prisma.message.findUnique({
      where: { instanceId_waMessageId: { instanceId, waMessageId: message.key.id } },
      select: { id: true },
    });
    if (alreadyStored) return;

    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
    if (!instance) return;

    const isGroup = remoteJid.endsWith('@g.us');

    // For a group, `remoteJid` is the group's own JID and the conversation's "contact"
    // is the group itself; `message.pushName` here belongs to whoever sent this specific
    // message, not the group, so it must never be written onto the group's Contact row.
    let groupSubject: string | undefined;
    if (isGroup) {
      const existingGroup = await this.prisma.contact.findUnique({
        where: { companyId_waId: { companyId: instance.companyId, waId: remoteJid } },
        select: { name: true },
      });
      if (!existingGroup?.name) {
        try {
          const metadata = await socket.groupMetadata(remoteJid);
          groupSubject = metadata.subject;
        } catch (error) {
          this.logger.warn({ err: error, remoteJid }, 'failed to fetch group metadata');
        }
      }
    }

    // WhatsApp's privacy rollout can route 1:1 chats through an opaque `@lid`
    // remoteJid instead of the phone-number JID, and can alternate between the
    // two for the same real contact from one message to the next. Baileys
    // reports the phone-number JID in `key.remoteJidAlt` for those messages —
    // use it as the identity key (not just to backfill `phone`) so both forms
    // resolve to the same Contact/Conversation instead of silently forking
    // into two separate threads for the same person.
    const identityJid = !isGroup && remoteJid.endsWith('@lid') && message.key.remoteJidAlt ? message.key.remoteJidAlt : remoteJid;
    const phone = jidToPhone(identityJid);
    const contact = await this.prisma.contact.upsert({
      where: { companyId_waId: { companyId: instance.companyId, waId: identityJid } },
      update: isGroup
        ? { lastSeenAt: new Date(), ...(groupSubject ? { name: groupSubject, pushName: groupSubject } : {}) }
        : { phone: phone || undefined, pushName: message.pushName || undefined, lastSeenAt: new Date() },
      create: isGroup
        ? { companyId: instance.companyId, waId: identityJid, name: groupSubject || null, pushName: groupSubject || null, lastSeenAt: new Date() }
        : { companyId: instance.companyId, waId: identityJid, phone, pushName: message.pushName || null, name: message.pushName || null, lastSeenAt: new Date() },
    });
    this.refreshAvatar(socket, contact.id, remoteJid, contact.avatarUrl);

    // In a group, `key.participant` is the actual sender — track them as their own
    // Contact so the UI can show who wrote each message, distinct from the group itself.
    let authorContactId: string | undefined;
    if (isGroup && message.key.participant) {
      const participantJid = message.key.participant;
      const participantPhone = jidToPhone(participantJid) || (message.key.participantAlt ? jidToPhone(message.key.participantAlt) : null);
      const author = await this.prisma.contact.upsert({
        where: { companyId_waId: { companyId: instance.companyId, waId: participantJid } },
        update: { phone: participantPhone || undefined, pushName: message.pushName || undefined, lastSeenAt: new Date() },
        create: { companyId: instance.companyId, waId: participantJid, phone: participantPhone, pushName: message.pushName || null, name: message.pushName || null, lastSeenAt: new Date() },
      });
      authorContactId = author.id;
      this.refreshAvatar(socket, author.id, participantJid, author.avatarUrl);
    }

    // `upsert` can't tell us whether this was a brand-new conversation — and only a truly
    // new one (a real prospect's first message) should spawn a Lead in the CRM inbox below.
    const existingConversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId, contactId: contact.id } },
      select: { id: true },
    });
    const conversation = existingConversation
      ? await this.prisma.conversation.update({
          where: { id: existingConversation.id },
          data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
        })
      : await this.prisma.conversation.create({
          data: {
            companyId: instance.companyId,
            instanceId,
            contactId: contact.id,
            unreadCount: 1,
            lastMessageAt: new Date(),
          },
        });

    // Cliente nuevo escribiendo por primera vez = prospecto entrante. Los grupos no son
    // prospectos de venta, así que se excluyen. Sin departamento todavía — un agente lo
    // asigna al revisar la conversación (ver ConversationsService.update, que además hereda
    // el departamento del agente asignado hacia la propia conversación).
    if (!existingConversation && !isGroup) {
      const lead = await this.prisma.lead.create({
        data: {
          companyId: instance.companyId,
          title: contact.name || contact.pushName || contact.phone || 'Prospecto de WhatsApp',
          personName: contact.name || contact.pushName || undefined,
          personPhone: contact.phone || undefined,
          channel: 'whatsapp',
          contactId: contact.id,
          conversationId: conversation.id,
        },
      });
      await this.realtime.publish(instance.companyId, 'lead.created', lead);
    }

    const content = extractMessage(message);

    // The contact replied to one of our messages from their phone — resolve WhatsApp's
    // `stanzaId` back to our own Message row so the panel shows the same quote WhatsApp does.
    // Nothing to resolve for a reply to a message this instance has never seen (e.g. the
    // history predates this deployment), so it's left unquoted rather than failing the whole
    // inbound message.
    let quotedMessageId: string | undefined;
    if (content.quotedStanzaId) {
      const quoted = await this.prisma.message.findUnique({
        where: { instanceId_waMessageId: { instanceId, waMessageId: content.quotedStanzaId } },
        select: { id: true },
      });
      quotedMessageId = quoted?.id;
    }

    let mediaUrl: string | undefined;
    const downloadableTypes: MessageType[] = [MessageType.IMAGE, MessageType.VIDEO, MessageType.AUDIO, MessageType.DOCUMENT, MessageType.STICKER];
    if (downloadableTypes.includes(content.type)) {
      try {
        const buffer = await downloadMediaMessage(message, 'buffer', {}, {
          logger: this.logger as never,
          reuploadRequest: socket.updateMediaMessage,
        });
        const uploaded = await uploadBuffer(buffer, content.mimeType || 'application/octet-stream', extensionFromMime(content.mimeType));
        mediaUrl = uploaded.internalUrl;
      } catch (error) {
        this.logger.warn({ err: error, messageId: message.key.id }, 'failed to download inbound media');
      }
    }

    const created = await this.prisma.message.upsert({
      where: { instanceId_waMessageId: { instanceId, waMessageId: message.key.id } },
      update: {},
      create: {
        companyId: instance.companyId,
        conversationId: conversation.id,
        instanceId,
        contactId: contact.id,
        authorContactId,
        waMessageId: message.key.id,
        direction: MessageDirection.INBOUND,
        type: content.type,
        status: MessageStatus.RECEIVED,
        body: content.body,
        caption: content.caption,
        fileName: content.fileName,
        fileSize: content.fileSize,
        mimeType: content.mimeType,
        mediaUrl,
        // `rawContent` is the same proto payload the outbound worker keeps after sending
        // (see OutboundWorker) — storing it for inbound messages too means any message,
        // in either direction, can later be used as a `quoted` target for "Responder".
        metadata: {
          remoteJid,
          timestamp: String(message.messageTimestamp || ''),
          rawContent: JSON.stringify(message.message, BufferJSON.replacer),
          ...content.metadata,
        },
        quotedMessageId,
      },
      include: {
        author: { select: { id: true, name: true, pushName: true } },
        quotedMessage: { select: { id: true, type: true, body: true, caption: true, fileName: true, direction: true, author: { select: { id: true, name: true, pushName: true } } } },
      },
    });

    const realtimeConversation = await this.prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    await this.realtime.publish(instance.companyId, 'message.created', {
      message: created,
      conversation: realtimeConversation ? { ...realtimeConversation, messages: [created] } : { ...conversation, contact, messages: [created] },
    }, realtimeConversation?.departmentId ?? conversation.departmentId);

    maybeReplyWithAi(this.prisma, this.outboundQueue, this.realtime, this.logger, conversation.id).catch((error) => {
      this.logger.warn({ err: error, conversationId: conversation.id }, 'AI auto-reply failed');
    });
  }

  // `targetKey` identifies the message being reacted to; `reaction.key` is the reactor's own
  // envelope (remoteJid/participant/fromMe) — see Baileys process-message.js, which builds this
  // event as `{ key: content.reactionMessage.key, reaction: { ...content.reactionMessage, key: message.key } }`.
  // A falsy `reaction.text` means the person removed their reaction.
  private async persistReaction(instanceId: string, targetKey: proto.IMessageKey, reaction: proto.IReaction) {
    if (!targetKey.id) return;
    const reactorKey = reaction.key;
    const fromMe = !!reactorKey?.fromMe;
    const reactorJid = fromMe ? 'me' : reactorKey?.participant || reactorKey?.remoteJid || 'unknown';
    await this.applyReaction(instanceId, targetKey.id, reactorJid, fromMe, reaction.text || '');
  }

  // Shared by the incoming path above (a contact/our-other-device reacted, reported via
  // Baileys' `messages.reaction` event) and `sendReaction` below (an agent reacted from the
  // panel). A falsy `emoji` means the reaction was removed.
  private async applyReaction(instanceId: string, waMessageId: string, reactorJid: string, fromMe: boolean, emoji: string) {
    const message = await this.prisma.message.findUnique({
      where: { instanceId_waMessageId: { instanceId, waMessageId } },
      select: { id: true, companyId: true, conversationId: true, conversation: { select: { departmentId: true } } },
    });
    if (!message) return;

    if (!emoji) {
      const { count } = await this.prisma.messageReaction.deleteMany({
        where: { messageId: message.id, reactorJid },
      });
      if (!count) return;
      await this.realtime.publish(message.companyId, 'message.reaction', {
        messageId: message.id,
        conversationId: message.conversationId,
        reactorJid,
        emoji: '',
      }, message.conversation.departmentId);
      return;
    }

    let contactId: string | undefined;
    if (!fromMe) {
      const contact = await this.prisma.contact.findUnique({
        where: { companyId_waId: { companyId: message.companyId, waId: reactorJid } },
        select: { id: true },
      });
      contactId = contact?.id;
    }

    const saved = await this.prisma.messageReaction.upsert({
      where: { messageId_reactorJid: { messageId: message.id, reactorJid } },
      update: { emoji, contactId },
      create: { messageId: message.id, companyId: message.companyId, reactorJid, fromMe, contactId, emoji },
    });

    await this.realtime.publish(message.companyId, 'message.reaction', {
      messageId: message.id,
      conversationId: message.conversationId,
      reaction: saved,
    }, message.conversation.departmentId);
  }

  // An agent reacting from the panel — actually sends the reaction to WhatsApp (so the
  // customer's phone shows it too), then persists/broadcasts it the same way an incoming
  // reaction would be. `reactorJid: 'me'` matches what `persistReaction` derives for our own
  // `fromMe` reactions, so if WhatsApp ever echoes this back through `messages.reaction` it
  // just upserts the same row instead of creating a duplicate.
  async sendReaction(instanceId: string, messageId: string, emoji: string) {
    const target = await this.prisma.message.findFirst({
      where: { id: messageId, instanceId },
      select: { waMessageId: true, direction: true, contact: { select: { waId: true } } },
    });
    if (!target) throw new Error('Mensaje no encontrado');

    const socket = await this.ensureConnected(instanceId);
    await socket.sendMessage(target.contact.waId, {
      react: {
        text: emoji,
        key: { remoteJid: target.contact.waId, fromMe: target.direction === 'OUTBOUND', id: target.waMessageId },
      },
    });

    await this.applyReaction(instanceId, target.waMessageId, 'me', true, emoji);
  }

  // Fire-and-forget: WhatsApp profile pictures are fetched lazily so they never
  // delay message persistence, and only for contacts that don't have one cached yet
  // (Baileys throws for contacts with no photo or privacy-restricted ones — that's fine, the
  // UI falls back to initials).
  private refreshAvatar(socket: WASocket, contactId: string, waId: string, hasAvatar: string | null) {
    if (hasAvatar) return;
    socket.profilePictureUrl(waId, 'image')
      .then((url) => { if (url) return this.prisma.contact.update({ where: { id: contactId }, data: { avatarUrl: url } }); })
      .catch(() => {});
  }

  // One pass per (re)connect over contacts still missing a photo, so existing chats
  // pick up avatars without waiting for a new inbound message from each one.
  private async backfillAvatars(instanceId: string, socket: WASocket) {
    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId }, select: { companyId: true } });
    if (!instance) return;
    const contacts = await this.prisma.contact.findMany({
      where: { companyId: instance.companyId, avatarUrl: null },
      select: { id: true, waId: true },
      take: 200,
    });
    for (const contact of contacts) {
      try {
        const url = await socket.profilePictureUrl(contact.waId, 'image');
        if (url) await this.prisma.contact.update({ where: { id: contact.id }, data: { avatarUrl: url } });
      } catch {
        // no photo or privacy-restricted
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private async scheduleReconnect(instanceId: string, statusCode?: number) {
    if (this.reconnectTimers.has(instanceId) || this.manualStops.has(instanceId)) return;
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { reconnectAttempt: true, autoConnect: true },
    });
    if (!instance?.autoConnect) {
      await this.setInstanceState(instanceId, InstanceStatus.DISCONNECTED, { lastDisconnectedAt: new Date() });
      await this.releaseLease(instanceId);
      return;
    }
    const attempt = instance.reconnectAttempt + 1;
    const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5));
    const jitter = Math.floor(Math.random() * 750);
    const delay = statusCode === DisconnectReason.restartRequired ? 300 : base + jitter;

    await this.setInstanceState(instanceId, InstanceStatus.RECONNECTING, {
      reconnectAttempt: attempt,
      lastError: statusCode ? `Conexión cerrada (${statusCode}). Reconectando automáticamente.` : 'Conexión cerrada. Reconectando automáticamente.',
      lastDisconnectedAt: new Date(),
    });

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(instanceId);
      void this.connect(instanceId).catch((error) => {
        this.logger.error({ err: error, instanceId }, 'reconnect failed');
        void this.scheduleReconnect(instanceId);
      });
    }, delay);
    timer.unref();
    this.reconnectTimers.set(instanceId, timer);
  }

  private clearReconnectTimer(instanceId: string) {
    const timer = this.reconnectTimers.get(instanceId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(instanceId);
  }

  private disconnectCode(error: unknown): number | undefined {
    if (!error) return undefined;
    if (error instanceof Boom) return error.output.statusCode;
    const candidate = error as { output?: { statusCode?: number }; statusCode?: number };
    return candidate.output?.statusCode || candidate.statusCode;
  }

  private mapBaileysStatus(status: number): MessageStatus | null {
    if (status >= proto.WebMessageInfo.Status.READ) return MessageStatus.READ;
    if (status >= proto.WebMessageInfo.Status.DELIVERY_ACK) return MessageStatus.DELIVERED;
    if (status >= proto.WebMessageInfo.Status.SERVER_ACK) return MessageStatus.SENT;
    return null;
  }

  private leaseKey(instanceId: string) {
    return `brainwsp:instance:${instanceId}:owner`;
  }

  private async ensureLease(instanceId: string) {
    const key = this.leaseKey(instanceId);
    const current = await this.redis.get(key);
    if (current && current !== config.workerId) return false;
    if (!current) {
      const acquired = await this.redis.set(key, config.workerId, 'PX', LEASE_TTL_MS, 'NX');
      if (acquired !== 'OK') return false;
    }

    this.leaseLost.delete(instanceId);

    if (!this.leaseTimers.has(instanceId)) {
      const timer = setInterval(() => {
        void this.redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          key,
          config.workerId,
          String(LEASE_TTL_MS),
        ).then((result: unknown) => {
          if (Number(result) !== 1) void this.handleLeaseLost(instanceId);
        }).catch((error: unknown) => {
          this.logger.error({ err: error, instanceId }, 'failed to renew WhatsApp instance lease');
        });
      }, LEASE_RENEW_MS);
      timer.unref();
      this.leaseTimers.set(instanceId, timer);
    }
    return true;
  }

  private async handleLeaseLost(instanceId: string) {
    if (this.leaseLost.has(instanceId)) return;
    this.leaseLost.add(instanceId);
    const timer = this.leaseTimers.get(instanceId);
    if (timer) clearInterval(timer);
    this.leaseTimers.delete(instanceId);

    const socket = this.sockets.get(instanceId);
    this.sockets.delete(instanceId);
    this.logger.error({ instanceId }, 'Redis lease lost; closing local socket to prevent split-brain');
    socket?.end(new Error('redis lease lost'));
  }

  private async releaseLease(instanceId: string) {
    const timer = this.leaseTimers.get(instanceId);
    if (timer) clearInterval(timer);
    this.leaseTimers.delete(instanceId);
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      this.leaseKey(instanceId),
      config.workerId,
    );
  }

  private async setInstanceState(instanceId: string, status: InstanceStatus, extra: Record<string, unknown> = {}) {
    await this.prisma.whatsAppInstance.update({ where: { id: instanceId }, data: { status, ...extra } });
    await this.emitInstance(instanceId);
  }

  private async emitInstance(instanceId: string) {
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        companyId: true,
        name: true,
        slug: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        qr: true,
        reconnectAttempt: true,
        lastError: true,
        lastConnectedAt: true,
        lastDisconnectedAt: true,
      },
    });
    if (instance) await this.realtime.publish(instance.companyId, 'instance.updated', instance);
  }
}
