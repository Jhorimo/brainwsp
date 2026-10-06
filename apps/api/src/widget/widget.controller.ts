import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { pipeToResponse } from '../common/pipe-stream';
import { StorageService } from '../storage/storage.service';
import { SendWidgetMessageDto, StartWidgetSessionDto } from './widget.dto';
import { checkWidgetRateLimit } from './widget-rate-limit';
import { WidgetService } from './widget.service';

// Techo técnico del interceptor, alto a propósito — el límite real (y mucho más bajo para
// este endpoint público) se aplica dentro de WidgetService.sendMedia.
const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

// Única superficie de la API que acepta tráfico sin JWT ni APP KEY/AUTH KEY — es el canal
// Clienera Chat hablándole a un visitante anónimo (ver AGENTS.md: cualquier endpoint
// público nuevo debe dejarlo explícito en vez de colarse bajo un guard pensado para otra
// cosa). Nunca filtra por companyId recibido del cliente: siempre se deriva del
// widgetPublicKey/token, igual que ApiCredentialGuard deriva companyId del AUTH KEY.
@ApiTags('Clienera Chat widget (público)')
@Controller('widget')
export class WidgetController {
  constructor(
    private readonly service: WidgetService,
    private readonly storage: StorageService,
  ) {}

  @Get('by-slug/:slug')
  bootstrapBySlug(@Param('slug') slug: string) {
    return this.service.getBootstrapBySlug(slug);
  }

  @Get(':widgetPublicKey/bootstrap')
  bootstrap(@Param('widgetPublicKey') widgetPublicKey: string) {
    return this.service.getBootstrap(widgetPublicKey);
  }

  @Post(':widgetPublicKey/session')
  startSession(@Param('widgetPublicKey') widgetPublicKey: string, @Req() req: Request, @Body() dto: StartWidgetSessionDto) {
    this.guardRateLimit(req);
    return this.service.startSession(widgetPublicKey, dto.token);
  }

  @Post(':widgetPublicKey/messages')
  sendMessage(@Param('widgetPublicKey') widgetPublicKey: string, @Req() req: Request, @Body() dto: SendWidgetMessageDto) {
    this.guardRateLimit(req, dto.token);
    return this.service.sendMessage(widgetPublicKey, dto.token, dto.text);
  }

  @Get(':widgetPublicKey/messages')
  history(@Param('widgetPublicKey') widgetPublicKey: string, @Query('token') token: string) {
    if (!token) throw new BadRequestException('token requerido');
    return this.service.history(widgetPublicKey, token);
  }

  @Post(':widgetPublicKey/media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMIT_BYTES } }))
  sendMedia(
    @Param('widgetPublicKey') widgetPublicKey: string,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('token') token: string,
    @Body('caption') caption?: string,
  ) {
    this.guardRateLimit(req, token);
    if (!token) throw new BadRequestException('token requerido');
    return this.service.sendMedia(widgetPublicKey, token, file, caption);
  }

  @Get(':widgetPublicKey/media/:messageId')
  async media(
    @Param('widgetPublicKey') widgetPublicKey: string,
    @Param('messageId') messageId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) throw new BadRequestException('token requerido');
    const message = await this.service.resolveMedia(widgetPublicKey, token, messageId);
    const objectName = (message.mediaUrl as string).split('/').pop() as string;
    res.setHeader('Content-Type', message.mimeType || 'application/octet-stream');
    if (message.fileName) res.setHeader('Content-Disposition', `inline; filename="${message.fileName}"`);
    const stream = await this.storage.getObjectStream(objectName);
    pipeToResponse(stream, res);
  }

  private guardRateLimit(req: Request, token?: string) {
    const ip = req.ip || 'unknown';
    const okByIp = checkWidgetRateLimit(`ip:${ip}`);
    const okByToken = !token || checkWidgetRateLimit(`token:${token}`);
    if (!okByIp || !okByToken) throw new HttpException('Demasiados mensajes, espera un momento', HttpStatus.TOO_MANY_REQUESTS);
  }
}
