import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackType, IncidentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.incident.findMany({
      where: { companyId },
      include: {
        conversation: { select: { id: true, contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true } } } },
        department: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, userId: string, input: { conversationId: string; departmentId: string; type?: FeedbackType; subject: string; message: string }) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: input.conversationId, companyId } });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');

    const department = await this.prisma.department.findFirst({ where: { id: input.departmentId, companyId } });
    if (!department) throw new NotFoundException('Departamento no encontrado');

    return this.prisma.incident.create({
      data: {
        companyId,
        conversationId: input.conversationId,
        departmentId: input.departmentId,
        createdByUserId: userId,
        type: input.type || FeedbackType.BUG,
        subject: input.subject.trim(),
        message: input.message.trim(),
      },
      include: {
        conversation: { select: { id: true, contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true } } } },
        department: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(companyId: string, incidentId: string, requester: { id: string; role: UserRole }, status: IncidentStatus) {
    const incident = await this.prisma.incident.findFirst({ where: { id: incidentId, companyId } });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');

    const isAdmin = requester.role === UserRole.OWNER || requester.role === UserRole.ADMIN;
    if (!isAdmin) {
      const membership = await this.prisma.departmentUser.findUnique({
        where: { departmentId_userId: { departmentId: incident.departmentId, userId: requester.id } },
      });
      if (!membership) throw new ForbiddenException('Solo el área asignada puede actualizar esta incidencia');
    }

    return this.prisma.incident.update({
      where: { id: incidentId },
      data: { status },
      include: {
        conversation: { select: { id: true, contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true } } } },
        department: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } },
      },
    });
  }
}
