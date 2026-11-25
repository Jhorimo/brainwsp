import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { MailStatusController, SystemSettingsController } from './system-settings.controller';
import { MailService } from './mail.service';
import { MediaDedupService } from './media-dedup.service';
import { SystemSettingsService } from './system-settings.service';

// StorageService no se importa aparte: StorageModule es @Global() (ver
// storage.module.ts), como ya asume el resto de modulos que suben/bajan de MinIO.
@Module({
  imports: [AuthModule],
  controllers: [SystemSettingsController, MailStatusController],
  providers: [SystemSettingsService, MediaDedupService, RolesGuard, MailService],
  exports: [SystemSettingsService, MailService],
})
export class SystemSettingsModule {}
