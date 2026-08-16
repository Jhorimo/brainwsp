import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateDepartmentDto, CreateProjectDto, CreateTeamUserDto, SetDepartmentMembersDto, UpdateDepartmentDto, UpdateProjectDto, UpdateTeamUserDto } from './team.dto';
import { TeamService } from './team.service';

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

  @Put('departments/:id/members')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setMembers(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SetDepartmentMembersDto) {
    return this.service.setDepartmentMembers(user.companyId, id, dto.userIds);
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
}
