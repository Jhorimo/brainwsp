import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtUser } from '../types/jwt-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');

    try {
      request.user = await this.jwtService.verifyAsync<JwtUser>(header.slice(7), {
        secret: process.env.JWT_SECRET || 'development-only-secret-change-me',
      });
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }
}
