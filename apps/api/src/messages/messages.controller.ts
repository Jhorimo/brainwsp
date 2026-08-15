import { Body, Controller, Get, Param, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ApiCredentialsService } from '../api-credentials/api-credentials.service';
import { ApiCredentialGuard } from '../common/guards/api-credential.guard';
import type { ApiClientContext } from '../common/types/jwt-user';
import { SendDocumentDto, SendTextDto } from './messages.dto';
import { MessagesService } from './messages.service';

type ApiRequest = Request & { apiClient: ApiClientContext };

@ApiTags('Public messaging API')
@UseGuards(ApiCredentialGuard)
@Controller('v1/messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Post('text')
  text(@Req() req: ApiRequest, @Body() dto: SendTextDto) {
    return this.service.sendText(req.apiClient, dto.to, dto.message, dto.instance);
  }

  @Post('document')
  document(@Req() req: ApiRequest, @Body() dto: SendDocumentDto) {
    return this.service.sendDocument(req.apiClient, {
      to: dto.to,
      url: dto.url,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      caption: dto.caption,
      instanceSlug: dto.instance,
    });
  }

  @Get(':id')
  status(@Req() req: ApiRequest, @Param('id') id: string) {
    return this.service.status(req.apiClient, id);
  }
}

@ApiTags('Legacy BrainPOS/ERP API')
@Controller('create-message')
export class LegacyMessagesController {
  constructor(
    private readonly service: MessagesService,
    private readonly credentials: ApiCredentialsService,
  ) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  async create(@Req() req: Request, @Body() dto: SendTextDto) {
    // Important: PHP CURLOPT_POSTFIELDS with an array sends multipart/form-data.
    // Multer runs before parameter pipes, so authenticate here instead of a guard
    // (guards execute before Multer and cannot read multipart body fields).
    const appKey = String(req.headers['x-app-key'] || dto.appkey || dto.appKey || '');
    const authKey = String(req.headers['x-auth-key'] || dto.authkey || dto.authKey || '');
    const client = await this.credentials.authenticate(appKey, authKey);
    return this.service.sendText(client, dto.to, dto.message, dto.instance);
  }
}
