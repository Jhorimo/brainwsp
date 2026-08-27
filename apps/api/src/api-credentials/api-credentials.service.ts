import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptApiSecret, encryptApiSecret, generateApiCredential, generateAuthKey, hashApiSecret, verifyApiSecret } from '../common/utils/secret';
import type { ApiClientContext } from '../common/types/jwt-user';

@Injectable()
export class ApiCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureMaster(companyId: string) {
    const existing = await this.prisma.apiCredential.findFirst({
      where: { companyId, instanceId: null, active: true },
      select: {
        id: true,
        name: true,
        appKey: true,
        authKeyEncrypted: true,
        instanceId: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      const { authKeyEncrypted, ...credential } = existing;
      return { ...credential, hasAuthKey: authKeyEncrypted != null };
    }

    const { appKey, authKey } = generateApiCredential();
    let suffix = 1;
    let name = 'BrainPOS Maestro';
    while (await this.prisma.apiCredential.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) {
      suffix += 1;
      name = `BrainPOS Maestro ${suffix}`;
    }

    try {
      const credential = await this.prisma.apiCredential.create({
        data: {
          companyId,
          name,
          appKey,
          authHash: hashApiSecret(authKey),
          authKeyEncrypted: encryptApiSecret(authKey),
        },
        select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
      });
      return { ...credential, hasAuthKey: true, authKey };
    } catch (error) {
      // Dos pestañas pueden abrir el perfil a la vez. Si otra petición ya creó la
      // credencial maestra, devolvemos esa fila en vez de crear una segunda.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.apiCredential.findFirst({
          where: { companyId, instanceId: null, active: true },
          select: { id: true, name: true, appKey: true, authKeyEncrypted: true, instanceId: true, active: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });
        if (raced) {
          const { authKeyEncrypted, ...credential } = raced;
          return { ...credential, hasAuthKey: authKeyEncrypted != null };
        }
      }
      throw error;
    }
  }

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

  async rename(companyId: string, id: string, name: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');

    const existing = await this.prisma.apiCredential.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
    if (existing) throw new BadRequestException(`Ya existe una credencial llamada "${name}". Usa otro nombre.`);

    return this.prisma.apiCredential.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
    });
  }

  async revoke(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    if (!credential.instanceId) {
      await this.prisma.$transaction([
        this.prisma.apiCredential.update({ where: { id }, data: { active: false } }),
        this.prisma.apiCredential.updateMany({
          where: { companyId, authHash: credential.authHash, id: { not: id } },
          data: { active: false },
        }),
      ]);
      return { ...credential, active: false };
    }
    return this.prisma.apiCredential.update({ where: { id }, data: { active: false } });
  }

  async remove(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    if (!credential.instanceId) {
      throw new BadRequestException('La credencial maestra no se puede eliminar. Puedes regenerarla o revocarla para invalidar el AUTH KEY actual.');
    }
    await this.prisma.apiCredential.delete({ where: { id } });
    return { success: true };
  }

  async regenerate(companyId: string, id: string) {
    const credential = await this.prisma.apiCredential.findFirst({ where: { id, companyId } });
    if (!credential) throw new NotFoundException('Credencial no encontrada');
    const authKey = generateAuthKey();
    const authHash = hashApiSecret(authKey);
    const authKeyEncrypted = encryptApiSecret(authKey);
    const updated = !credential.instanceId
      ? (await this.prisma.$transaction([
          this.prisma.apiCredential.update({
            where: { id },
            data: { authHash, authKeyEncrypted, active: true },
            select: { id: true, name: true, appKey: true, instanceId: true, active: true, createdAt: true },
          }),
          this.prisma.apiCredential.updateMany({
            where: { companyId, authHash: credential.authHash, id: { not: id } },
            data: { authHash, authKeyEncrypted, active: true },
          }),
        ]))[0]
      : await this.prisma.apiCredential.update({
          where: { id },
          data: { authHash, authKeyEncrypted, active: true },
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

  // Variante solo-AUTH-KEY (Bearer), sin APP KEY: la usa la integración legacy de BrainPOS
  // Restaurante (ver apps/api/src/user-device), que autentica con `Authorization: Bearer
  // {authKey}` antes de conocer el APP KEY. `authHash` es determinístico (SHA-256 + pepper,
  // ver common/utils/secret.ts), así que se puede buscar directo por hash sin appKey.
  async authenticateByToken(token: string): Promise<ApiClientContext> {
    if (!token) throw new UnauthorizedException('AUTH KEY requerido');

    const authHash = hashApiSecret(token);
    // Puede haber varias filas con el mismo authHash: la credencial "maestra" (instanceId
    // null) y las que UserDeviceService clona por cada dispositivo POS que crea a partir
    // de ella (mismo AUTH KEY, APP KEY propio — ver createOrUpdateMasterInstance). El
    // Bearer siempre debe resolver a la maestra, nunca a una hija al azar, o
    // /api/user/check-session|logout-session no encuentran el dispositivo correcto.
    const credential =
      (await this.prisma.apiCredential.findFirst({ where: { authHash, active: true, instanceId: null } })) ??
      (await this.prisma.apiCredential.findFirst({ where: { authHash, active: true } }));
    if (!credential) throw new UnauthorizedException('AUTH KEY inválido');

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
