import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiUserTokenGuard } from '../common/guards/api-user-token.guard';
import type { ApiClientContext } from '../common/types/jwt-user';
import { CreateAppDto, CreateDeviceDto } from './user-device.dto';
import { UserDeviceService } from './user-device.service';

type ApiRequest = Request & { apiClient: ApiClientContext };

// Rutas de compatibilidad con la integración legacy de BrainPOS Restaurante
// (brainpos_rest/models/ajuste_model.php::whatsappBraintechApiRequest, controllers/ajuste.php
// función whatsapp_*), que llama directo a `{api_whatsapp_url}/api/user/...` con
// `Authorization: Bearer {AUTH KEY}`. Ese proyecto no se modifica: estas rutas existen para
// que su integración funcione sin cambios.
@ApiTags('Legacy BrainPOS Restaurante API')
@UseGuards(ApiUserTokenGuard)
@Controller('user')
export class UserDeviceController {
  constructor(private readonly service: UserDeviceService) {}

  @Post('device')
  createDevice(@Req() req: ApiRequest, @Body() dto: CreateDeviceDto) {
    return this.service.createDevice(req.apiClient, dto);
  }

  @Post('create-app')
  createApp(@Req() req: ApiRequest, @Body() dto: CreateAppDto) {
    return this.service.createApp(req.apiClient, dto);
  }

  @Post('create-session/:uuid')
  createSession(@Req() req: ApiRequest, @Param('uuid') uuid: string) {
    return this.service.createSession(req.apiClient, uuid);
  }

  @Get('check-session/:uuid')
  checkSession(@Req() req: ApiRequest, @Param('uuid') uuid: string) {
    return this.service.checkSession(req.apiClient, uuid);
  }

  @Post('logout-session/:uuid')
  logoutSession(@Req() req: ApiRequest, @Param('uuid') uuid: string) {
    return this.service.logoutSession(req.apiClient, uuid);
  }
}
