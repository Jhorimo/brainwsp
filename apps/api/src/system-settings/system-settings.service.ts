import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MediaDedupService, objectNameFromUrl } from './media-dedup.service';

const SETTINGS_ROW_ID = 1;

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dedup: MediaDedupService,
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

  async update(patch: { mediaRetentionDays?: number; maxMediaSizeBytes?: number }) {
    return this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: patch,
      create: { id: SETTINGS_ROW_ID, ...patch },
    });
  }

  // Reusado por el worker via Prisma directo (mismo esquema, otro proceso) para el
  // limite en la descarga entrante — aca solo se usa para el envio saliente del panel.
  async maxMediaSizeBytes(): Promise<number> {
    const settings = await this.get();
    return settings.maxMediaSizeBytes;
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

  // Desde la unión de duplicados un mismo archivo puede estar en varios chats (y antes ya
  // lo compartían los stickers guardados y los reenvíos): se quita de este mensaje y el
  // objeto solo se borra de MinIO si ya nadie más lo usa.
  async deleteFile(messageId: string) {
    return this.dedup.exclusive(async () => {
      const message = await this.prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        select: { mediaUrl: true },
      });
      if (message.mediaUrl) {
        const unused = await this.dedup.unreferencedObjects([objectNameFromUrl(message.mediaUrl)], [messageId]);
        await this.storage.removeObjects(unused);
      }
      await this.prisma.message.update({ where: { id: messageId }, data: { mediaUrl: null } });
      return { ok: true };
    });
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
    return this.dedup.exclusive(() => this.purgeOldMediaUnlocked());
  }

  private async purgeOldMediaUnlocked() {
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

    // Un archivo compartido con un mensaje que no se purga (una imagen o PDF idéntico, un
    // reenvío reciente) o con un sticker/flujo se conserva: solo se quita de estos mensajes.
    const objectNames = toPurge.map((m) => objectNameFromUrl(m.mediaUrl as string));
    let removed = 0;
    try {
      const unused = await this.dedup.unreferencedObjects(objectNames, toPurge.map((m) => m.id));
      await this.storage.removeObjects(unused);
      removed = unused.length;
    } catch (error) {
      this.logger.error(`purga de media: fallo el borrado en MinIO, no se toca la base — ${error instanceof Error ? error.message : error}`);
      return;
    }

    const { count } = await this.prisma.message.updateMany({
      where: { id: { in: toPurge.map((m) => m.id) } },
      data: { mediaUrl: null },
    });
    this.logger.log(`purga de media: ${count} mensajes sin archivo, ${removed} archivos borrados del disco (retencion: ${mediaRetentionDays} dias)`);
  }
}
