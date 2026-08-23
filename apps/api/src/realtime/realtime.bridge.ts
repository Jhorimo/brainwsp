import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { RealtimeGateway } from './realtime.gateway';

interface RealtimeEvent {
  companyId: string;
  event: string;
  payload: unknown;
  departmentId?: string | null;
}

@Injectable()
export class RealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private readonly subscriber = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

  constructor(private readonly gateway: RealtimeGateway) {}

  async onModuleInit() {
    await this.subscriber.subscribe('brainwsp.realtime');
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const data = JSON.parse(raw) as RealtimeEvent;
        if (data.companyId && data.event) this.gateway.emitScoped(data.companyId, data.event, data.payload, data.departmentId);
      } catch (error) {
        console.error('Invalid realtime event', error);
      }
    });
  }

  async onModuleDestroy() {
    await this.subscriber.unsubscribe('brainwsp.realtime');
    await this.subscriber.quit();
  }
}
