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
    const required = this.reflector.getAllAndOverride<ModuleKey | ModuleKey[] | undefined>(REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    // Un array en @RequireModule es "cualquiera de estos" — ver el comentario en el decorador.
    const requiredKeys = Array.isArray(required) ? required : [required];

    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;
    if (!user) return false;

    const { allowedModules, planModules, licenseExpired } = await this.agentAccess.getAgentAccess(user.sub);

    // Licencia vencida corta todo (salvo SUPERADMIN, que opera la plataforma y no debería
    // quedar bloqueado por el estado de facturación de la empresa a la que pertenece su cuenta)
    // — el usuario sigue pudiendo entrar y ver "Mi Plan" para pagar, pero nada gateado por
    // módulo. Se revisa antes que planModules porque es una condición más fuerte.
    if (licenseExpired && user.role !== UserRole.SUPERADMIN) return false;

    // El plan de la empresa es el techo real para todos los roles — si no lo incluye, ni el
    // Owner lo ve hasta subir de plan. [] = plan sin restricción configurada (todos los módulos).
    if (planModules.length > 0 && !requiredKeys.some((key) => planModules.includes(key))) return false;

    // Por debajo del techo del plan, allowedModules es una restricción adicional que solo
    // aplica al rol AGENT — Owner/Admin/Supervisor no se limitan por departamento/módulo propio.
    if (user.role !== UserRole.AGENT) return true;
    if (allowedModules.length === 0) return true;
    return requiredKeys.some((key) => allowedModules.includes(key));
  }
}
