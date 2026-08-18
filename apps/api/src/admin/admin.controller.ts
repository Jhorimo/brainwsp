import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
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
  updateCompany(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateCompanyAdminDto) {
    return this.service.updateCompany(user.sub, id, dto);
  }

  @Post('companies/:id/impersonate')
  impersonate(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.impersonate(user.sub, id);
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
  securityLog() {
    return this.service.listSecurityLog();
  }
}
