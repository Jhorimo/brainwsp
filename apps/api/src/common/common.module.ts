import { Global, Module } from '@nestjs/common';
import { AgentAccessService } from './services/agent-access.service';

@Global()
@Module({
  providers: [AgentAccessService],
  exports: [AgentAccessService],
})
export class CommonModule {}
