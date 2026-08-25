import { Module } from '@nestjs/common';
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module';
import { ApiUserTokenGuard } from '../common/guards/api-user-token.guard';
import { InstancesModule } from '../instances/instances.module';
import { UserDeviceController } from './user-device.controller';
import { UserDeviceService } from './user-device.service';

@Module({
  imports: [ApiCredentialsModule, InstancesModule],
  controllers: [UserDeviceController],
  providers: [UserDeviceService, ApiUserTokenGuard],
})
export class UserDeviceModule {}
