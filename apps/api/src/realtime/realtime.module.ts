import { Module } from '@nestjs/common';
import { RealtimeBridge } from './realtime.bridge';
import { RealtimeBus } from './realtime.bus';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, RealtimeBridge, RealtimeBus],
  exports: [RealtimeGateway, RealtimeBus],
})
export class RealtimeModule {}
