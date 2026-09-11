import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [AuthModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, RolesGuard],
})
export class AnnouncementsModule {}
