import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from './quick-replies.dto';
import { QuickRepliesService } from './quick-replies.service';

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

@ApiTags('Quick Replies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(
    private readonly service: QuickRepliesService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post('media')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES } }))
  uploadMedia(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.service.uploadMedia(file);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateQuickReplyDto) {
    return this.service.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR)
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateQuickReplyDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SUPERVISOR)
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }

  // Streams the attachment back through the API (auth'd) instead of exposing MinIO's
  // internal URL to the browser — same proxy pattern as /stickers/:id/file and /media/:messageId.
  // Also what the composer fetches when an agent clicks a quick reply with media, to turn it
  // back into a File and reuse the normal attach-and-send flow.
  @Get(':id/file')
  async file(@CurrentUser() user: JwtUser, @Param('id') id: string, @Res() res: Response) {
    const item = await this.service.getOwned(user.companyId, id);
    if (!item.mediaUrl) throw new BadRequestException('Esta respuesta rápida no tiene archivo adjunto');
    const objectName = item.mediaUrl.split('/').pop() as string;
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    if (item.fileName) res.setHeader('Content-Disposition', `inline; filename="${item.fileName}"`);
    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
