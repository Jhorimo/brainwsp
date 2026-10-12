import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';

@Module({
  imports: [AuthModule, SystemSettingsModule],
  controllers: [QuickRepliesController],
  providers: [QuickRepliesService],
})
export class QuickRepliesModule {}
