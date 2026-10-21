import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TemporaryLimitDto, UpdateSystemSettingsDto } from './system-settings.dto';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('System Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  get() {
    return this.service.getForAdmin();
  }

  @Patch()
  async update(@Body() dto: UpdateSystemSettingsDto) {
    await this.service.update(dto);
    return this.service.getForAdmin();
  }

  @Post('temporary-limit')
  setTemporaryLimit(@Body() dto: TemporaryLimitDto) {
    return this.service.setTemporaryLimit(dto.maxMediaSizeBytes, dto.hours);
  }

  @Delete('temporary-limit')
  clearTemporaryLimit() {
    return this.service.clearTemporaryLimit();
  }

  @Get('heaviest-files')
  heaviestFiles() {
    return this.service.heaviestFiles();
  }

  @Delete('heaviest-files/:messageId')
  deleteFile(@Param('messageId') messageId: string) {
    return this.service.deleteFile(messageId);
  }
}
