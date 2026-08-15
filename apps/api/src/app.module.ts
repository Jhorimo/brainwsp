import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { ApiCredentialsModule } from './api-credentials/api-credentials.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { InstancesModule } from './instances/instances.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TeamModule } from './team/team.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Works both with `nest start` (src) and compiled `dist` output.
      // Docker injects env vars directly, so a missing file is harmless there.
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    PrismaModule,
    QueueModule,
    AuthModule,
    ApiCredentialsModule,
    InstancesModule,
    MessagesModule,
    ConversationsModule,
    RealtimeModule,
    TeamModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}
