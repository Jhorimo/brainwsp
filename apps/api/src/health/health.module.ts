import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HealthController } from './health.controller';
import { ScrollReportController } from './scroll-report.controller';

// AuthModule aporta el JwtService que necesita JwtAuthGuard en ScrollReportController.
@Module({ imports: [AuthModule], controllers: [HealthController, ScrollReportController] })
export class HealthModule {}
