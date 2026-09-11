import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

// StorageService no se importa aparte: StorageModule es @Global() (ver
// storage.module.ts), como ya asume el resto de modulos que suben/bajan de MinIO.
@Module({
  imports: [AuthModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, RolesGuard],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
