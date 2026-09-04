import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { StorageService } from '../storage/storage.service';
import { AutomationsService } from './automations.service';
import { CreateFlowDto, CreateFlowFolderDto, SimulateFlowDto, UpdateFlowDto } from './automations.dto';
import { pipeToResponse } from '../common/pipe-stream';

const MANAGE_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR];

@ApiTags('Automatizaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequireModule(['automations-flows', 'automations-templates'])
@Controller('automations')
export class AutomationsController {
  constructor(
    private readonly service: AutomationsService,
    private readonly storage: StorageService,
  ) {}

  // Sirve los adjuntos que se suben desde el editor de flujos (bloques Imagen/Video/Audio/
  // Archivo) — no exponemos la URL interna de MinIO al navegador, mismo patrón que
  // /quick-replies/:id/file y /media/:messageId. A diferencia de esos dos, este objeto no
  // está atado a una fila propia (Message/QuickReply) que podamos usar para validar
  // pertenencia — el nombre de objeto es un UUID aleatorio no adivinable, así que cualquier
  // usuario autenticado (de cualquier empresa) que lo conozca puede verlo, igual que
  // cualquiera que tenga la URL interna cruda la vería sin pasar por este proxy.
  @Get('media/:objectName')
  async file(@Param('objectName') objectName: string, @Query('mimeType') mimeType: string | undefined, @Query('fileName') fileName: string | undefined, @Res() res: Response) {
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    if (fileName) res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    const stream = await this.storage.getObjectStream(objectName);
    pipeToResponse(stream, res);
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user.companyId);
  }

  @Get('folders')
  listFolders(@CurrentUser() user: JwtUser) {
    return this.service.listFolders(user.companyId);
  }

  @Post('folders')
  @Roles(...MANAGE_ROLES)
  createFolder(@CurrentUser() user: JwtUser, @Body() dto: CreateFlowFolderDto) {
    return this.service.createFolder(user.companyId, dto.name);
  }

  @Delete('folders/:id')
  @Roles(...MANAGE_ROLES)
  deleteFolder(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteFolder(user.companyId, id);
  }

  @Get('flows')
  listFlows(@CurrentUser() user: JwtUser, @Query('folderId') folderId?: string, @Query('instanceId') instanceId?: string, @Query('search') search?: string) {
    return this.service.listFlows(user.companyId, { folderId, instanceId, search });
  }

  @Post('flows')
  @Roles(...MANAGE_ROLES)
  createFlow(@CurrentUser() user: JwtUser, @Body() dto: CreateFlowDto) {
    return this.service.createFlow(user.companyId, user.sub, dto);
  }

  @Get('flows/:id')
  getFlow(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getFlow(user.companyId, id);
  }

  @Patch('flows/:id')
  @Roles(...MANAGE_ROLES)
  updateFlow(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateFlowDto) {
    return this.service.updateFlow(user.companyId, id, dto);
  }

  @Delete('flows/:id')
  @Roles(...MANAGE_ROLES)
  deleteFlow(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deleteFlow(user.companyId, id);
  }

  @Post('flows/:id/duplicate')
  @Roles(...MANAGE_ROLES)
  duplicateFlow(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.duplicateFlow(user.companyId, user.sub, id);
  }

  @Post('flows/:id/simulate')
  @Roles(...MANAGE_ROLES)
  simulate(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SimulateFlowDto) {
    return this.service.simulate(user.companyId, id, dto.message, dto.resumeFromNodeId);
  }
}
