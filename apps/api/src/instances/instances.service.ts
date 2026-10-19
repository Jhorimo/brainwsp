import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { extname } from 'node:path';
import { InstanceStatus, MessageDirection, WhatsAppProvider } from '@prisma/client';
import { generateWidgetPublicKey } from '../common/utils/secret';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';

export interface WidgetConfiguration {
  displayName?: string;
  welcomeMessage?: string;
  color?: string;
  position?: 'left' | 'right';
  buttonText?: string;
  // Si el panel se abre solo al entrar a la página (true) o si queda cerrado, solo el botón
  // flotante, hasta que el visitante haga clic (false, default) — ver widget.js, que lee este
  // valor del bootstrap y decide si auto-abrirse.
  autoOpen?: boolean;
  // Nombre del objeto en MinIO con el ícono/mascota propia del botón flotante (en vez del
  // ícono de chat genérico) — se sirve público sin auth en GET /widget/:key/icon, ver
  // WidgetController. No se expone tal cual al widget.js: la página /c/[slug] arma la URL
  // pública a partir de `hasIcon` (ver WidgetService.branding) + su propio API_URL.
  iconObjectName?: string | null;
  iconMimeType?: string | null;
  // Si el visitante puede minimizar el botón flotante por su cuenta (y que quede así,
  // recordado en su navegador) — pensado para cuando el widget vive embebido dentro de OTRO
  // software (ver AGENTS.md: el enlace público/widget es un canal más) y no siempre se quiere
  // ver la burbuja flotando encima de la UI propia. true por defecto.
  allowMinimize?: boolean;
  // Si el canal acepta llamadas de voz WebRTC entrantes desde el widget (ver CallsService y
  // WidgetController.iceServers). true por defecto; pensado para apagarlo en canales que no
  // quieren dar soporte en vivo por voz.
  allowCalls?: boolean;
  // Burbuja de saludo flotante (la que aparece junto al botón antes de que el visitante
  // haga clic): 'text' usa welcomeMessage de siempre; 'image' la reemplaza por una
  // ilustración propia con el mensaje ya dibujado (p.ej. un personaje señalando el botón,
  // como en taypi.pe) — ver teaserImageObjectName. 'text' por defecto. Si quedó en 'image'
  // pero no hay archivo (se borró después), WidgetService.branding cae a texto.
  teaserType?: 'text' | 'image';
  teaserImageObjectName?: string | null;
  teaserImageMimeType?: string | null;
}

const WIDGET_ICON_MAX_BYTES = 2 * 1024 * 1024;
const WIDGET_ICON_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const WIDGET_TEASER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

@Injectable()
export class InstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly storage: StorageService,
  ) {}

  async list(companyId: string) {
    const instances = await this.prisma.whatsAppInstance.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        provider: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        qr: true,
        reconnectAttempt: true,
        lastError: true,
        lastConnectedAt: true,
        lastDisconnectedAt: true,
        autoConnect: true,
        widgetPublicKey: true,
        configuration: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!instances.length) return instances;

    // Un solo groupBy para todas las instancias en vez de 2 counts por tarjeta — evita
    // N+1 queries cuando la empresa tiene varios números.
    const counts = await this.prisma.message.groupBy({
      by: ['instanceId', 'direction'],
      where: { companyId, instanceId: { in: instances.map((i) => i.id) } },
      _count: { _all: true },
    });
    const byInstance = new Map<string, { inboundCount: number; outboundCount: number }>();
    for (const row of counts) {
      const bucket = byInstance.get(row.instanceId) ?? { inboundCount: 0, outboundCount: 0 };
      if (row.direction === MessageDirection.INBOUND) bucket.inboundCount = row._count._all;
      else bucket.outboundCount = row._count._all;
      byInstance.set(row.instanceId, bucket);
    }

    return instances.map((instance) => ({
      ...instance,
      ...(byInstance.get(instance.id) ?? { inboundCount: 0, outboundCount: 0 }),
    }));
  }

  async create(
    companyId: string,
    name: string,
    slug: string,
    provider: WhatsAppProvider = WhatsAppProvider.BAILEYS,
  ) {
    const existing = await this.prisma.whatsAppInstance.findUnique({
      where: { companyId_slug: { companyId, slug } },
    });
    if (existing) throw new ConflictException('Ya existe una instancia con ese slug');

    // Clienera Chat no tiene QR ni sesión que conectar: queda operativo apenas se crea. Solo
    // se admite un canal propio activo por empresa (el enlace público usa Company.slug, no el
    // slug de la instancia, así que dos canales serían ambiguos para el visitante).
    if (provider === WhatsAppProvider.CLIENERA_CHAT) {
      const existingChannel = await this.prisma.whatsAppInstance.findFirst({
        where: { companyId, provider: WhatsAppProvider.CLIENERA_CHAT, active: true },
      });
      if (existingChannel) throw new ConflictException('Esta empresa ya tiene un canal Clienera Chat activo');

      return this.prisma.whatsAppInstance.create({
        data: { companyId, name, slug, provider, status: InstanceStatus.CONNECTED, widgetPublicKey: generateWidgetPublicKey() },
      });
    }

    return this.prisma.whatsAppInstance.create({
      data: { companyId, name, slug, provider },
    });
  }

  // Rota el token público del widget (<script data-company="...">) sin afectar el enlace
  // público (que usa Company.slug) ni la fila interna — páginas/widgets ya instalados con el
  // token viejo dejan de resolver de inmediato.
  async regenerateWidgetKey(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const widgetPublicKey = generateWidgetPublicKey();
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { widgetPublicKey } });
    return { widgetPublicKey };
  }

  // Configuración básica del widget (Fase 1): branding mínimo. Se fusiona con lo que ya
  // hubiera en vez de reemplazar el JSON entero, para no perder claves que el frontend
  // todavía no edita (ver punto 10 del brief: "no sobrecargar esta parte inicialmente").
  async updateWidgetConfig(companyId: string, id: string, config: WidgetConfiguration) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const current = (instance.configuration as WidgetConfiguration | null) ?? {};
    const merged = { ...current, ...config };
    const updated = await this.prisma.whatsAppInstance.update({ where: { id }, data: { configuration: merged } });
    return updated.configuration;
  }

  // Ícono/mascota propia del botón flotante. Reemplaza el archivo anterior si había uno (no
  // deja objetos huérfanos en MinIO) y guarda solo el nombre de objeto — la URL pública la
  // arma el frontend con GET /widget/:widgetPublicKey/icon (ver WidgetController.icon).
  async uploadWidgetIcon(companyId: string, id: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!WIDGET_ICON_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no soportado. Usa JPG, PNG, GIF o WEBP.');
    }
    if (file.buffer.length > WIDGET_ICON_MAX_BYTES) {
      throw new BadRequestException(`La imagen supera el tamaño máximo permitido (${Math.round(WIDGET_ICON_MAX_BYTES / 1024 / 1024)} MB)`);
    }

    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const current = (instance.configuration as WidgetConfiguration | null) ?? {};
    const previousObjectName = current.iconObjectName;

    const { objectName } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));
    // Sin anotar el tipo del literal (como en updateWidgetConfig): con `: WidgetConfiguration`
    // explícito, TS exige índice de firma `[key: string]` para el Json de Prisma y no compila.
    const merged = { ...current, iconObjectName: objectName, iconMimeType: file.mimetype };
    const updated = await this.prisma.whatsAppInstance.update({ where: { id }, data: { configuration: merged } });

    if (previousObjectName) await this.storage.removeObject(previousObjectName).catch(() => undefined);
    return updated.configuration;
  }

  async removeWidgetIcon(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const current = (instance.configuration as WidgetConfiguration | null) ?? {};
    if (!current.iconObjectName) return instance.configuration;

    const merged = { ...current, iconObjectName: null, iconMimeType: null };
    const updated = await this.prisma.whatsAppInstance.update({ where: { id }, data: { configuration: merged } });
    await this.storage.removeObject(current.iconObjectName).catch(() => undefined);
    return updated.configuration;
  }

  // Imagen propia de la burbuja de saludo (en vez del texto de welcomeMessage) — mismo
  // patrón que uploadWidgetIcon/removeWidgetIcon de arriba (reemplaza el archivo anterior,
  // guarda solo el nombre de objeto). La URL pública la arma el frontend con
  // GET /widget/:widgetPublicKey/teaser-image (ver WidgetController.teaserImage).
  async uploadWidgetTeaserImage(companyId: string, id: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!WIDGET_ICON_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no soportado. Usa JPG, PNG, GIF o WEBP.');
    }
    if (file.buffer.length > WIDGET_TEASER_IMAGE_MAX_BYTES) {
      throw new BadRequestException(`La imagen supera el tamaño máximo permitido (${Math.round(WIDGET_TEASER_IMAGE_MAX_BYTES / 1024 / 1024)} MB)`);
    }

    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const current = (instance.configuration as WidgetConfiguration | null) ?? {};
    const previousObjectName = current.teaserImageObjectName;

    const { objectName } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));
    const merged = { ...current, teaserImageObjectName: objectName, teaserImageMimeType: file.mimetype };
    const updated = await this.prisma.whatsAppInstance.update({ where: { id }, data: { configuration: merged } });

    if (previousObjectName) await this.storage.removeObject(previousObjectName).catch(() => undefined);
    return updated.configuration;
  }

  async removeWidgetTeaserImage(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.CLIENERA_CHAT) {
      throw new ConflictException('Esta acción está disponible solo para el canal Clienera Chat');
    }
    const current = (instance.configuration as WidgetConfiguration | null) ?? {};
    if (!current.teaserImageObjectName) return instance.configuration;

    const merged = { ...current, teaserImageObjectName: null, teaserImageMimeType: null };
    const updated = await this.prisma.whatsAppInstance.update({ where: { id }, data: { configuration: merged } });
    await this.storage.removeObject(current.teaserImageObjectName).catch(() => undefined);
    return updated.configuration;
  }

  async connect(companyId: string, id: string) {
    // No bloquea una sesión ya conectada (esta ruta solo se llama para conectar/reconectar) —
    // ver el comentario en "Mi Plan" del plan de implementación: solo se corta la posibilidad
    // de conectar algo nuevo, no lo que ya estaba andando.
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { licenseRenewsAt: true } });
    if (company?.licenseRenewsAt && company.licenseRenewsAt < new Date()) {
      const formatted = company.licenseRenewsAt.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
      throw new ForbiddenException(`Tu plan venció el ${formatted} — actualiza tu plan en "Mi Plan" para volver a conectar tu WhatsApp.`);
    }

    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new ConflictException('Esta acción está disponible para instancias Baileys');
    }
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: true } });
    await this.queues.commands.add('connect', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'CONNECTING', instanceId: id };
  }

  async disconnect(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new ConflictException('Esta acción está disponible para instancias Baileys');
    }
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: false } });
    await this.queues.commands.add('disconnect', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'DISCONNECTING', instanceId: id };
  }

  async logout(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new ConflictException('Esta acción está disponible para instancias Baileys');
    }
    await this.prisma.whatsAppInstance.update({ where: { id }, data: { autoConnect: false } });
    await this.queues.commands.add('logout', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, status: 'LOGGING_OUT', instanceId: id };
  }

  // One-off resync for contacts whose cached avatar went stale before the contacts.update
  // listener existed to keep it current — see SessionManager.forceRefreshAvatars.
  async refreshAvatars(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    if (instance.provider !== WhatsAppProvider.BAILEYS) {
      throw new ConflictException('Esta acción está disponible para instancias Baileys');
    }
    await this.queues.commands.add('refresh-avatars', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return { success: true, instanceId: id };
  }

  async update(companyId: string, id: string, data: { name?: string; slug?: string }) {
    await this.getOwned(companyId, id);
    if (data.slug !== undefined) {
      const existing = await this.prisma.whatsAppInstance.findUnique({
        where: { companyId_slug: { companyId, slug: data.slug } },
      });
      if (existing && existing.id !== id) throw new ConflictException('Ya existe una instancia con ese slug');
    }
    return this.prisma.whatsAppInstance.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
      },
    });
  }

  // Si la instancia nunca se conectó ni tiene historial, se borra de verdad (limpieza de
  // instancias creadas por error). Si ya se usó, no la borramos en cascada — se archiva
  // (`active: false`, igual que otras entidades) para conservar conversaciones/mensajes
  // reales; `list()` ya filtra por `active: true` así que desaparece del panel igual.
  // Una credencial de API vinculada sí bloquea ambos casos: hay que eliminarla primero
  // desde "API e integraciones" para no romper la integración externa en silencio.
  async remove(companyId: string, id: string) {
    const instance = await this.getOwned(companyId, id);
    const [conversationCount, messageCount, credentialCount] = await Promise.all([
      this.prisma.conversation.count({ where: { instanceId: id } }),
      this.prisma.message.count({ where: { instanceId: id } }),
      this.prisma.apiCredential.count({ where: { instanceId: id } }),
    ]);
    if (credentialCount > 0) {
      throw new ConflictException('Esta instancia tiene una credencial de API vinculada. Elimínala primero en "API e integraciones" y luego podrás quitar la instancia.');
    }

    const everUsed = Boolean(instance.phoneNumber || instance.lastConnectedAt || conversationCount > 0 || messageCount > 0);
    if (everUsed) {
      // Clienera Chat no tiene sesión Baileys que cerrar — enviar 'logout' igual intentaría
      // desloguear una sesión que nunca existió.
      if (instance.provider === WhatsAppProvider.BAILEYS && instance.status !== InstanceStatus.DISCONNECTED && instance.status !== InstanceStatus.LOGGED_OUT) {
        await this.queues.commands.add('logout', { instanceId: id }, { removeOnComplete: 1000, removeOnFail: 1000 });
      }
      await this.prisma.whatsAppInstance.update({ where: { id }, data: { active: false, autoConnect: false } });
      return { success: true, archived: true };
    }

    await this.prisma.whatsAppInstance.delete({ where: { id } });
    return { success: true, archived: false };
  }

  private async getOwned(companyId: string, id: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({ where: { id, companyId, active: true } });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    return instance;
  }
}
