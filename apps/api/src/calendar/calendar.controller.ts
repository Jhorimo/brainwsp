import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CalendarService } from './calendar.service';
import { CreateAppointmentDto } from './calendar.dto';

// NOTE: like /incidents, appointment routes aren't gated by ModuleAccessGuard/'calendar' —
// "Agendar cita" has to work from any conversation regardless of whether the agent has the
// Calendario nav item enabled. That module permission is enforced as nav visibility only
// (see AppShell) plus Roles() below for the connect/disconnect actions specifically.
@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('status')
  status(@CurrentUser() user: JwtUser) {
    return this.service.status(user.companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get('google/connect')
  async connect(@CurrentUser() user: JwtUser) {
    const url = await this.service.buildConnectUrl(user.companyId, user.sub);
    return { url };
  }

  // Public: Google redirects the browser here directly, with no Authorization header —
  // identity travels in the signed `state` param instead (see CalendarService.buildConnectUrl).
  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const webOrigin = (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',')[0].trim();
    if (error || !code || !state) {
      res.redirect(`${webOrigin}/calendar?calendar_error=1`);
      return;
    }
    try {
      await this.service.handleCallback(code, state);
      res.redirect(`${webOrigin}/calendar?calendar_connected=1`);
    } catch {
      res.redirect(`${webOrigin}/calendar?calendar_error=1`);
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('google/disconnect')
  disconnect(@CurrentUser() user: JwtUser) {
    return this.service.disconnect(user.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('appointments')
  list(@CurrentUser() user: JwtUser) {
    return this.service.listAppointments(user.companyId);
  }

  // Full shared-calendar view (BrainWSP appointments + anything booked directly on Google)
  // for the given range — used by the week-grid on the Calendario page.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('events')
  listRange(@CurrentUser() user: JwtUser, @Query('from') from: string, @Query('to') to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    return this.service.listRange(user.companyId, fromDate, toDate);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('appointments')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAppointmentDto) {
    return this.service.createAppointment(user.companyId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('appointments/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteAppointment(user.companyId, id);
  }
}
