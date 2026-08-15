import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

@Injectable()
export class RealtimeBus implements OnModuleDestroy {
  private readonly publisher = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  async publish(companyId: string, event: string, payload: unknown) {
    try {
      return await this.publisher.publish('brainwsp.realtime', JSON.stringify({ companyId, event, payload }));
    } catch (error) {
      // Realtime delivery is best-effort; the database remains the source of truth.
      console.error('Realtime publish failed', error);
      return 0;
    }
  }

  async onModuleDestroy() {
    await this.publisher.quit();
  }
}
