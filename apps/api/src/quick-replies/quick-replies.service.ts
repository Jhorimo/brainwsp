import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

type Attachment = { mediaUrl: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };
type MediaInput = { mediaUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null; extraAttachments?: Attachment[] | null };

// Solo los campos conocidos: lo que llega del cliente no se guarda tal cual en el JSON.
function cleanAttachments(list: Attachment[] | null | undefined) {
  const items = (list ?? []).map((item) => ({
    mediaUrl: item.mediaUrl,
    fileName: item.fileName || null,
    mimeType: item.mimeType || null,
    fileSize: item.fileSize ?? null,
  }));
  return items.length ? (items as Prisma.InputJsonValue) : Prisma.DbNull;
}

export function extraAttachmentsOf(item: { extraAttachments: Prisma.JsonValue }): Attachment[] {
  return Array.isArray(item.extraAttachments) ? (item.extraAttachments as unknown as Attachment[]) : [];
}

@Injectable()
export class QuickRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly systemSettings: SystemSettingsService,
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
    const maxBytes = await this.systemSettings.maxMediaSizeBytes();
    if (file.size > maxBytes) {
      throw new BadRequestException(`El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB)`);
    }
    const { internalUrl } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));
    return { mediaUrl: internalUrl, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size };
  }

  create(companyId: string, input: { shortcut: string; title: string; content?: string } & MediaInput) {
    if (!input.content?.trim() && !input.mediaUrl) throw new BadRequestException('Agrega un mensaje o un archivo adjunto');
    if (!input.mediaUrl && input.extraAttachments?.length) throw new BadRequestException('Falta el archivo principal');
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
        extraAttachments: cleanAttachments(input.mediaUrl ? input.extraAttachments : null),
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
    const nextExtras = input.extraAttachments !== undefined ? input.extraAttachments : extraAttachmentsOf(item);
    if (!nextMediaUrl && nextExtras?.length) throw new BadRequestException('Falta el archivo principal');
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
        ...(input.extraAttachments !== undefined ? { extraAttachments: cleanAttachments(input.extraAttachments) } : {}),
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
