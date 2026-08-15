import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateInstanceDto } from './instances.dto';
import { InstancesService } from './instances.service';

@ApiTags('WhatsApp instances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instances')
export class InstancesController {
  constructor(private readonly service: InstancesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateInstanceDto) {
    return this.service.create(user.companyId, dto.name, dto.slug, dto.provider);
  }

  @Post(':id/connect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  connect(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.connect(user.companyId, id);
  }

  @Post(':id/disconnect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  disconnect(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.disconnect(user.companyId, id);
  }

  @Post(':id/logout')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  logout(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.logout(user.companyId, id);
  }
}
