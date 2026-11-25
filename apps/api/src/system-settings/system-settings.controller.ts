import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TestMailDto, UpdateMailSettingsDto, UpdateSystemSettingsDto } from './system-settings.dto';
import { MailService } from './mail.service';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('System Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(
    private readonly service: SystemSettingsService,
    private readonly mail: MailService,
  ) {}

  // Sin los campos del correo: esos van por /system-settings/mail (la contraseña cifrada
  // nunca sale de la API).
  @Get()
  async get() {
    const { smtpPassEnc: _pass, ...settings } = await this.service.get();
    return settings;
  }

  @Get('mail')
  mailSettings() {
    return this.mail.getSettings();
  }

  @Patch('mail')
  updateMail(@Body() dto: UpdateMailSettingsDto) {
    return this.mail.updateSettings(dto);
  }

  @Post('mail/test')
  testMail(@Body() dto: TestMailDto) {
    return this.mail.sendTest(dto.to);
  }

  @Patch()
  update(@Body() dto: UpdateSystemSettingsDto) {
    return this.service.update(dto);
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

// Para cualquier usuario del panel (no solo superadmin): saber si los avisos por correo de
// Clienera Chat están activos, sin exponer la configuración.
@ApiTags('System Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mail-status')
export class MailStatusController {
  constructor(private readonly mail: MailService) {}

  @Get()
  status() {
    return this.mail.status();
  }
}
