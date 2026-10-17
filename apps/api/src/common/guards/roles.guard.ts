import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtUser } from '../types/jwt-user';

// Nombres en español para el mensaje de error — p.ej. SUPERADMIN pertenece a la misma
// empresa que administra (ver seed.ts) pero a propósito no puede escribir directamente
// sobre sus datos operativos (solo impersonando al Owner), así que se topa con este guard
// seguido y necesita saber qué cuenta sí puede, no solo "Forbidden resource" en inglés.
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPERADMIN]: 'Superadmin',
  [UserRole.OWNER]: 'Dueño',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.SUPERVISOR]: 'Supervisor',
  [UserRole.AGENT]: 'Agente',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    if (request.user && roles.includes(request.user.role)) return true;
    const labels = roles.map((role) => ROLE_LABELS[role]).join(' o ');
    throw new ForbiddenException(`No tienes permiso para esta acción. Solo ${labels} puede hacerlo.`);
  }
}
