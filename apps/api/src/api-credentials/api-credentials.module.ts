import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiCredentialsController } from './api-credentials.controller';
import { ApiCredentialsService } from './api-credentials.service';

@Module({
  imports: [AuthModule],
  controllers: [ApiCredentialsController],
  providers: [ApiCredentialsService, RolesGuard],
  exports: [ApiCredentialsService],
})
export class ApiCredentialsModule {}
