import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { AgentAccessService } from '../services/agent-access.service';
import type { ModuleKey } from '../constants/modules';
import type { JwtUser } from '../types/jwt-user';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly agentAccess: AgentAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;
    if (!user) return false;
    // Module restrictions only ever apply to the Agent role — Owner/Admin/Supervisor
    // always see every module, same as they aren't restricted by department.
    if (user.role !== UserRole.AGENT) return true;

    const { allowedModules } = await this.agentAccess.getAgentAccess(user.sub);
    // Empty list = no restriction configured (legacy/default) — keep today's behavior.
    if (allowedModules.length === 0) return true;
    return allowedModules.includes(required);
  }
}
