import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateLeadDto, UpdateLeadDto } from './crm.dto';
import { LeadsService } from './leads.service';

@ApiTags('CRM — Prospectos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequireModule('crm')
@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('q') q?: string,
    @Query('status') status?: LeadStatus,
    @Query('channel') channel?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('conversationId') conversationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(user.companyId, { q, status, channel, assignedUserId, conversationId, from, to });
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateLeadDto) {
    return this.service.create(user.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.convert(user.companyId, id);
  }
}
