import { Injectable, NotFoundException } from '@nestjs/common';
import { InstanceStatus } from '@prisma/client';
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

  async createDevice(client: ApiClientContext, dto: CreateDeviceDto) {
    const name = dto.name.trim();
    // Solo un valor declarado hasta que se conecte de verdad: el worker sobreescribe este
    // campo con el número real que reporte Baileys en cuanto abra la sesión (ver
    // apps/worker/src/session-manager.ts, evento `connection.update` -> 'open').
    const phone = dto.phone.trim();

    const existing = client.instanceId
      ? await this.prisma.whatsAppInstance.findFirst({ where: { id: client.instanceId, companyId: client.companyId, active: true } })
      : null;

    const instance = existing
      ? await this.prisma.whatsAppInstance.update({ where: { id: existing.id }, data: { name, phoneNumber: phone } })
      : await this.provisionInstance(client, name, phone);

    return {
      success: true,
      data: { uuid: instance.id, name: instance.name, phone: instance.phoneNumber },
    };
  }

  // Primera vez que se usa el AUTH KEY "Principal" (creado sin instancia al registrar la
  // empresa, ver AuthService.register): crea la instancia de WhatsApp y la enlaza a esta
  // misma credencial, para que quede disponible en /api/user/create-session, check-session
  // y logout-session sin que el OWNER tenga que crearla a mano en el panel.
  private async provisionInstance(client: ApiClientContext, name: string, phone: string) {
    const slug = await this.generateUniqueSlug(client.companyId, name);
    const instance = await this.prisma.whatsAppInstance.create({
      data: { companyId: client.companyId, name, slug, phoneNumber: phone },
    });
    await this.prisma.apiCredential.update({
      where: { id: client.credentialId },
      data: { instanceId: instance.id },
    });
    return instance;
  }

  private async generateUniqueSlug(companyId: string, name: string): Promise<string> {
    const root = slugify(name);
    let candidate = root;
    let attempt = 1;
    while (attempt <= 50) {
      const existing = await this.prisma.whatsAppInstance.findUnique({ where: { companyId_slug: { companyId, slug: candidate } }, select: { id: true } });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${root}-${attempt}`;
    }
    return `${root}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async createApp(client: ApiClientContext, _dto: CreateAppDto) {
    // El APP KEY ya existe: nació junto con el AUTH KEY (la misma ApiCredential) que
    // autenticó esta petición. No hay nada que crear, solo se lo devolvemos a BrainPOS
    // Restaurante, que lo guarda localmente para futuras llamadas.
    return { success: true, data: { key: client.appKey } };
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

  private async getOwnedInstance(client: ApiClientContext, uuid?: string) {
    // Cada AUTH KEY está atado 1:1 a una instancia (ApiCredential.instanceId es único).
    // Si la ruta trae uuid, debe coincidir con esa instancia — evita que un AUTH KEY
    // opere sobre el dispositivo de otra empresa.
    if (!client.instanceId) throw new NotFoundException('Esta credencial no tiene un dispositivo de WhatsApp asociado');

    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { id: client.instanceId, companyId: client.companyId, active: true },
    });
    if (!instance) throw new NotFoundException('Dispositivo no encontrado para este AUTH KEY');
    if (uuid && uuid !== instance.id) throw new NotFoundException('Dispositivo no encontrado');
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
