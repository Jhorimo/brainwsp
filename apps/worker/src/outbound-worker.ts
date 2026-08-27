import { MessageStatus, MessageType, type PrismaClient } from '@prisma/client';
import { BufferJSON, proto, type WAMessage } from '@whiskeysockets/baileys';
import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import type { RealtimePublisher } from './realtime.js';
import type { SessionManager } from './session-manager.js';
import { downloadObjectBuffer, objectNameFromUrl } from './storage.js';
import { transcodeToOggOpus } from './audio-transcode.js';

type OutboundJobData = { messageId: string } | { instanceId: string; targetMessageId: string; emoji: string } | { instanceId: string; targetMessageId: string };

export class OutboundWorker {
  private readonly connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  private readonly worker: Worker;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionManager,
    private readonly realtime: RealtimePublisher,
    private readonly logger: Logger,
  ) {
    this.worker = new Worker('whatsapp.outbound', (job) => this.process(job), {
      connection: this.connection,
      concurrency: config.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      this.logger.warn({ err: error, jobId: job?.id, data: job?.data }, 'outbound job failed');
    });
  }

  private async process(job: Job<OutboundJobData>) {
    if (job.name === 'send-reaction') {
      const data = job.data as { instanceId: string; targetMessageId: string; emoji: string };
      return this.sessions.sendReaction(data.instanceId, data.targetMessageId, data.emoji);
    }

    if (job.name === 'delete-message') {
      const data = job.data as { instanceId: string; targetMessageId: string };
      return this.sessions.deleteMessage(data.instanceId, data.targetMessageId);
    }

    const { messageId } = job.data as { messageId: string };
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { contact: true, instance: true, quotedMessage: { include: { contact: true } } },
    });
    if (!message) return;
    if (message.status === MessageStatus.SENT || message.status === MessageStatus.DELIVERED || message.status === MessageStatus.READ) return;

    await this.prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.PROCESSING, error: null } });

    try {
      const socket = await this.sessions.ensureConnected(message.instanceId);

      // "Responder" (reply-to): reconstruct the quoted message's original proto from the
      // raw content the worker keeps (see `rawContent` in persistIncoming / below), so
      // Baileys can attach a real WhatsApp quote — not just our own DB link. Silently sent
      // without a quote if the target predates this feature and has no raw content saved.
      let quoted: WAMessage | undefined;
      if (message.quotedMessage) {
        const rawContent = (message.quotedMessage.metadata as { rawContent?: string } | null)?.rawContent;
        if (rawContent) {
          quoted = {
            key: {
              id: message.quotedMessage.waMessageId,
              remoteJid: message.quotedMessage.contact.waId,
              fromMe: message.quotedMessage.direction === 'OUTBOUND',
            },
            message: JSON.parse(rawContent, BufferJSON.reviver) as proto.IMessage,
          };
        }
      }
      const options = quoted ? { quoted } : undefined;
      let response;

      if (message.type === MessageType.TEXT) {
        response = await socket.sendMessage(message.contact.waId, { text: message.body || '' }, options);
      } else if (message.type === MessageType.IMAGE) {
        if (!message.mediaUrl) throw new Error('La imagen no tiene URL');
        const buffer = await downloadObjectBuffer(objectNameFromUrl(message.mediaUrl));
        response = await socket.sendMessage(message.contact.waId, {
          image: buffer,
          mimetype: message.mimeType || 'image/jpeg',
          caption: message.caption || undefined,
        }, options);
      } else if (message.type === MessageType.VIDEO) {
        if (!message.mediaUrl) throw new Error('El video no tiene URL');
        const buffer = await downloadObjectBuffer(objectNameFromUrl(message.mediaUrl));
        response = await socket.sendMessage(message.contact.waId, {
          video: buffer,
          mimetype: message.mimeType || 'video/mp4',
          caption: message.caption || undefined,
        }, options);
      } else if (message.type === MessageType.AUDIO) {
        if (!message.mediaUrl) throw new Error('El audio no tiene URL');
        const rawBuffer = await downloadObjectBuffer(objectNameFromUrl(message.mediaUrl));
        // Browser recordings (WebM/Opus) and arbitrary uploaded audio files aren't
        // reliably playable as WhatsApp voice notes; always normalize to Ogg/Opus first.
        const buffer = await transcodeToOggOpus(rawBuffer);
        const ptt = (message.metadata as { ptt?: boolean } | null)?.ptt === true;
        response = await socket.sendMessage(message.contact.waId, {
          audio: buffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt,
        }, options);
      } else if (message.type === MessageType.DOCUMENT) {
        if (!message.mediaUrl) throw new Error('El documento no tiene URL');
        const buffer = await downloadObjectBuffer(objectNameFromUrl(message.mediaUrl));
        response = await socket.sendMessage(message.contact.waId, {
          document: buffer,
          mimetype: message.mimeType || 'application/pdf',
          fileName: message.fileName || 'documento.pdf',
          caption: message.caption || undefined,
        }, options);
      } else if (message.type === MessageType.STICKER) {
        if (!message.mediaUrl) throw new Error('El sticker no tiene URL');
        const buffer = await downloadObjectBuffer(objectNameFromUrl(message.mediaUrl));
        response = await socket.sendMessage(message.contact.waId, { sticker: buffer }, options);
      } else {
        throw new Error(`Tipo de mensaje todavía no implementado: ${message.type}`);
      }

      // WhatsApp asks the sender to resend a message whenever the recipient's
      // device can't decrypt it on the first try (shows "Esperando este
      // mensaje..." until then). Baileys handles that retry via `getMessage`,
      // which needs the original proto content, so we keep it here.
      const rawContent = response?.message
        ? JSON.stringify(response.message, BufferJSON.replacer)
        : undefined;

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          waMessageId: response?.key?.id || message.waMessageId,
          sentAt: new Date(),
          error: null,
          ...(rawContent ? { metadata: { rawContent } } : {}),
        },
      });
      await this.realtime.publish(message.companyId, 'message.updated', updated);
      return updated;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: isLastAttempt ? MessageStatus.FAILED : MessageStatus.QUEUED, error: text },
      });
      throw error;
    }
  }

  async close() {
    await this.worker.close();
    await this.connection.quit();
  }
}
