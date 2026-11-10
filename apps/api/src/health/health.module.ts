import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ScrollReportController } from './scroll-report.controller';

@Module({ controllers: [HealthController, ScrollReportController] })
export class HealthModule {}
