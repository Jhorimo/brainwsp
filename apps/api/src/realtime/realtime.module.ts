import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallsService } from './calls.service';
import { RealtimeBridge } from './realtime.bridge';
import { RealtimeBus } from './realtime.bus';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeBridge, RealtimeBus, CallsService],
  exports: [RealtimeGateway, RealtimeBus],
})
export class RealtimeModule {}
