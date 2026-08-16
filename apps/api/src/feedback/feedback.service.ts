import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackStatus, FeedbackType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.feedback.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(companyId: string, userId: string, input: { type?: FeedbackType; subject: string; message: string; departmentId?: string }) {
    return this.prisma.feedback.create({
      data: {
        companyId,
        userId,
        type: input.type || FeedbackType.SUGGESTION,
        subject: input.subject.trim(),
        message: input.message.trim(),
        departmentId: input.departmentId || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(companyId: string, id: string, status: FeedbackStatus) {
    const feedback = await this.prisma.feedback.findFirst({ where: { id, companyId } });
    if (!feedback) throw new NotFoundException('Reporte no encontrado');
    return this.prisma.feedback.update({
      where: { id },
      data: { status },
      include: {
        user: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }
}
