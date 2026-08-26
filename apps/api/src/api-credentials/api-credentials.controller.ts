import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateApiCredentialDto } from './api-credentials.dto';
import { ApiCredentialsService } from './api-credentials.service';

@ApiTags('API credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller('api-credentials')
export class ApiCredentialsController {
  constructor(private readonly service: ApiCredentialsService) {}

  @Post('master')
  ensureMaster(@CurrentUser() user: JwtUser) {
    return this.service.ensureMaster(user.companyId);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateApiCredentialDto) {
    return this.service.create(user.companyId, dto.name, dto.instanceId);
  }

  @Get(':id/reveal')
  reveal(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.reveal(user.companyId, id, user.sub);
  }

  @Patch(':id/revoke')
  revoke(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.revoke(user.companyId, id);
  }

  @Patch(':id/regenerate')
  regenerate(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.regenerate(user.companyId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }
}
