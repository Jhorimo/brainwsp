import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MAX_DIMENSION = 512;

@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(companyId: string) {
    return this.prisma.stickerItem.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async upload(companyId: string, file: Express.Multer.File) {
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('El archivo debe ser una imagen');

    // WhatsApp only accepts webp for sticker messages — whatever the agent uploaded
    // (png/jpg/an existing webp) gets normalized to a square-ish webp here so it always
    // arrives as an actual sticker rather than a broken/rejected attachment.
    const webp = await sharp(file.buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    const { internalUrl } = await this.storage.uploadBuffer(webp, 'image/webp', 'webp');
    return this.prisma.stickerItem.create({ data: { companyId, mediaUrl: internalUrl } });
  }

  // Saves a sticker the business already received/sent (in `Message.mediaUrl`, already
  // webp — it came from or went to WhatsApp as a real sticker) into the reusable tray,
  // without re-uploading or re-converting anything.
  async addFromMessage(companyId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId, type: 'STICKER' },
      select: { mediaUrl: true },
    });
    if (!message?.mediaUrl) throw new NotFoundException('Mensaje de sticker no encontrado');
    return this.prisma.stickerItem.create({ data: { companyId, mediaUrl: message.mediaUrl } });
  }

  async remove(companyId: string, id: string) {
    const sticker = await this.prisma.stickerItem.findFirst({ where: { id, companyId } });
    if (!sticker) throw new NotFoundException('Sticker no encontrado');
    await this.prisma.stickerItem.delete({ where: { id } });
    return { success: true };
  }

  async getOwned(companyId: string, id: string) {
    const sticker = await this.prisma.stickerItem.findFirst({ where: { id, companyId } });
    if (!sticker) throw new NotFoundException('Sticker no encontrado');
    return sticker;
  }
}
