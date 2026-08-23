import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [AuthModule], controllers: [DashboardController], providers: [ModuleAccessGuard] })
export class DashboardModule {}
