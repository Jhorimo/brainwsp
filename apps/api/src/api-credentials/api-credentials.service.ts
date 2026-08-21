import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptApiSecret, encryptApiSecret, generateApiCredential, generateAuthKey, hashApiSecret, verifyApiSecret } from '../common/utils/secret';
import type { ApiClientContext } from '../common/types/jwt-user';

@Injectable()
export class ApiCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const credentials = await this.prisma.apiCredential.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        appKey: true,
        authKeyEncrypted: true,
        instanceId: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return credentials.map(({ authKeyEncrypted, ...rest }) => ({ ...rest, hasAuthKey: authKeyEncrypted != null }));
  }

  async create(companyId: string, name: string, instanceId: string) {
    const existing = await this.prisma.apiCredential.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } } });
    if (existing) throw new BadRequestException(`Ya existe una credencial llamada "${name}". Usa otro nombre o elimina la anterior primero.`);

    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id: instanceId, companyId } });
    if (!instance) throw new BadRequestException('La instancia no pertenece a la empresa');

    const existingForInstance = await this.prisma.apiCredential.findUnique({ where: { instanceId } });
    if (existingForInstance) throw new BadRequestException(`La instancia "${instance.name}" ya tiene una credencial ("${existingForInstance.name}"). Elimínala primero para crear otra.`);

    const { appKey, authKey } = generateApiCredential();
    let credential;
    try {
      credential = await this.prisma.apiCredential.create({
        data: {
          companyId,
          instanceId,
          name,
          appKey,
          authHash: hashApiSecret(authKey),
          authKeyEncrypted: encryptApiSecret(authKey),
        },
        select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
      });
    } catch (error) {
      // Cierra la ventana de carrera entre los checks de arriba y este insert (dos
      // peticiones simultáneas para el mismo nombre o la misma instancia).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('instanceId')) {
          throw new BadRequestException(`La instancia "${instance.name}" ya tiene una credencial. Elimínala primero para crear otra.`);
        }
        throw new BadRequestException(`Ya existe una credencial llamada "${name}". Usa otro nombre o elimina la anterior primero.`);
      }
      throw error;
    }

    return { ...credential, authKey, warning: 'Guarda el AUTH KEY ahora. También podrás verlo más tarde desde el icono del ojo en la tabla.' };
  }

  async revoke(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    return this.prisma.apiCredential.update({ where: { id }, data: { active: false } });
  }

  async remove(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    await this.prisma.apiCredential.delete({ where: { id } });
    return { success: true };
  }

  async regenerate(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    const authKey = generateAuthKey();
    const updated = await this.prisma.apiCredential.update({
      where: { id },
      data: { authHash: hashApiSecret(authKey), authKeyEncrypted: encryptApiSecret(authKey), active: true },
      select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
    });
    return { ...updated, authKey, warning: 'Guarda el nuevo AUTH KEY. El anterior dejó de funcionar. También podrás ver este más tarde desde el icono del ojo en la tabla.' };
  }

  async reveal(companyId: string, id: string, actorUserId: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    if (!credential.authKeyEncrypted) {
      throw new BadRequestException('Esta credencial se creó antes de esta función. Regenera el AUTH KEY para poder verlo.');
    }

    await this.prisma.auditLog.create({
      data: { companyId, userId: actorUserId, action: 'api_credential.reveal_auth_key', entity: 'ApiCredential', entityId: id },
    }).catch(() => undefined);

    return { authKey: decryptApiSecret(credential.authKeyEncrypted) };
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
