import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('Media')
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(':messageId')
  async get(@CurrentUser() user: JwtUser, @Param('messageId') messageId: string, @Res() res: Response) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: user.companyId },
      select: { mediaUrl: true, mimeType: true, fileName: true },
    });
    if (!message?.mediaUrl) throw new NotFoundException('Archivo no encontrado');

    const objectName = message.mediaUrl.split('/').pop() as string;
    res.setHeader('Content-Type', message.mimeType || 'application/octet-stream');
    if (message.fileName) res.setHeader('Content-Disposition', `inline; filename="${message.fileName}"`);

    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
