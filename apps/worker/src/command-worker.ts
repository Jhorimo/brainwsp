import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { Logger } from 'pino';
import { config } from './config.js';
import type { SessionManager } from './session-manager.js';

export class CommandWorker {
  private readonly connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  private readonly worker: Worker;

  constructor(private readonly sessions: SessionManager, private readonly logger: Logger) {
    this.worker = new Worker('whatsapp.commands', (job) => this.process(job), {
      connection: this.connection,
      concurrency: 10,
    });
    this.worker.on('failed', (job, error) => this.logger.error({ err: error, jobId: job?.id }, 'command failed'));
  }

  private async process(job: Job<{ instanceId: string }>) {
    if (job.name === 'connect') return this.sessions.connect(job.data.instanceId);
    if (job.name === 'disconnect') return this.sessions.disconnect(job.data.instanceId);
    if (job.name === 'logout') return this.sessions.logout(job.data.instanceId);
    if (job.name === 'refresh-avatars') return this.sessions.forceRefreshAvatars(job.data.instanceId);
    throw new Error(`Unknown command: ${job.name}`);
  }

  async close() {
    await this.worker.close();
    await this.connection.quit();
  }
}
