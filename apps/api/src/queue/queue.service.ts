import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  readonly outbound = new Queue('whatsapp.outbound', { connection: this.redis });
  readonly commands = new Queue('whatsapp.commands', { connection: this.redis });

  async onModuleDestroy() {
    await Promise.all([this.outbound.close(), this.commands.close()]);
    await this.redis.quit();
  }
}
