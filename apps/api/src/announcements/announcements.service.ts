import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // Ultimos 20 anuncios, con "read" resuelto para el usuario actual en un solo query
  // (no N+1): se trae el listado de AnnouncementRead de este usuario para esos ids y se
  // cruza en memoria, mas simple que un LEFT JOIN crudo via $queryRaw para 20 filas.
  async listForUser(userId: string) {
    const announcements = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        text: true,
        createdAt: true,
        createdByUser: { select: { id: true, name: true } },
      },
    });
    if (announcements.length === 0) return [];

    const reads = await this.prisma.announcementRead.findMany({
      where: { userId, announcementId: { in: announcements.map((a) => a.id) } },
      select: { announcementId: true },
    });
    const readIds = new Set(reads.map((r) => r.announcementId));

    return announcements.map((a) => ({ ...a, read: readIds.has(a.id) }));
  }

  create(userId: string, text: string) {
    return this.prisma.announcement.create({
      data: { text, createdByUserId: userId },
      select: { id: true, text: true, createdAt: true },
    });
  }

  // Idempotente: si el usuario ya lo habia marcado, no hace nada raro (unique constraint).
  async markRead(userId: string, announcementId: string) {
    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: {},
      create: { announcementId, userId },
    });
    return { ok: true };
  }
}
