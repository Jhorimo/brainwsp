import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';

@Module({
  imports: [AuthModule],
  controllers: [InstancesController],
  providers: [InstancesService, RolesGuard],
  exports: [InstancesService],
})
export class InstancesModule {}
