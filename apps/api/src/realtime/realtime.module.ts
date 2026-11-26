import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallsService } from './calls.service';
import { ConversationEventsService } from './conversation-events.service';
import { RealtimeBridge } from './realtime.bridge';
import { RealtimeBus } from './realtime.bus';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeBridge, RealtimeBus, CallsService, ConversationEventsService],
  exports: [RealtimeGateway, RealtimeBus, ConversationEventsService],
})
export class RealtimeModule {}
