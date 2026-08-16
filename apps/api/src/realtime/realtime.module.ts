import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeBridge } from './realtime.bridge';
import { RealtimeBus } from './realtime.bus';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeBridge, RealtimeBus],
  exports: [RealtimeGateway, RealtimeBus],
})
export class RealtimeModule {}
