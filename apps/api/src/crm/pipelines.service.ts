import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  // Cada Departamento es su propio Pipeline de CRM — sus Etapas (`PipelineStage`) son las
  // mismas que se gestionan en "Equipo y agentes → Etapas", compartidas con Conversaciones.
  list(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId, active: true },
      include: {
        stages: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: { _count: { select: { deals: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
