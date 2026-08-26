import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InstanceStatus, Prisma, type WhatsAppInstance } from '@prisma/client';
import QRCode from 'qrcode';
import type { ApiClientContext } from '../common/types/jwt-user';
import { slugify } from '../common/utils/slug';
import { InstancesService } from '../instances/instances.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAppDto, CreateDeviceDto } from './user-device.dto';

const QR_WAIT_TIMEOUT_MS = 15_000;
const QR_WAIT_INTERVAL_MS = 300;

@Injectable()
export class UserDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instances: InstancesService,
  ) {}

  // Dos modos, según si el AUTH KEY que autenticó la petición ya está atado a una
  // instancia (client.instanceId):
  //
  // - Tradicional (client.instanceId set): esta credencial es 1:1 con una sola instancia
  //   (la que ya tenía, o la primera que crea). Igual que antes.
  // - AUTH KEY "maestro" (client.instanceId null, típicamente la credencial "Principal"
  //   creada al registrar la empresa): MUCHOS clientes de brainpos_rest comparten el mismo
  //   AUTH KEY. brainpos_rest nunca manda un identificador de cliente explícito en este
  //   payload — pero sí manda su propio dominio como `webhook_url` sin que se le pida (ver
  //   ajuste_model.php::whatsappGetDomainUrl). Lo combinamos con el teléfono declarado:
  //   cada dominio+teléfono = una instancia y un APP KEY propios.
  async createDevice(client: ApiClientContext, dto: CreateDeviceDto) {
    const name = dto.name.trim();
    // Solo un valor declarado hasta que se conecte de verdad: el worker sobreescribe este
    // campo con el número real que reporte Baileys en cuanto abra la sesión (ver
    // apps/worker/src/session-manager.ts, evento `connection.update` -> 'open').
    const phone = dto.phone.trim();

    const instance = client.instanceId
      ? await this.updateOwnedInstance(client.instanceId, client.companyId, name, phone)
      : await this.createOrUpdateMasterInstance(client, name, phone, dto.webhook_url?.trim());

    return {
      success: true,
      data: { uuid: instance.id, name: instance.name, phone: instance.phoneNumber },
    };
  }

  private async updateOwnedInstance(instanceId: string, companyId: string, name: string, phone: string) {
    // Si client.instanceId viene seteado, la instancia ya existe por construcción (nace
    // atada 1:1 a esa credencial, ver createOrUpdateMasterInstance más abajo, o el flujo
    // manual del panel en ApiCredentialsService.create). No hay rama de "crear" aquí.
    const existing = await this.prisma.whatsAppInstance.findFirst({ where: { id: instanceId, companyId, active: true } });
    if (!existing) throw new NotFoundException('Dispositivo no encontrado para este AUTH KEY');
    return this.prisma.whatsAppInstance.update({ where: { id: existing.id }, data: { name, phoneNumber: phone } });
  }

  private async createOrUpdateMasterInstance(client: ApiClientContext, name: string, phone: string, webhookUrl: string | undefined) {
    if (!webhookUrl) {
      throw new BadRequestException('webhook_url es requerido para crear un dispositivo con un AUTH KEY compartido entre varios clientes');
    }

    const normalizedWebhookUrl = this.normalizeWebhookUrl(webhookUrl);
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const posClientKey = `${normalizedWebhookUrl}|${normalizedPhone}`;

    // Esta instancia necesita su PROPIO APP KEY (distinto por cliente), pero comparte el
    // mismo AUTH KEY (mismo authHash) que la credencial maestra que autenticó la
    // petición — así también funciona después para /api/create-message (appkey+authkey),
    // sin que el AUTH KEY tenga que cambiar entre clientes.
    const master = await this.prisma.apiCredential.findUnique({ where: { id: client.credentialId } });
    if (!master) throw new NotFoundException('Credencial maestra no encontrada');

    const provision = async () => this.prisma.$transaction(async (tx) => {
      const existing = await tx.whatsAppInstance.findFirst({
        where: { companyId: client.companyId, posClientKey },
      });
      if (existing) {
        const updated = await tx.whatsAppInstance.update({ where: { id: existing.id }, data: { name, phoneNumber: phone, active: true } });
        const credential = await tx.apiCredential.findUnique({ where: { instanceId: existing.id } });
        if (credential) {
          await tx.apiCredential.update({
            where: { id: credential.id },
            data: { authHash: master.authHash, authKeyEncrypted: master.authKeyEncrypted, active: true },
          });
        } else {
          await tx.apiCredential.create({
            data: {
              companyId: client.companyId,
              instanceId: existing.id,
              name: `POS · ${normalizedWebhookUrl} · ${normalizedPhone}`,
              appKey: randomUUID(),
              authHash: master.authHash,
              authKeyEncrypted: master.authKeyEncrypted,
            },
          });
        }
        return updated;
      }

      const slug = await this.generateUniqueSlug(client.companyId, name, tx);
      const instance = await tx.whatsAppInstance.create({
        data: { companyId: client.companyId, name, slug, phoneNumber: phone, posWebhookUrl: normalizedWebhookUrl, posClientKey },
      });
      await tx.apiCredential.create({
        data: {
          companyId: client.companyId,
          instanceId: instance.id,
          name: `POS · ${normalizedWebhookUrl} · ${normalizedPhone}`,
          appKey: randomUUID(),
          authHash: master.authHash,
          authKeyEncrypted: master.authKeyEncrypted,
        },
      });
      return instance;
    });

    try {
      return await provision();
    } catch (error) {
      // La restricción unique(companyId, posClientKey) resuelve dos altas simultáneas
      // del mismo POS. La petición perdedora reintenta y actualiza la instancia ganadora.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return provision();
      }
      throw error;
    }
  }

  private normalizeWebhookUrl(webhookUrl: string): string {
    try {
      const parsed = new URL(webhookUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
      // brainpos_rest siempre manda el dominio raíz. Guardar el origin evita duplicar una
      // instancia por una barra final, mayúsculas o una ruta accidental.
      return parsed.origin.toLowerCase();
    } catch {
      throw new BadRequestException('webhook_url debe ser una URL HTTP válida');
    }
  }

  private async generateUniqueSlug(companyId: string, name: string, db: Pick<Prisma.TransactionClient, 'whatsAppInstance'> = this.prisma): Promise<string> {
    const root = slugify(name);
    let candidate = root;
    let attempt = 1;
    while (attempt <= 50) {
      const existing = await db.whatsAppInstance.findUnique({ where: { companyId_slug: { companyId, slug: candidate } }, select: { id: true } });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${root}-${attempt}`;
    }
    return `${root}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async createApp(client: ApiClientContext, dto: CreateAppDto) {
    // Modo tradicional: el APP KEY es el de la credencial que autenticó la petición.
    // Modo maestro: brainpos_rest manda `device` (el uuid que devolvió /api/user/device)
    // — cada dispositivo tiene su propia credencial/APP KEY, distinta de la maestra.
    const instance = await this.getOwnedInstance(client, dto.device);
    const credential = await this.prisma.apiCredential.findUnique({ where: { instanceId: instance.id } });
    if (!credential) throw new NotFoundException('No se encontró la credencial de este dispositivo');
    return { success: true, data: { key: credential.appKey } };
  }

  async createSession(client: ApiClientContext, uuid: string) {
    const instance = await this.getOwnedInstance(client, uuid);

    if (instance.status === InstanceStatus.CONNECTED) {
      return { success: false, message: 'El dispositivo ya está conectado' };
    }

    await this.instances.connect(client.companyId, instance.id);

    const qr = await this.waitForQr(instance.id);
    if (!qr) {
      return { success: false, message: 'No se pudo generar el código QR, intenta nuevamente' };
    }

    // El frontend de brainpos_rest hace `$('#wa_qr_image').attr('src', data.qr)` directo,
    // sin librería de QR propia: hay que entregarle una imagen ya renderizada, no el string
    // crudo que emite Baileys (que sí acepta el panel web con qrcode.react).
    const qrImage = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
    return { success: true, data: { qr: qrImage }, expires_in: 60 };
  }

  async checkSession(client: ApiClientContext, uuid: string) {
    const instance = await this.getOwnedInstance(client, uuid);
    return {
      success: true,
      data: {
        connected: instance.status === InstanceStatus.CONNECTED,
        phone: instance.phoneNumber,
      },
    };
  }

  async logoutSession(client: ApiClientContext, uuid: string) {
    const instance = await this.getOwnedInstance(client, uuid);
    await this.instances.logout(client.companyId, instance.id);
    return { success: true };
  }

  // Modo tradicional: el uuid (si viene) debe coincidir con la instancia 1:1 de la
  // credencial — capa extra de aislamiento, aunque companyId ya alcanza para eso.
  // Modo maestro: la credencial no está atada a ninguna instancia en particular, así que
  // el uuid (siempre requerido aquí) es el único identificador; sigue estando protegido
  // por companyId, así que un AUTH KEY nunca puede tocar instancias de otra empresa.
  private async getOwnedInstance(client: ApiClientContext, uuid?: string): Promise<WhatsAppInstance> {
    if (client.instanceId) {
      if (uuid && uuid !== client.instanceId) throw new NotFoundException('Dispositivo no encontrado');
      const instance = await this.prisma.whatsAppInstance.findFirst({
        where: { id: client.instanceId, companyId: client.companyId, active: true },
      });
      if (!instance) throw new NotFoundException('Dispositivo no encontrado para este AUTH KEY');
      return instance;
    }

    if (!uuid) throw new NotFoundException('Falta el identificador del dispositivo');
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { id: uuid, companyId: client.companyId, active: true },
    });
    if (!instance) throw new NotFoundException('Dispositivo no encontrado');
    return instance;
  }

  private async waitForQr(instanceId: string): Promise<string | null> {
    const deadline = Date.now() + QR_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = await this.prisma.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { qr: true, status: true },
      });
      if (current?.qr) return current.qr;
      if (current?.status === InstanceStatus.CONNECTED) return null;
      await new Promise((resolve) => setTimeout(resolve, QR_WAIT_INTERVAL_MS));
    }
    return null;
  }
}
