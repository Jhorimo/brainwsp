import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { PipelinesController } from './pipelines.controller';
import { PipelinesService } from './pipelines.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [LeadsController, DealsController, PipelinesController],
  providers: [LeadsService, DealsService, PipelinesService, ModuleAccessGuard],
  exports: [DealsService],
})
export class CrmModule {}
