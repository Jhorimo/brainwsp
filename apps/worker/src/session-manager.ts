import makeWASocket, {
  Browsers,
  DisconnectReason,
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
  type PrismaClient,
} from '@prisma/client';
import IORedis from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import { usePrismaAuthState } from './auth-state.js';
import { extractMessage, jidToPhone } from './message-utils.js';
import type { RealtimePublisher } from './realtime.js';

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

    const socket = makeWASocket({
      auth: {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, childLogger as never),
      },
      logger: childLogger as never,
      browser: Browsers.macOS('Google Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
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
        await this.persistIncoming(instanceId, message).catch((error) => {
          childLogger.error({ err: error, messageId: message.key.id }, 'failed to persist incoming message');
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

  private async persistIncoming(instanceId: string, message: WAMessage) {
    if (message.key.fromMe || !message.key.remoteJid || !message.key.id || !message.message) return;
    const remoteJid = message.key.remoteJid;
    if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) return;

    // Baileys can re-emit the same message after a reconnect/history sync.
    // Check idempotency before incrementing unread counters or publishing realtime events.
    const alreadyStored = await this.prisma.message.findUnique({
      where: { instanceId_waMessageId: { instanceId, waMessageId: message.key.id } },
      select: { id: true },
    });
    if (alreadyStored) return;

    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
    if (!instance) return;

    const phone = jidToPhone(remoteJid);
    const contact = await this.prisma.contact.upsert({
      where: { companyId_waId: { companyId: instance.companyId, waId: remoteJid } },
      update: {
        phone: phone || undefined,
        pushName: message.pushName || undefined,
        lastSeenAt: new Date(),
      },
      create: {
        companyId: instance.companyId,
        waId: remoteJid,
        phone,
        pushName: message.pushName || null,
        name: message.pushName || null,
        lastSeenAt: new Date(),
      },
    });

    const conversation = await this.prisma.conversation.upsert({
      where: { instanceId_contactId: { instanceId, contactId: contact.id } },
      update: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      create: {
        companyId: instance.companyId,
        instanceId,
        contactId: contact.id,
        unreadCount: 1,
        lastMessageAt: new Date(),
      },
    });

    const content = extractMessage(message);
    const created = await this.prisma.message.upsert({
      where: { instanceId_waMessageId: { instanceId, waMessageId: message.key.id } },
      update: {},
      create: {
        companyId: instance.companyId,
        conversationId: conversation.id,
        instanceId,
        contactId: contact.id,
        waMessageId: message.key.id,
        direction: MessageDirection.INBOUND,
        type: content.type,
        status: MessageStatus.RECEIVED,
        body: content.body,
        caption: content.caption,
        fileName: content.fileName,
        mimeType: content.mimeType,
        metadata: { remoteJid, timestamp: String(message.messageTimestamp || '') },
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
    });
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
        ).then((result) => {
          if (Number(result) !== 1) void this.handleLeaseLost(instanceId);
        }).catch((error) => {
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
