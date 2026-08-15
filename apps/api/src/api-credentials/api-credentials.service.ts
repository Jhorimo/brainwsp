import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiCredential, hashApiSecret, verifyApiSecret } from '../common/utils/secret';
import type { ApiClientContext } from '../common/types/jwt-user';

@Injectable()
export class ApiCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.apiCredential.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        appKey: true,
        instanceId: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, name: string, instanceId?: string) {
    if (instanceId) {
      const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id: instanceId, companyId } });
      if (!instance) throw new BadRequestException('La instancia no pertenece a la empresa');
    }

    const { appKey, authKey } = generateApiCredential();
    const credential = await this.prisma.apiCredential.create({
      data: {
        companyId,
        instanceId,
        name,
        appKey,
        authHash: hashApiSecret(authKey),
      },
      select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
    });

    return { ...credential, authKey, warning: 'Guarda el AUTH KEY ahora. No se volverá a mostrar.' };
  }

  async revoke(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    return this.prisma.apiCredential.update({ where: { id }, data: { active: false } });
  }

  async authenticate(appKey: string, authKey: string): Promise<ApiClientContext> {
    if (!appKey || !authKey) throw new UnauthorizedException('APP KEY y AUTH KEY son requeridos');

    const credential = await this.prisma.apiCredential.findUnique({ where: { appKey } });
    if (!credential?.active || !verifyApiSecret(authKey, credential.authHash)) {
      throw new UnauthorizedException('Credenciales API inválidas');
    }

    await this.prisma.apiCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      credentialId: credential.id,
      companyId: credential.companyId,
      instanceId: credential.instanceId,
      appKey: credential.appKey,
    };
  }
}
