import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiCredentialsService } from '../../api-credentials/api-credentials.service';
import type { ApiClientContext } from '../types/jwt-user';

// A diferencia de ApiCredentialGuard (requiere APP KEY + AUTH KEY), esta variante autentica
// solo con el AUTH KEY como Bearer token. La usa la integración legacy de BrainPOS
// Restaurante (brainpos_rest/models/ajuste_model.php::whatsappBraintechApiRequest), que
// envía `Authorization: Bearer {authkey}` y todavía no conoce el APP KEY al crear el
// dispositivo — ese código no se puede modificar.
@Injectable()
export class ApiUserTokenGuard implements CanActivate {
  constructor(private readonly credentials: ApiCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { apiClient?: ApiClientContext }>();
    const header = String(request.headers['authorization'] || '');
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

    request.apiClient = await this.credentials.authenticateByToken(token);
    return true;
  }
}
