import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

@Injectable()
export class RealtimeBus implements OnModuleDestroy {
  private readonly publisher = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  // `departmentId` is optional context for events tied to a specific conversation:
  // undefined = not conversation-scoped (broadcast as before), null = conversation has
  // no department (unassigned), string = that department. It lets the gateway also
  // deliver to department-restricted agents without exposing content outside their scope.
  async publish(companyId: string, event: string, payload: unknown, departmentId?: string | null) {
    try {
      return await this.publisher.publish('brainwsp.realtime', JSON.stringify({ companyId, event, payload, departmentId }));
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
