import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ApiCredentialsModule } from './api-credentials/api-credentials.module';
import { CommonModule } from './common/common.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InstancesModule } from './instances/instances.module';
import { MediaModule } from './media/media.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StickersModule } from './stickers/stickers.module';
import { StorageModule } from './storage/storage.module';
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
    CommonModule,
    QueueModule,
    StorageModule,
    AuthModule,
    ApiCredentialsModule,
    InstancesModule,
    MessagesModule,
    ConversationsModule,
    RealtimeModule,
    MediaModule,
    TeamModule,
    DashboardModule,
    FeedbackModule,
    IncidentsModule,
    StickersModule,
    QuickRepliesModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
