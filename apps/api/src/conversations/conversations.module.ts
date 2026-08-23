import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ModuleAccessGuard],
})
export class ConversationsModule {}
