import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarService],
})
export class CalendarModule {}
