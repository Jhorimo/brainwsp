import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';

@Module({
  controllers: [InstancesController],
  providers: [InstancesService, RolesGuard],
})
export class InstancesModule {}
