import { Module } from '@nestjs/common';
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module';
import { ApiCredentialGuard } from '../common/guards/api-credential.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { LegacyDocumentMessagesController, LegacyMessagesController, MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [ApiCredentialsModule, RealtimeModule],
  controllers: [MessagesController, LegacyMessagesController, LegacyDocumentMessagesController],
  providers: [MessagesService, ApiCredentialGuard],
})
export class MessagesModule {}
