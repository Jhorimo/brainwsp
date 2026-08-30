import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AgentAccess {
  departmentIds: string[];
  allowedModules: string[];
  // Módulos que incluye el plan de la empresa — [] significa sin restricción (mismo plan no
  // configurado, o plan sin asignar). Es el techo que aplica a todos los roles; allowedModules
  // es una restricción adicional que solo se usa para el rol AGENT.
  planModules: string[];
  // true si la licencia de la empresa ya venció (licenseRenewsAt en el pasado). No se mezcla
  // con planModules ([] ahí ya significa "sin restricción") — es una bandera aparte que, cuando
  // está prendida, corta el acceso a todos los módulos gateados sin importar planModules ni
  // allowedModules, hasta que la empresa renueve.
  licenseExpired: boolean;
}

@Injectable()
export class AgentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // Resolved fresh on every call (not cached in the JWT) so that an admin revoking a
  // department, módulo de agente, o cambiando el plan de la empresa, toma efecto de inmediato,
  // sin que el usuario necesite volver a iniciar sesión.
  async getAgentAccess(userId: string): Promise<AgentAccess> {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { allowedModules: true, company: { select: { licenseRenewsAt: true, plan: { select: { moduleKeys: true } } } } },
      }),
      this.prisma.departmentUser.findMany({ where: { userId }, select: { departmentId: true } }),
    ]);
    return {
      departmentIds: memberships.map((m) => m.departmentId),
      allowedModules: user?.allowedModules ?? [],
      planModules: user?.company?.plan?.moduleKeys ?? [],
      licenseExpired: !!user?.company?.licenseRenewsAt && user.company.licenseRenewsAt < new Date(),
    };
  }
}
