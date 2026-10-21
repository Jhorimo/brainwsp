import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const SETTINGS_ROW_ID = 1;

function effectiveMaxMediaSize(settings: { maxMediaSizeBytes: number; tempMaxMediaSizeBytes: number | null; tempMaxMediaSizeUntil: Date | null }) {
  const tempActive = !!settings.tempMaxMediaSizeBytes && !!settings.tempMaxMediaSizeUntil && settings.tempMaxMediaSizeUntil > new Date();
  return tempActive ? Math.max(settings.tempMaxMediaSizeBytes!, settings.maxMediaSizeBytes) : settings.maxMediaSizeBytes;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Fila unica (id fijo): si nunca se configuro nada, la crea con los valores por
  // defecto del schema (7 dias, 64MB) en vez de que el resto de la app tenga que andar
  // manejando "aun no existe" en cada lugar que lee estos ajustes.
  async get() {
    return this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: {},
      create: { id: SETTINGS_ROW_ID },
    });
  }

  async update(patch: { mediaRetentionDays?: number; maxMediaSizeBytes?: number; tempMaxMediaSizeBytes?: number | null; tempMaxMediaSizeUntil?: Date | null }) {
    return this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: patch,
      create: { id: SETTINGS_ROW_ID, ...patch },
    });
  }

  // Lo que ve el panel de superadmin: los ajustes, el límite que se aplica en este momento y el
  // techo del proxy (nginx/Cloudflare), que no se controla desde aquí — se declara en
  // UPLOAD_PROXY_LIMIT_MB para que el panel avise si el máximo configurado lo supera.
  async getForAdmin() {
    const settings = await this.get();
    const proxyMb = Number(process.env.UPLOAD_PROXY_LIMIT_MB);
    return {
      ...settings,
      effectiveMaxMediaSizeBytes: effectiveMaxMediaSize(settings),
      proxyLimitBytes: Number.isFinite(proxyMb) && proxyMb > 0 ? proxyMb * 1024 * 1024 : null,
    };
  }

  async setTemporaryLimit(maxBytes: number, hours: number) {
    const until = new Date(Date.now() + hours * 3_600_000);
    await this.update({ tempMaxMediaSizeBytes: maxBytes, tempMaxMediaSizeUntil: until });
    return this.getForAdmin();
  }

  async clearTemporaryLimit() {
    await this.update({ tempMaxMediaSizeBytes: null, tempMaxMediaSizeUntil: null });
    return this.getForAdmin();
  }

  // Límite del envío saliente (panel, respuestas rápidas, automatizaciones, widget). El worker
  // lee maxMediaSizeBytes directo por Prisma para la descarga entrante, sin la subida temporal.
  async maxMediaSizeBytes(): Promise<number> {
    return effectiveMaxMediaSize(await this.get());
  }

  async heaviestFiles() {
    // fileSize null se excluye a proposito: Postgres ordena NULL primero en un
    // "ORDER BY ... DESC" (no al final como uno esperaria), asi que sin este filtro los
    // 10 primeros eran mensajes SIN peso registrado (bug de larga data: gran parte de los
    // documentos/audios nunca guardo su fileSize al recibirse), no los realmente pesados.
    return this.prisma.message.findMany({
      where: { mediaUrl: { not: null }, fileSize: { not: null } },
      orderBy: { fileSize: 'desc' },
      take: 10,
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        type: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    });
  }

  async deleteFile(messageId: string) {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: { mediaUrl: true },
    });
    if (message.mediaUrl) {
      const objectName = message.mediaUrl.split('/').pop() as string;
      await this.storage.removeObject(objectName);
    }
    await this.prisma.message.update({ where: { id: messageId }, data: { mediaUrl: null } });
    return { ok: true };
  }

  // Reemplaza al script manual /root/mipse/brainwsp/purgar-media-vieja.sh (armado y
  // probado el 2026-09-11, nunca activado en el cron del servidor a pedido del usuario):
  // ahora vive dentro de la app, lee el valor configurado en vez de un "7 dias" fijo, y
  // corre solo sin depender de un cron externo por SSH. Criterio: todo lo que no sea
  // IMAGE ni PDF, mas viejo que el limite configurado, se borra de MinIO y se limpia
  // mediaUrl para no volver a seleccionarlo el dia siguiente. Los PDF se conservan (son
  // cotizaciones/facturas que los clientes vuelven a abrir semanas despues); el superadmin
  // los borra a mano desde el panel si hace falta espacio.
  @Cron('30 4 * * *')
  async purgeOldMedia() {
    const { mediaRetentionDays } = await this.get();
    const cutoff = new Date(Date.now() - mediaRetentionDays * 24 * 60 * 60 * 1000);

    // El filtro de PDF se hace en JS y no con NOT{...} de Prisma: mimeType y fileName pueden
    // ser NULL (los envios por API no siempre traen mimeType) y un NOT sobre NULL excluiria
    // por error de la purga documentos que si deben borrarse.
    const candidates = await this.prisma.message.findMany({
      where: { mediaUrl: { not: null }, type: { not: 'IMAGE' }, createdAt: { lt: cutoff } },
      select: { id: true, mediaUrl: true, type: true, mimeType: true, fileName: true },
    });
    const toPurge = candidates.filter((m) => !(m.type === 'DOCUMENT' && (m.mimeType === 'application/pdf' || m.fileName?.toLowerCase().endsWith('.pdf'))));

    if (toPurge.length === 0) {
      this.logger.log('purga de media: nada que purgar');
      return;
    }

    const objectNames = toPurge.map((m) => (m.mediaUrl as string).split('/').pop() as string);
    try {
      await this.storage.removeObjects(objectNames);
    } catch (error) {
      this.logger.error(`purga de media: fallo el borrado en MinIO, no se toca la base — ${error instanceof Error ? error.message : error}`);
      return;
    }

    const { count } = await this.prisma.message.updateMany({
      where: { id: { in: toPurge.map((m) => m.id) } },
      data: { mediaUrl: null },
    });
    this.logger.log(`purga de media: ${count} archivos borrados (retencion: ${mediaRetentionDays} dias)`);
  }
}
