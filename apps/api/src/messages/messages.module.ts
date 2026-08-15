import { Module } from '@nestjs/common';
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module';
import { ApiCredentialGuard } from '../common/guards/api-credential.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { LegacyMessagesController, MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [ApiCredentialsModule, RealtimeModule],
  controllers: [MessagesController, LegacyMessagesController],
  providers: [MessagesService, ApiCredentialGuard],
})
export class MessagesModule {}
