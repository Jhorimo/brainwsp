import { MessageStatus, MessageType, type PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import type { RealtimePublisher } from './realtime.js';
import type { SessionManager } from './session-manager.js';

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
      this.logger.warn({ err: error, jobId: job?.id, messageId: job?.data?.messageId }, 'outbound job failed');
    });
  }

  private async process(job: Job<{ messageId: string }>) {
    const message = await this.prisma.message.findUnique({
      where: { id: job.data.messageId },
      include: { contact: true, instance: true },
    });
    if (!message) return;
    if (message.status === MessageStatus.SENT || message.status === MessageStatus.DELIVERED || message.status === MessageStatus.READ) return;

    await this.prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.PROCESSING, error: null } });

    try {
      const socket = await this.sessions.ensureConnected(message.instanceId);
      let response;

      if (message.type === MessageType.TEXT) {
        response = await socket.sendMessage(message.contact.waId, { text: message.body || '' });
      } else if (message.type === MessageType.DOCUMENT) {
        if (!message.mediaUrl) throw new Error('El documento no tiene URL');
        response = await socket.sendMessage(message.contact.waId, {
          document: { url: message.mediaUrl },
          mimetype: message.mimeType || 'application/pdf',
          fileName: message.fileName || 'documento.pdf',
          caption: message.caption || undefined,
        });
      } else {
        throw new Error(`Tipo de mensaje todavía no implementado: ${message.type}`);
      }

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          waMessageId: response?.key?.id || message.waMessageId,
          sentAt: new Date(),
          error: null,
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
