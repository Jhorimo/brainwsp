import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateDepartmentDto, CreateKnowledgeEntryDto, CreateProjectDto, CreateStageDto, CreateTagDto, CreateTeamUserDto, SetDepartmentMembersDto, UpdateAiSettingsDto, UpdateCompanyDto, UpdateDepartmentDto, UpdateKnowledgeEntryDto, UpdateProjectDto, UpdateStageDto, UpdateTagDto, UpdateTeamUserDto } from './team.dto';
import { TeamService } from './team.service';

// NOTE: unlike the other feature controllers, this one is intentionally NOT gated by
// ModuleAccessGuard/'team'. The Conversations page depends on several of its GET/POST
// routes (users, departments, projects, tags) to render its own UI (assignee picker,
// filters, tagging) regardless of whether the agent has the "Equipo y agentes" nav item
// enabled — and every route an Agent could otherwise reach here is already blocked by
// @Roles(OWNER, ADMIN) on the real admin actions. The 'team' module permission is
// enforced purely as nav visibility on the frontend (see AppShell).
@ApiTags('Team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get('users')
  users(@CurrentUser() user: JwtUser) {
    return this.service.listUsers(user.companyId);
  }

  @Post('users')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createUser(@CurrentUser() user: JwtUser, @Body() dto: CreateTeamUserDto) {
    return this.service.createUser(user.companyId, dto);
  }

  @Patch('users/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateUser(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTeamUserDto) {
    if (id === user.sub && dto.active === false) throw new ForbiddenException('No puedes desactivar tu propio usuario');
    return this.service.updateUser(user.companyId, id, dto);
  }

  @Patch('users/:id/default')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setDefaultAgent(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.setDefaultAgent(user.companyId, id);
  }

  @Delete('users/:id/default')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  clearDefaultAgent(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.clearDefaultAgent(user.companyId, id);
  }

  @Get('company')
  companyProfile(@CurrentUser() user: JwtUser) {
    return this.service.getCompanyProfile(user.companyId);
  }

  @Patch('company')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateCompany(@CurrentUser() user: JwtUser, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompanyProfile(user.companyId, dto);
  }

  @Get('departments')
  departments(@CurrentUser() user: JwtUser) {
    return this.service.listDepartments(user.companyId);
  }

  @Post('departments')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createDepartment(@CurrentUser() user: JwtUser, @Body() dto: CreateDepartmentDto) {
    return this.service.createDepartment(user.companyId, dto);
  }

  @Patch('departments/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateDepartment(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.updateDepartment(user.companyId, id, dto);
  }

  @Delete('departments/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  deleteDepartment(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteDepartment(user.companyId, id);
  }

  @Put('departments/:id/members')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setMembers(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SetDepartmentMembersDto) {
    return this.service.setDepartmentMembers(user.companyId, id, dto.userIds);
  }

  @Patch('departments/:id/default')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setDefaultDepartment(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.setDefaultDepartment(user.companyId, id);
  }

  @Get('projects')
  projects(@CurrentUser() user: JwtUser) {
    return this.service.listProjects(user.companyId);
  }

  @Post('projects')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createProject(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto) {
    return this.service.createProject(user.companyId, dto);
  }

  @Patch('projects/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateProject(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.updateProject(user.companyId, id, dto);
  }

  @Delete('projects/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  deleteProject(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteProject(user.companyId, id);
  }

  @Get('departments/:id/stages')
  stages(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.listStages(user.companyId, id);
  }

  @Post('departments/:id/stages')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createStage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: CreateStageDto) {
    return this.service.createStage(user.companyId, id, dto);
  }

  @Patch('stages/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateStage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.service.updateStage(user.companyId, id, dto);
  }

  @Delete('stages/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  deleteStage(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteStage(user.companyId, id);
  }

  @Get('tags')
  tags(@CurrentUser() user: JwtUser) {
    return this.service.listTags(user.companyId);
  }

  @Post('tags')
  createTag(@CurrentUser() user: JwtUser, @Body() dto: CreateTagDto) {
    return this.service.createTag(user.companyId, dto);
  }

  @Patch('tags/:id')
  updateTag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.service.updateTag(user.companyId, id, dto);
  }

  @Delete('tags/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR)
  deleteTag(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteTag(user.companyId, id);
  }

  @Get('ai')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  aiSettings(@CurrentUser() user: JwtUser) {
    return this.service.getAiSettings(user.companyId);
  }

  @Patch('ai')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateAiSettings(@CurrentUser() user: JwtUser, @Body() dto: UpdateAiSettingsDto) {
    return this.service.updateAiSettings(user.companyId, dto);
  }

  @Get('knowledge')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  knowledge(@CurrentUser() user: JwtUser) {
    return this.service.listKnowledge(user.companyId);
  }

  @Post('knowledge')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createKnowledge(@CurrentUser() user: JwtUser, @Body() dto: CreateKnowledgeEntryDto) {
    return this.service.createKnowledge(user.companyId, dto);
  }

  @Patch('knowledge/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateKnowledge(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateKnowledgeEntryDto) {
    return this.service.updateKnowledge(user.companyId, id, dto);
  }

  @Delete('knowledge/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  deleteKnowledge(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteKnowledge(user.companyId, id);
  }
}
