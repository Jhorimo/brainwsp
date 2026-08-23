import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { AdminService } from './admin.service';
import { CreatePlanDto, UpdateCompanyAdminDto, UpdatePlanDto } from './admin.dto';

// Everything here reaches across every tenant company — gated to SUPERADMIN only,
// unlike the rest of the API where access is scoped to the caller's own company.
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('companies')
  companies() {
    return this.service.listCompanies();
  }

  @Patch('companies/:id')
  updateCompany(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateCompanyAdminDto, @Req() req: Request) {
    return this.service.updateCompany(user.sub, id, dto, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Post('companies/:id/impersonate')
  impersonate(@CurrentUser() user: JwtUser, @Param('id') id: string, @Req() req: Request) {
    return this.service.impersonate(user.sub, user.name, id, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Get('plans')
  plans() {
    return this.service.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  @Get('suggestions')
  suggestions() {
    return this.service.listSuggestions();
  }

  @Get('security-log')
  securityLog(@Query('q') q?: string, @Query('event') event?: string, @Query('status') status?: 'success' | 'failed') {
    return this.service.listSecurityLog({ q, event, status });
  }
}
