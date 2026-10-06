import { Redis as IORedis } from 'ioredis';
import { config } from './config.js';

export class RealtimePublisher {
  private readonly redis = new IORedis(config.redisUrl);

  publish(companyId: string, event: string, payload: unknown, departmentId?: string | null, conversationId?: string) {
    return this.redis.publish('brainwsp.realtime', JSON.stringify({ companyId, event, payload, departmentId, conversationId }));
  }

  async close() {
    await this.redis.quit();
  }
}
