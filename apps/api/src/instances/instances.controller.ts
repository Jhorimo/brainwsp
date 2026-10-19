import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateInstanceDto, UpdateInstanceDto, UpdateWidgetConfigDto } from './instances.dto';
import { InstancesService } from './instances.service';

const WIDGET_ICON_UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024;
const WIDGET_TEASER_UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024;

// NOTE: not gated by ModuleAccessGuard/'instances' — the Conversations page calls
// GET /instances directly (to pick a WhatsApp number when starting a new chat),
// regardless of whether the agent has the "WhatsApp" nav item enabled. The 'instances'
// module permission is enforced as nav visibility only (see AppShell).
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

  @Post(':id/refresh-avatars')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  refreshAvatars(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.refreshAvatars(user.companyId, id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateInstanceDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Post(':id/widget-key/regenerate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  regenerateWidgetKey(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.regenerateWidgetKey(user.companyId, id);
  }

  @Patch(':id/widget-config')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateWidgetConfig(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateWidgetConfigDto) {
    return this.service.updateWidgetConfig(user.companyId, id, dto);
  }

  @Post(':id/widget-icon')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: WIDGET_ICON_UPLOAD_LIMIT_BYTES } }))
  uploadWidgetIcon(@CurrentUser() user: JwtUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.uploadWidgetIcon(user.companyId, id, file);
  }

  @Delete(':id/widget-icon')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  removeWidgetIcon(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.removeWidgetIcon(user.companyId, id);
  }

  @Post(':id/widget-teaser-image')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: WIDGET_TEASER_UPLOAD_LIMIT_BYTES } }))
  uploadWidgetTeaserImage(@CurrentUser() user: JwtUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.uploadWidgetTeaserImage(user.companyId, id, file);
  }

  @Delete(':id/widget-teaser-image')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  removeWidgetTeaserImage(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.removeWidgetTeaserImage(user.companyId, id);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }
}
