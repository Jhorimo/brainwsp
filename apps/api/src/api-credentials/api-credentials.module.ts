import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiCredentialsController } from './api-credentials.controller';
import { ApiCredentialsService } from './api-credentials.service';

@Module({
  controllers: [ApiCredentialsController],
  providers: [ApiCredentialsService, RolesGuard],
  exports: [ApiCredentialsService],
})
export class ApiCredentialsModule {}
