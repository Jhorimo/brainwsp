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
    // <img>/<video>/<audio> tags can't send an Authorization header, so media
    // URLs fall back to a `?token=` query param carrying the same JWT.
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (request.query.token as string | undefined);
    if (!token) throw new UnauthorizedException('Token requerido');

    try {
      request.user = await this.jwtService.verifyAsync<JwtUser>(token, {
        secret: process.env.JWT_SECRET || 'development-only-secret-change-me',
      });
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }
}
