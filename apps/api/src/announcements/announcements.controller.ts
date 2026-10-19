import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateAnnouncementDto } from './announcements.dto';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // Cualquier usuario autenticado, de cualquier empresa: es lo unico en la API que no
  // esta scoped por companyId a proposito (ver comentario en el schema).
  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.listForUser(user.sub);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(user.sub, dto.text);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  update(@Param('id') id: string, @Body() dto: CreateAnnouncementDto) {
    return this.service.update(id, dto.text);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.markRead(user.sub, id);
  }
}
