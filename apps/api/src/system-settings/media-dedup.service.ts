import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// Nombre del objeto en MinIO a partir de la URL interna guardada (`http://minio:9000/<bucket>/<objeto>`).
export function objectNameFromUrl(url: string) {
  return url.split('/').pop() as string;
}

// Todos los objetos que subimos se llaman `<uuid>[.ext]`; con esto se encuentran dentro de
// cualquier texto (JSON de flujos, configuración del widget, etc.) sin conocer su forma.
const OBJECT_NAME_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.[A-Za-z0-9]+)?/g;

const HASH_BATCH = 200;
// Un mensaje recién creado puede estar todavía en la cola del worker (que descarga su
// archivo para mandarlo a WhatsApp): solo se tocan los que ya tienen al menos una hora.
const MIN_AGE_MS = 60 * 60 * 1000;
const MISSING = 'missing';

export type DedupReport = {
  apply: boolean;
  hashed: number;
  missing: number;
  groups: number;
  duplicateObjects: number;
  repointedMessages: number;
  repointedQuickReplies: number;
  deletedObjects: number;
  keptReferenced: number;
  freedBytes: number;
  top: { fileName: string | null; copies: number; bytes: number }[];
};

// Une archivos repetidos de MinIO: el mismo .zip que entra por 20 líneas a la vez se
// guardaba 20 veces. Cada noche calcula la huella (SHA-256) de los archivos nuevos, deja
// el más antiguo de cada grupo idéntico como el único, apunta todos los mensajes y
// respuestas rápidas a ese, y recién después borra las copias que ya nadie usa.
// El panel pide los archivos por id de mensaje (/media/:messageId), así que no nota nada.
@Injectable()
export class MediaDedupService {
  private readonly logger = new Logger(MediaDedupService.name);
  // Purga, botón "borrar archivo" y unión de duplicados borran objetos: nunca a la vez.
  private lock: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  // Sin MEDIA_DEDUP_APPLY=true solo simula: calcula huellas y reporta, sin mover ni borrar.
  @Cron(process.env.MEDIA_DEDUP_CRON || '0 4 * * *')
  async scheduled() {
    try {
      await this.run({ apply: process.env.MEDIA_DEDUP_APPLY === 'true' });
    } catch (error) {
      this.logger.error(`duplicados: falló — ${error instanceof Error ? error.message : error}`);
    }
  }

  run(opts: { apply: boolean }) {
    return this.exclusive(() => this.runUnlocked(opts));
  }

  private async runUnlocked({ apply }: { apply: boolean }): Promise<DedupReport> {
    const report: DedupReport = {
      apply, hashed: 0, missing: 0, groups: 0, duplicateObjects: 0, repointedMessages: 0,
      repointedQuickReplies: 0, deletedObjects: 0, keptReferenced: 0, freedBytes: 0, top: [],
    };
    const hashCache = new Map<string, string>();
    await this.hashPendingMessages(report, hashCache);

    // Grupos por huella: varios objetos distintos con el mismo contenido.
    const rows = await this.prisma.$queryRaw<{ id: string; mediaUrl: string; hash: string; createdAt: Date; fileName: string | null }[]>`
      SELECT id, "mediaUrl", metadata->>'mediaHash' AS hash, "createdAt", "fileName"
      FROM "Message"
      WHERE "mediaUrl" IS NOT NULL AND metadata->>'mediaHash' IS NOT NULL AND metadata->>'mediaHash' <> ${MISSING}
      ORDER BY "createdAt" ASC, id ASC`;
    // Las respuestas rápidas son pocas: su huella se calcula en cada corrida, sin guardarla.
    const quickReplies = await this.prisma.quickReply.findMany({
      where: { mediaUrl: { not: null }, createdAt: { lt: new Date(Date.now() - MIN_AGE_MS) } },
      select: { id: true, mediaUrl: true, createdAt: true, fileName: true },
    });
    for (const quickReply of quickReplies) {
      const object = objectNameFromUrl(quickReply.mediaUrl as string);
      let hash = hashCache.get(object);
      if (!hash) {
        try {
          hash = await this.hashObject(object);
        } catch (error) {
          if (!isNotFound(error)) this.logger.warn(`duplicados: no se pudo leer ${object} — ${error instanceof Error ? error.message : error}`);
          continue;
        }
        hashCache.set(object, hash);
      }
      rows.push({ ...quickReply, mediaUrl: quickReply.mediaUrl as string, hash });
    }
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

    const byHash = new Map<string, { canonicalUrl: string; fileName: string | null; objects: Set<string> }>();
    for (const row of rows) {
      const object = objectNameFromUrl(row.mediaUrl);
      const group = byHash.get(row.hash);
      if (!group) byHash.set(row.hash, { canonicalUrl: row.mediaUrl, fileName: row.fileName, objects: new Set([object]) });
      else group.objects.add(object);
    }

    const protectedObjects = await this.protectedObjectNames();
    const top: DedupReport['top'] = [];
    for (const group of byHash.values()) {
      if (group.objects.size < 2) continue;
      // Si alguna copia la usa algo que no es un mensaje (un flujo, un sticker, el widget…),
      // esa pasa a ser la única: así nunca hay que tocar esas referencias.
      const protectedCopy = [...group.objects].find((name) => protectedObjects.has(name));
      const canonicalUrl = protectedCopy
        ? group.canonicalUrl.replace(/[^/]+$/, protectedCopy)
        : group.canonicalUrl;
      const canonical = objectNameFromUrl(canonicalUrl);
      const duplicates = [...group.objects].filter((name) => name !== canonical);

      // Sin el original no se mueve nada: mejor seguir con copias que dejar chats sin archivo.
      const canonicalSize = await this.objectSize(canonical);
      if (canonicalSize === null) continue;

      report.groups += 1;
      report.duplicateObjects += duplicates.length;
      top.push({ fileName: group.fileName, copies: group.objects.size, bytes: canonicalSize * duplicates.length });
      if (!apply) {
        for (const name of duplicates) {
          if (protectedObjects.has(name)) report.keptReferenced += 1;
          else report.freedBytes += (await this.objectSize(name)) ?? 0;
        }
        continue;
      }

      for (const name of duplicates) {
        const pattern = `%/${name}`;
        report.repointedMessages += await this.prisma.$executeRaw`
          UPDATE "Message" SET "mediaUrl" = ${canonicalUrl} WHERE "mediaUrl" LIKE ${pattern}`;
        report.repointedQuickReplies += await this.prisma.$executeRaw`
          UPDATE "QuickReply" SET "mediaUrl" = ${canonicalUrl} WHERE "mediaUrl" LIKE ${pattern}`;
      }
      // Recién ahora, con todo apuntando al original, se borran las copias que nadie usa.
      const unreferenced = await this.unreferencedObjects(duplicates);
      report.keptReferenced += duplicates.length - unreferenced.length;
      for (const name of unreferenced) report.freedBytes += (await this.objectSize(name)) ?? 0;
      await this.storage.removeObjects(unreferenced);
      report.deletedObjects += unreferenced.length;
    }
    report.top = top.sort((a, b) => b.bytes - a.bytes).slice(0, 10);

    const gb = (report.freedBytes / 1024 ** 3).toFixed(2);
    this.logger.log(
      `duplicados (${apply ? 'APLICADO' : 'SIMULACIÓN'}): ${report.hashed} huellas nuevas, ${report.missing} sin archivo, `
      + `${report.groups} grupos, ${report.duplicateObjects} copias, ${apply ? 'liberados' : 'liberaría'} ${gb} GB`
      + (apply ? `, ${report.repointedMessages} mensajes y ${report.repointedQuickReplies} respuestas rápidas re-apuntados, ${report.deletedObjects} copias borradas` : '')
      + (report.keptReferenced ? `, ${report.keptReferenced} copias conservadas por estar en uso fuera de los chats` : ''),
    );
    return report;
  }

  // Calcula la huella de los mensajes que aún no la tienen (la primera vez, todo el
  // histórico) y la guarda en metadata.mediaHash: las noches siguientes solo se leen los nuevos.
  private async hashPendingMessages(report: DedupReport, cache: Map<string, string>) {
    const cutoff = new Date(Date.now() - MIN_AGE_MS);
    let after: { createdAt: Date; id: string } | null = null;
    for (;;) {
      const batch: { id: string; mediaUrl: string; createdAt: Date }[] = after
        ? await this.prisma.$queryRaw`
            SELECT id, "mediaUrl", "createdAt" FROM "Message"
            WHERE "mediaUrl" IS NOT NULL AND metadata->>'mediaHash' IS NULL
              AND "createdAt" < ${cutoff} AND status::text NOT IN ('QUEUED', 'PROCESSING')
              AND ("createdAt", id) > (${after.createdAt}, ${after.id})
            ORDER BY "createdAt" ASC, id ASC LIMIT ${HASH_BATCH}`
        : await this.prisma.$queryRaw`
            SELECT id, "mediaUrl", "createdAt" FROM "Message"
            WHERE "mediaUrl" IS NOT NULL AND metadata->>'mediaHash' IS NULL
              AND "createdAt" < ${cutoff} AND status::text NOT IN ('QUEUED', 'PROCESSING')
            ORDER BY "createdAt" ASC, id ASC LIMIT ${HASH_BATCH}`;
      if (batch.length === 0) return;

      for (const message of batch) {
        const object = objectNameFromUrl(message.mediaUrl);
        let hash = cache.get(object);
        if (!hash) {
          try {
            hash = await this.hashObject(object);
          } catch (error) {
            if (!isNotFound(error)) {
              this.logger.warn(`duplicados: no se pudo leer ${object}, se reintenta mañana — ${error instanceof Error ? error.message : error}`);
              continue;
            }
            hash = MISSING;
          }
          cache.set(object, hash);
        }
        // Concatenación jsonb atómica: no pisa lo que el worker haya escrito en metadata.
        await this.prisma.$executeRaw`
          UPDATE "Message" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('mediaHash', ${hash}::text)
          WHERE id = ${message.id}`;
        if (hash === MISSING) report.missing += 1;
        else report.hashed += 1;
      }
      const last = batch[batch.length - 1];
      after = { createdAt: last.createdAt, id: last.id };
    }
  }

  private async hashObject(objectName: string) {
    const stream = await this.storage.getObjectStream(objectName);
    const hash = createHash('sha256');
    for await (const chunk of stream) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  private async objectSize(objectName: string): Promise<number | null> {
    try {
      return (await this.storage.statObject(objectName)).size;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  // Objetos que usa algo distinto de un mensaje o una respuesta rápida: stickers guardados,
  // flujos, widget, comprobantes y QR de pago, avatares. Esos nunca se borran ni se mueven.
  private async protectedObjectNames() {
    const names = new Set<string>();
    const collect = (text: string | null | undefined) => {
      for (const match of text?.match(OBJECT_NAME_RE) ?? []) names.add(match);
    };
    const texts = await this.prisma.$queryRaw<{ text: string | null }[]>`
      SELECT "mediaUrl" AS text FROM "StickerItem"
      UNION ALL SELECT "proofUrl" FROM "PaymentRequest" WHERE "proofUrl" IS NOT NULL
      UNION ALL SELECT "qrImageUrl" FROM "PlatformPaymentMethod" WHERE "qrImageUrl" IS NOT NULL
      UNION ALL SELECT "avatarUrl" FROM "Contact" WHERE "avatarUrl" LIKE '%/%-%-%-%-%'
      UNION ALL SELECT configuration::text FROM "WhatsAppInstance" WHERE configuration IS NOT NULL
      UNION ALL SELECT graph::text FROM "Flow"
      UNION ALL SELECT context::text FROM "FlowExecution" WHERE context::text LIKE '%-%-%-%-%'`;
    for (const row of texts) collect(row.text);
    return names;
  }

  // De una lista de objetos, los que ya no usa nada: ni un mensaje (salvo los de
  // `ignoreMessageIds`, que se están purgando), ni una respuesta rápida, ni lo protegido.
  async unreferencedObjects(objectNames: string[], ignoreMessageIds: string[] = []) {
    if (objectNames.length === 0) return [];
    const used = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT substring("mediaUrl" from '[^/]+$') AS name FROM "Message"
      WHERE substring("mediaUrl" from '[^/]+$') = ANY(${objectNames}) AND NOT (id = ANY(${ignoreMessageIds}))
      UNION
      SELECT substring("mediaUrl" from '[^/]+$') FROM "QuickReply"
      WHERE substring("mediaUrl" from '[^/]+$') = ANY(${objectNames})`;
    const usedNames = new Set(used.map((row) => row.name));
    const protectedObjects = await this.protectedObjectNames();
    return [...new Set(objectNames)].filter((name) => !usedNames.has(name) && !protectedObjects.has(name));
  }
}

function isNotFound(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === 'NoSuchKey' || code === 'NotFound';
}
