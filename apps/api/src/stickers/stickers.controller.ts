import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { StorageService } from '../storage/storage.service';
import { StickersService } from './stickers.service';

class AddFromMessageDto {
  @ApiProperty()
  @IsUUID()
  messageId!: string;
}

const MAX_STICKER_BYTES = 8 * 1024 * 1024;

@ApiTags('Stickers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stickers')
export class StickersController {
  constructor(
    private readonly service: StickersService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_STICKER_BYTES } }))
  async upload(@CurrentUser() user: JwtUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.service.upload(user.companyId, file);
  }

  @Post('from-message')
  addFromMessage(@CurrentUser() user: JwtUser, @Body() dto: AddFromMessageDto) {
    return this.service.addFromMessage(user.companyId, dto.messageId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }

  // The tray needs to render thumbnails without exposing MinIO's internal URL to the
  // browser — same proxy-and-stream pattern as /media/:messageId.
  @Get(':id/file')
  async file(@CurrentUser() user: JwtUser, @Param('id') id: string, @Res() res: Response) {
    const sticker = await this.service.getOwned(user.companyId, id);
    const objectName = sticker.mediaUrl.split('/').pop() as string;
    res.setHeader('Content-Type', 'image/webp');
    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
