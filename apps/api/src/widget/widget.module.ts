import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import { ClieneraMailNotifier } from './clienera-mail-notifier';

@Module({
  imports: [RealtimeModule, SystemSettingsModule],
  controllers: [WidgetController],
  providers: [WidgetService, ClieneraMailNotifier],
})
export class WidgetModule {}
