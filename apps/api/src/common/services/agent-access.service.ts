import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AgentAccess {
  departmentIds: string[];
  allowedModules: string[];
}

@Injectable()
export class AgentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // Resolved fresh on every call (not cached in the JWT) so that an admin revoking a
  // department or module takes effect immediately, without the agent needing to re-login.
  async getAgentAccess(userId: string): Promise<AgentAccess> {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { allowedModules: true } }),
      this.prisma.departmentUser.findMany({ where: { userId }, select: { departmentId: true } }),
    ]);
    return {
      departmentIds: memberships.map((m) => m.departmentId),
      allowedModules: user?.allowedModules ?? [],
    };
  }
}
