import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.quickReply.findMany({ where: { companyId }, orderBy: { shortcut: 'asc' } });
  }

  create(companyId: string, input: { shortcut: string; title: string; content: string }) {
    return this.prisma.quickReply.create({
      data: { companyId, shortcut: input.shortcut.trim().toLowerCase(), title: input.title.trim(), content: input.content },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una respuesta rápida con ese atajo');
      throw error;
    });
  }

  async update(companyId: string, id: string, input: { shortcut?: string; title?: string; content?: string; active?: boolean }) {
    const item = await this.prisma.quickReply.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Respuesta rápida no encontrada');
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        ...(input.shortcut !== undefined ? { shortcut: input.shortcut.trim().toLowerCase() } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una respuesta rápida con ese atajo');
      throw error;
    });
  }

  async remove(companyId: string, id: string) {
    const item = await this.prisma.quickReply.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Respuesta rápida no encontrada');
    await this.prisma.quickReply.delete({ where: { id } });
    return { success: true };
  }
}
