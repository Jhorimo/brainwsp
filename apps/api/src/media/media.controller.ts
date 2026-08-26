import { Controller, Get, NotFoundException, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
  async get(
    @CurrentUser() user: JwtUser,
    @Param('messageId') messageId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: user.companyId },
      select: { mediaUrl: true, mimeType: true, fileName: true },
    });
    if (!message?.mediaUrl) throw new NotFoundException('Archivo no encontrado');

    const objectName = message.mediaUrl.split('/').pop() as string;
    res.setHeader('Content-Type', message.mimeType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    const disposition = download ? 'attachment' : 'inline';
    if (message.fileName) res.setHeader('Content-Disposition', `${disposition}; filename="${message.fileName}"`);

    // <audio>/<video> elements need real Range support to play at all in some browsers
    // (Safari in particular), not just to seek — without it they may refuse to start
    // playback rather than falling back to downloading the whole file.
    const range = req.headers.range;
    const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch) {
      const stat = await this.storage.statObject(objectName);
      const size = stat.size;
      // `bytes=-500` is a suffix range ("give me the last 500 bytes"), not "start at
      // byte 0" — browsers use it to jump straight to the tail of Ogg/WebM files to read
      // the last page's duration/seek info without downloading the whole file. Treating
      // the missing start as 0 served the wrong slice and broke duration detection.
      const isSuffixRange = rangeMatch[1] === '' && rangeMatch[2] !== '';
      const start = isSuffixRange ? Math.max(size - Number(rangeMatch[2]), 0) : (rangeMatch[1] ? Number(rangeMatch[1]) : 0);
      const end = isSuffixRange ? size - 1 : (rangeMatch[2] ? Number(rangeMatch[2]) : size - 1);
      const length = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(length));

      const stream = await this.storage.getPartialObjectStream(objectName, start, length);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      return;
    }

    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
