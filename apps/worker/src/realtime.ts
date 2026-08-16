import { Redis as IORedis } from 'ioredis';
import { config } from './config.js';

export class RealtimePublisher {
  private readonly redis = new IORedis(config.redisUrl);

  publish(companyId: string, event: string, payload: unknown) {
    return this.redis.publish('brainwsp.realtime', JSON.stringify({ companyId, event, payload }));
  }

  async close() {
    await this.redis.quit();
  }
}
