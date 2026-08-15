import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiCredentialsService } from '../../api-credentials/api-credentials.service';
import type { ApiClientContext } from '../types/jwt-user';

@Injectable()
export class ApiCredentialGuard implements CanActivate {
  constructor(private readonly credentials: ApiCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { apiClient?: ApiClientContext }>();
    const body = (request.body || {}) as Record<string, unknown>;
    const appKey = String(request.headers['x-app-key'] || body.appkey || body.appKey || '');
    const authKey = String(request.headers['x-auth-key'] || body.authkey || body.authKey || '');

    request.apiClient = await this.credentials.authenticate(appKey, authKey);
    return true;
  }
}
