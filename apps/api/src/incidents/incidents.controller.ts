import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateIncidentDto, UpdateIncidentStatusDto } from './incidents.dto';
import { IncidentsService } from './incidents.service';

// NOTE: not gated by ModuleAccessGuard/'incidents' — the Conversations page reads and
// creates incidents directly from a conversation's panel, regardless of whether the
// agent has the "Incidencias" nav item enabled. That module permission is enforced as
// nav visibility only (see AppShell).
@ApiTags('Incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateIncidentDto) {
    return this.service.create(user.companyId, user.sub, dto);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateIncidentStatusDto) {
    return this.service.updateStatus(user.companyId, id, { id: user.sub, role: user.role }, dto.status);
  }
}
