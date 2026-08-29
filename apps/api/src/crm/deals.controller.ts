import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateDealDto, UpdateDealDto } from './crm.dto';
import { DealsService } from './deals.service';

@ApiTags('CRM — Tratos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequireModule('crm')
@Controller('crm/deals')
export class DealsController {
  constructor(private readonly service: DealsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('q') q?: string,
    @Query('departmentId') departmentId?: string,
    @Query('stageId') stageId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(user.companyId, { q, departmentId, stageId, assignedUserId, from, to });
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateDealDto) {
    return this.service.create(user.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }
}
