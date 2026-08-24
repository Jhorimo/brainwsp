import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type MediaInput = { mediaUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };

@Injectable()
export class QuickRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(companyId: string) {
    return this.prisma.quickReply.findMany({ where: { companyId }, orderBy: { shortcut: 'asc' } });
  }

  async getOwned(companyId: string, id: string) {
    const item = await this.prisma.quickReply.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Respuesta rápida no encontrada');
    return item;
  }

  async uploadMedia(file: Express.Multer.File) {
    const { internalUrl } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));
    return { mediaUrl: internalUrl, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size };
  }

  create(companyId: string, input: { shortcut: string; title: string; content?: string } & MediaInput) {
    if (!input.content?.trim() && !input.mediaUrl) throw new BadRequestException('Agrega un mensaje o un archivo adjunto');
    return this.prisma.quickReply.create({
      data: {
        companyId,
        shortcut: input.shortcut.trim().toLowerCase(),
        title: input.title.trim(),
        content: input.content || null,
        mediaUrl: input.mediaUrl || null,
        fileName: input.fileName || null,
        mimeType: input.mimeType || null,
        fileSize: input.fileSize ?? null,
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una respuesta rápida con ese atajo');
      throw error;
    });
  }

  async update(companyId: string, id: string, input: { shortcut?: string; title?: string; content?: string; active?: boolean } & MediaInput) {
    const item = await this.getOwned(companyId, id);
    const nextContent = input.content !== undefined ? input.content : item.content;
    const nextMediaUrl = input.mediaUrl !== undefined ? input.mediaUrl : item.mediaUrl;
    if (!nextContent?.trim() && !nextMediaUrl) throw new BadRequestException('Agrega un mensaje o un archivo adjunto');
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        ...(input.shortcut !== undefined ? { shortcut: input.shortcut.trim().toLowerCase() } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl } : {}),
        ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
        ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}),
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una respuesta rápida con ese atajo');
      throw error;
    });
  }

  async remove(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.prisma.quickReply.delete({ where: { id } });
    return { success: true };
  }
}
