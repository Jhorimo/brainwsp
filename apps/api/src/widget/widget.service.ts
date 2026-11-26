import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType, UserRole, WhatsAppProvider, type Conversation, type VisitorSession } from '@prisma/client';
import { hashApiSecret, generateAuthKey as generateVisitorToken } from '../common/utils/secret';
import type { WidgetConfiguration } from '../instances/instances.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../system-settings/mail.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { linkContactSource, normalizeLinkSource } from './link-source';
import { cleanProfile, isLinkContact, resolvePrechat, type ProfileInput } from './prechat';
import { verifyResumeToken } from './resume-token';
import { buildCodeEmail, CODE_MAX_ATTEMPTS, CODE_MAX_PER_HOUR, CODE_RESEND_MS, CODE_TTL_MS, generateCode, hashCode, maskEmail, normalizeCode } from './email-code';

// Vencimiento deslizante: cada visita lo renueva (ver touchSession), así que en la práctica
// la sesión del visitante no vence mientras vuelva alguna vez en 10 años. El cliente que
// escribe hoy y vuelve en 30 días entra directo a su mismo chat.
const VISITOR_SESSION_DAYS = 3650;
const sessionExpiry = () => new Date(Date.now() + VISITOR_SESSION_DAYS * 24 * 60 * 60 * 1000);

// sameEmailAs: eligió "Empezar un chat nuevo" con un correo que ya tenía otro chat (sin
// verificar con el código) — el panel lo muestra para que el agente lo sepa.
type ContactMetadata = { prechatCompletedAt?: string; sameEmailAs?: string } & Record<string, unknown>;

// Techo duro para el widget público, independiente del límite configurable por el
// superadmin para el panel (que puede llegar a 500MB pensado para agentes internos de
// confianza). Un visitante anónimo de internet es una superficie de abuso distinta — ver
// AGENTS.md "no aceptar archivos ejecutables libremente" y el punto 22/23 del brief.
const WIDGET_MAX_MEDIA_BYTES = 15 * 1024 * 1024;

// Lista blanca del widget (imágenes, PDF, audio y video — ver punto 22 del brief): nada de
// ejecutables, scripts, ni el "application/* => DOCUMENT" permisivo que sí usa
// conversations.service.ts para el panel interno (agentes de confianza). audio/video quedan
// abiertos por prefijo (en vez de una lista fija de mimetypes) porque el formato que entrega
// el MediaRecorder del navegador varía por navegador/SO (audio/webm;codecs=opus,
// audio/ogg;codecs=opus, video/webm, etc.) — WIDGET_MAX_MEDIA_BYTES sigue acotando el abuso.
function widgetMessageType(mimetype: string): MessageType | null {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimetype)) return MessageType.IMAGE;
  if (mimetype === 'application/pdf') return MessageType.DOCUMENT;
  if (mimetype.startsWith('audio/')) return MessageType.AUDIO;
  if (mimetype.startsWith('video/')) return MessageType.VIDEO;
  return null;
}

function hostnameFromUrl(url: string): string | null {
  try { return new URL(url).hostname || null; } catch { return null; }
}

// Selects shared with ConversationsService/SessionManager's own "hydrate for realtime"
// shape, kept in sync by hand since the widget creates these rows outside either of those
// — the panel's conversations list/thread rendering depends on this exact shape.
const hydratedConversationInclude = {
  contact: { select: { id: true, name: true, pushName: true, phone: true, email: true, waId: true, avatarUrl: true, source: true, sourceUrl: true } },
  assignedUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  instance: { select: { id: true, name: true, slug: true, status: true, provider: true } },
} as const;

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
    private readonly storage: StorageService,
    private readonly systemSettings: SystemSettingsService,
    private readonly mail: MailService,
  ) {}

  private async resolveChannel(widgetPublicKey: string) {
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { widgetPublicKey, provider: WhatsAppProvider.CLIENERA_CHAT, active: true },
      include: { company: { select: { id: true, name: true, slug: true, active: true } } },
    });
    if (!instance || !instance.company.active) throw new NotFoundException('Canal no disponible');
    return instance;
  }

  private branding(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>) {
    const config = (instance.configuration as WidgetConfiguration | null) ?? {};
    return {
      widgetPublicKey: instance.widgetPublicKey as string,
      companySlug: instance.company.slug,
      companyName: config.displayName || instance.company.name,
      welcomeMessage: config.welcomeMessage || '¿En qué podemos ayudarte?',
      color: config.color || '#6b8afd',
      position: config.position || 'right',
      buttonText: config.buttonText || '¿Necesitas ayuda?',
      autoOpen: config.autoOpen ?? false,
      // La página /c/[slug] arma la URL pública GET /widget/:widgetPublicKey/icon solo cuando
      // hasIcon es true, usando iconVersion como cache-buster (cambia con cada reemplazo, ver
      // InstancesService.uploadWidgetIcon) — el nombre de objeto en sí no es sensible, es un
      // UUID aleatorio sin relación con el contenido.
      hasIcon: Boolean(config.iconObjectName),
      iconVersion: config.iconObjectName || undefined,
      allowMinimize: config.allowMinimize ?? true,
      allowCalls: config.allowCalls ?? true,
      // Burbuja de saludo: si quedó marcada "image" pero el archivo se borró después, cae a
      // texto en vez de no mostrar nada (ver WidgetConfiguration.teaserType).
      teaserType: config.teaserType === 'image' && config.teaserImageObjectName ? 'image' : 'text',
      hasTeaserImage: Boolean(config.teaserImageObjectName),
      teaserImageVersion: config.teaserImageObjectName || undefined,
      // Solo lo usa la página del ENLACE público; el widget embebido lo ignora siempre.
      prechat: resolvePrechat(config),
    };
  }

  async getBootstrap(widgetPublicKey: string) {
    return { ...this.branding(await this.resolveChannel(widgetPublicKey)), emailNotices: (await this.mail.status()).enabled };
  }

  // Servidores ICE para las llamadas de voz WebRTC (CallsService) — pública y sin companyId
  // porque STUN no es secreto y el panel de agentes no tiene un widgetPublicKey a mano; un
  // solo valor por despliegue, no por canal. STUN_URLS/TURN_URLS/TURN_USERNAME/
  // TURN_CREDENTIAL son opcionales. Sumar un TURN propio después es solo setear esas 3
  // variables de entorno, sin tocar código.
  //
  // Por qué hace falta TURN y no solo STUN: STUN solo sirve para que cada lado DESCUBRA su
  // propia IP pública — si agente y visitante están en redes distintas (el caso normal en
  // producción, nunca localhost) y alguno está detrás de un NAT restrictivo/simétrico (común
  // en redes móviles y corporativas), los candidatos STUN nunca llegan a formar un par válido:
  // la señalización (oferta/respuesta) se completa igual, el timbre y el "en llamada" se ven
  // bien, pero el audio nunca fluye porque no hay una ruta P2P real. Un TURN relay (que si o
  // si transporta el audio en vez de solo ayudar a descubrirse) es la única forma de que esa
  // llamada funcione en ese escenario.
  getIceServers() {
    const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean);
    const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = stunUrls.length ? [{ urls: stunUrls }] : [];
    const turnUrls = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (turnUrls.length) {
      iceServers.push({ urls: turnUrls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    } else {
      // Sin TURN propio configurado: TURN de prueba público (Open Relay Project / Metered —
      // credenciales publicadas a propósito para pruebas, sin garantía de uptime ni ancho de
      // banda). Mejor esto que nada mientras no hay uno propio, pero para producción real hay
      // que reemplazarlo seteando TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL (p.ej. un coturn
      // propio) — esta rama deja de usarse apenas esas variables existen.
      iceServers.push({
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      });
    }
    return { iceServers };
  }

  // Sirve el ícono propio del botón flotante sin auth (mismo nivel de exposición que el
  // nombre/color de la empresa, ya públicos en el bootstrap) — lo consume un <img> embebido
  // en cualquier web del cliente, no puede llevar token.
  async resolveIcon(widgetPublicKey: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const config = (instance.configuration as WidgetConfiguration | null) ?? {};
    if (!config.iconObjectName) throw new NotFoundException('Este canal no tiene ícono propio');
    return { objectName: config.iconObjectName, mimeType: config.iconMimeType || 'application/octet-stream' };
  }

  // Igual que resolveIcon de arriba, pero para la imagen propia de la burbuja de saludo
  // (ver WidgetConfiguration.teaserImageObjectName) — también pública y sin auth, mismo
  // nivel de exposición que el ícono y el branding.
  async resolveTeaserImage(widgetPublicKey: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const config = (instance.configuration as WidgetConfiguration | null) ?? {};
    if (!config.teaserImageObjectName) throw new NotFoundException('Este canal no tiene imagen de bienvenida');
    return { objectName: config.teaserImageObjectName, mimeType: config.teaserImageMimeType || 'application/octet-stream' };
  }

  // El enlace público ("clienera.com/<slug>") no conoce el widgetPublicKey de antemano —
  // solo el slug de la empresa. Se resuelve aquí al único canal Clienera Chat activo de esa
  // empresa y se devuelve su widgetPublicKey junto con el branding, para que la página
  // pública pueda operar con las mismas rutas /widget/:key/* que usa el script embebible.
  async getBootstrapBySlug(slug: string) {
    const company = await this.prisma.company.findFirst({ where: { slug, active: true }, select: { id: true } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { companyId: company.id, provider: WhatsAppProvider.CLIENERA_CHAT, active: true },
      include: { company: { select: { id: true, name: true, slug: true, active: true } } },
    });
    if (!instance) throw new NotFoundException('Esta empresa no tiene Clienera Chat activo');
    // emailNotices: si el formulario ofrece la casilla de avisos por correo (servidor de
    // correo configurado por el superadmin).
    return { ...this.branding(instance), emailNotices: (await this.mail.status()).enabled };
  }

  private async findSession(companyId: string, token: string) {
    return this.prisma.visitorSession.findFirst({
      where: { tokenHash: hashApiSecret(token), companyId, expiresAt: { gt: new Date() } },
    });
  }

  private async requireSession(companyId: string, token: string): Promise<VisitorSession> {
    const session = await this.findSession(companyId, token);
    if (!session) throw new UnauthorizedException('Sesión de visitante inválida o expirada');
    await this.touchSession(session.id);
    return session;
  }

  private touchSession(id: string) {
    return this.prisma.visitorSession.update({ where: { id }, data: { lastSeenAt: new Date(), expiresAt: sessionExpiry() } });
  }

  // Estado del formulario de datos de este visitante. `needed` solo puede ser true para los
  // contactos que llegaron por el enlace (source link*), nunca para el widget embebido.
  private async profileState(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>, contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId }, select: { name: true, email: true, phone: true, source: true, metadata: true } });
    const completed = Boolean((contact?.metadata as ContactMetadata | null)?.prechatCompletedAt);
    const prechat = resolvePrechat(instance.configuration as WidgetConfiguration | null);
    return {
      needed: prechat.enabled && isLinkContact(contact?.source) && !completed,
      completed,
      // El nombre automático ("web 3: instagram") no se devuelve: no es un dato del visitante.
      name: completed ? contact?.name ?? null : null,
      email: completed ? contact?.email ?? null : null,
      phone: completed ? contact?.phone ?? null : null,
    };
  }

  private async assertProfileReady(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>, contactId: string) {
    const state = await this.profileState(instance, contactId);
    if (state.needed) throw new BadRequestException('Completa tus datos para empezar el chat');
  }

  // Sin registro: a un visitante nuevo se le crea Contact + VisitorSession en el momento.
  // Si ya traía un token válido (localStorage de una visita anterior), se reconoce al mismo
  // contacto y se le devuelve el id de su conversación existente, si la tiene.
  // pageUrl viene de widget.js (window.location del sitio donde está embebido, ej. el ERP de
  // un cliente) — se guarda/actualiza en el Contact para que soporte vea de inmediato de qué
  // cliente se trata sin preguntar (ver Contact.sourceUrl en schema.prisma).
  // src: origen del enlace público (/c/<empresa>/<origen>). Solo se usa para visitantes
  // nuevos que llegan por el enlace (sin pageUrl); el widget embebido en un ERP manda pageUrl
  // y conserva su comportamiento de siempre (source 'widget', nombre "web N: host"). A un
  // visitante que ya existía no se le cambia el origen con el que llegó la primera vez.
  async startSession(widgetPublicKey: string, existingToken?: string, pageUrl?: string, src?: string) {
    const instance = await this.resolveChannel(widgetPublicKey);

    if (existingToken) {
      const session = await this.findSession(instance.companyId, existingToken);
      if (session) {
        await this.touchSession(session.id);
        if (pageUrl) await this.prisma.contact.update({ where: { id: session.contactId }, data: { sourceUrl: pageUrl } });
        // Por dónde entró ESTA vez (el aviso "se conectó · vía TikTok" de los agentes). El
        // origen del contacto (Contact.source) sigue siendo el de la primera vez.
        const via = pageUrl ? 'widget' : linkContactSource(src);
        if (via !== session.via) await this.prisma.visitorSession.update({ where: { id: session.id }, data: { via } });
        const conversation = await this.prisma.conversation.findUnique({
          where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
          select: { id: true },
        });
        return { token: existingToken, conversationId: conversation?.id ?? null, profile: await this.profileState(instance, session.contactId) };
      }
    }

    const visitorId = randomUUID();
    // Nombre inicial legible para un visitante nuevo del widget — "web 1: gastromaq" en vez
    // del "web:<uuid>" crudo (waId), tomando el primer label del hostname de pageUrl y un
    // correlativo por ese mismo hostname (así cada cliente ERP que la empresa atiende por
    // Clienera Chat numera su propia serie). Queda igual de editable después con el lápiz del
    // header — esto solo mejora el valor por defecto, no reemplaza el rename manual.
    const hostname = pageUrl ? hostnameFromUrl(pageUrl) : null;
    const linkSrc = pageUrl ? null : normalizeLinkSource(src);
    const source = pageUrl ? 'widget' : linkContactSource(linkSrc);
    // Enlace con origen: "web N: instagram" con su propio correlativo, igual que la serie por
    // dominio del widget embebido. Sin origen ni pageUrl queda sin nombre, como siempre.
    const contactName = hostname
      ? `web ${(await this.prisma.contact.count({ where: { companyId: instance.companyId, source: 'widget', sourceUrl: { contains: hostname } } })) + 1}: ${hostname.split('.')[0]}`
      : linkSrc
        ? `web ${(await this.prisma.contact.count({ where: { companyId: instance.companyId, source } })) + 1}: ${linkSrc}`
        : undefined;
    const contact = await this.prisma.contact.create({
      data: { companyId: instance.companyId, waId: `web:${visitorId}`, visitorId, source, sourceUrl: pageUrl, name: contactName },
    });
    const token = generateVisitorToken();
    await this.prisma.visitorSession.create({
      data: {
        companyId: instance.companyId,
        contactId: contact.id,
        tokenHash: hashApiSecret(token),
        expiresAt: sessionExpiry(),
        via: source,
      },
    });
    return { token, conversationId: null, profile: await this.profileState(instance, contact.id) };
  }

  // Mismas reglas de asignación por defecto y creación de Lead que el inbound de WhatsApp
  // (ver SessionManager.persistIncoming) — se replican aquí porque el widget no pasa por el
  // worker, que es quien las aplica para los mensajes entrantes de Baileys. Compartido por
  // sendMessage y sendMedia: ambos son "el visitante mandó algo", solo cambia el tipo.
  // `bumpUnread` en false es para startCallConversation: el visitante solo abrió el panel
  // de llamada, todavía no pasó nada que el agente deba ver como "no leído" — eso lo marca
  // recién CallsService.persistCallMessage cuando la llamada termina de verdad (o nunca, si
  // cancela antes de invitar). sendMessage/sendMedia siguen bumpeando como siempre (default).
  private async ensureConversation(
    instance: Awaited<ReturnType<WidgetService['resolveChannel']>>,
    session: VisitorSession,
    options?: { bumpUnread?: boolean },
  ): Promise<Conversation> {
    const bumpUnread = options?.bumpUnread ?? true;
    const existingConversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
    });
    if (existingConversation) {
      if (!bumpUnread) return existingConversation;
      return this.prisma.conversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      });
    }

    const [defaultDepartment, agents] = await Promise.all([
      this.prisma.department.findFirst({ where: { companyId: instance.companyId, isDefault: true, active: true }, select: { id: true } }),
      this.prisma.user.findMany({
        where: { companyId: instance.companyId, active: true, role: { not: UserRole.SUPERADMIN } },
        select: { id: true, isDefaultAgent: true },
      }),
    ]);
    const defaultDepartmentId = defaultDepartment?.id;
    const defaultAgentId = agents.find((agent) => agent.isDefaultAgent)?.id ?? (agents.length === 1 ? agents[0].id : undefined);

    const conversation = await this.prisma.conversation.create({
      data: {
        companyId: instance.companyId,
        instanceId: instance.id,
        contactId: session.contactId,
        unreadCount: bumpUnread ? 1 : 0,
        lastMessageAt: new Date(),
        departmentId: defaultDepartmentId,
        assignedUserId: defaultAgentId,
      },
    });

    const contact = await this.prisma.contact.findUnique({ where: { id: session.contactId }, select: { name: true, email: true, phone: true, source: true } });
    const lead = await this.prisma.lead.create({
      data: {
        companyId: instance.companyId,
        title: contact?.name || 'Prospecto de Clienera Chat',
        personName: contact?.name || undefined,
        personEmail: contact?.email || undefined,
        personPhone: contact?.phone || undefined,
        assignedUserId: defaultAgentId,
        channel: 'clienera_chat',
        source: contact?.source || 'widget',
        contactId: session.contactId,
        conversationId: conversation.id,
        departmentId: defaultDepartmentId,
      },
    });
    void this.realtime.publish(instance.companyId, 'lead.created', lead);

    return conversation;
  }

  private async publishInbound(companyId: string, conversation: Conversation, message: unknown) {
    const hydrated = await this.prisma.conversation.findUnique({ where: { id: conversation.id }, include: hydratedConversationInclude });
    void this.realtime.publish(
      companyId,
      'message.created',
      { message, conversation: hydrated ? { ...hydrated, messages: [message] } : { ...conversation, messages: [message] } },
      hydrated?.departmentId ?? conversation.departmentId,
      conversation.id,
    );
  }

  // Para cuando el visitante quiere llamar sin haber escrito antes — no hay conversación
  // todavía (se crea recién al mandar un mensaje/media, ver ensureConversation) y sin ella el
  // socket no puede unirse a su sala (handleVisitorConnection exige conversationId). Esto le
  // da al widget un conversationId para abrir el socket y recién ahí emitir "call:invite".
  // Formulario del enlace público. Solo para contactos que llegaron por el enlace: el widget
  // embebido en un ERP es otro canal y nunca pide datos. Actualiza el contacto y su
  // prospecto (si ya existe) y avisa al panel si ya hay conversación.
  async saveProfile(widgetPublicKey: string, token: string, input: ProfileInput, notifyEmail?: boolean, withoutHistory?: boolean) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    const contact = await this.prisma.contact.findUnique({ where: { id: session.contactId }, select: { source: true, metadata: true, name: true } });
    if (!contact || !isLinkContact(contact.source)) throw new BadRequestException('Este chat no usa formulario de datos');

    const settings = resolvePrechat(instance.configuration as WidgetConfiguration | null);
    const { profile, error } = cleanProfile(input, { ...settings, enabled: true });
    if (error || !profile) throw new BadRequestException(error || 'Revisa tus datos');

    // El correo identifica a la persona: si ya tiene un chat con esta empresa, esta visita se
    // une a ESE chat (no se crea otro), venga de Instagram, la web, incógnito u otro celular.
    //  - Con servidor de correo: primero se ofrece el código de 6 dígitos para ver el historial.
    //  - "Continuar sin ver el historial" (o sin servidor de correo): mismo chat, pero esta
    //    sesión solo ve los mensajes desde ahora (historyFrom) y los agentes la ven "sin verificar".
    if (profile.email) {
      const existing = await this.findChatByEmail(instance, profile.email, session.contactId);
      if (existing) {
        if (!withoutHistory && (await this.mail.status()).enabled) {
          return { verify: await this.sendEmailCode(instance, session, existing.id, profile.email) };
        }
        return this.attachSession(instance, session, existing.id, { via: 'unverified', historyFrom: new Date() });
      }
    }

    const metadata = {
      ...((contact.metadata as ContactMetadata | null) ?? {}),
      prechatCompletedAt: new Date().toISOString(),
    };
    await this.prisma.contact.update({
      where: { id: session.contactId },
      data: {
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.phone ? { phone: profile.phone } : {}),
        emailNotify: notifyEmail ?? true,
        metadata,
      },
    });

    const leads = await this.prisma.lead.findMany({ where: { companyId: instance.companyId, contactId: session.contactId }, select: { id: true, title: true } });
    for (const lead of leads) {
      const autoTitle = !lead.title || lead.title === 'Prospecto de Clienera Chat' || lead.title === contact.name;
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...(profile.name ? { personName: profile.name, ...(autoTitle ? { title: profile.name } : {}) } : {}),
          ...(profile.email ? { personEmail: profile.email } : {}),
          ...(profile.phone ? { personPhone: profile.phone } : {}),
        },
      });
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
      include: hydratedConversationInclude,
    });
    // Sin conversationId a propósito: es para el panel, no para la sala del visitante.
    if (conversation) void this.realtime.publish(instance.companyId, 'conversation.updated', conversation, conversation.departmentId);

    return { profile: await this.profileState(instance, session.contactId) };
  }

  // Otro contacto del enlace/widget de esta empresa con ese correo y un chat en este canal.
  // Se prefiere el chat ORIGINAL de ese correo: los que se crearon con «Empezar un chat nuevo»
  // sin verificar (metadata.sameEmailAs) podrían ser de otra persona, así que solo se usan si
  // no queda otro.
  private async findChatByEmail(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>, email: string, exceptContactId: string) {
    const candidates = await this.prisma.contact.findMany({
      where: {
        companyId: instance.companyId,
        email,
        id: { not: exceptContactId },
        visitorId: { not: null },
        conversations: { some: { instanceId: instance.id } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, metadata: true },
    });
    const original = candidates.find((c) => !(c.metadata as ContactMetadata | null)?.sameEmailAs) ?? candidates[0];
    return original ? { id: original.id } : null;
  }

  // Envía (o reutiliza si se pidió hace menos de 1 min) el código al correo del chat existente.
  private async sendEmailCode(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>, session: VisitorSession, contactId: string, email: string) {
    const now = Date.now();
    const lastForSession = await this.prisma.visitorEmailCode.findFirst({
      where: { sessionId: session.id, contactId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (lastForSession && now - lastForSession.createdAt.getTime() < CODE_RESEND_MS && lastForSession.expiresAt.getTime() > now) {
      return { emailMasked: maskEmail(email), resendIn: Math.ceil((CODE_RESEND_MS - (now - lastForSession.createdAt.getTime())) / 1000) };
    }
    const recent = await this.prisma.visitorEmailCode.count({ where: { contactId, createdAt: { gt: new Date(now - 60 * 60 * 1000) } } });
    if (recent >= CODE_MAX_PER_HOUR) {
      throw new HttpException('Ya enviamos varios códigos a ese correo. Espera un rato o empieza un chat nuevo.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = generateCode();
    const record = await this.prisma.visitorEmailCode.create({
      data: { companyId: instance.companyId, contactId, sessionId: session.id, codeHash: hashCode(session.id, code), expiresAt: new Date(now + CODE_TTL_MS) },
    });
    const config = (instance.configuration as WidgetConfiguration | null) ?? {};
    const companyName = config.displayName || instance.company.name;
    const mail = buildCodeEmail({ companyName, color: config.color || '#6b8afd', code });
    let sent = false;
    try {
      sent = await this.mail.send({ to: email, subject: mail.subject, html: mail.html, text: mail.text, fromName: companyName });
    } catch {
      sent = false;
    }
    if (!sent) {
      await this.prisma.visitorEmailCode.delete({ where: { id: record.id } });
      throw new BadRequestException('No pudimos enviar el código a tu correo. Inténtalo en un momento o empieza un chat nuevo.');
    }
    return { emailMasked: maskEmail(email), resendIn: Math.ceil(CODE_RESEND_MS / 1000) };
  }

  // "Reenviar código" del paso de verificación.
  async resendEmailCode(widgetPublicKey: string, token: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    const last = await this.prisma.visitorEmailCode.findFirst({ where: { sessionId: session.id, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    const target = last ? await this.prisma.contact.findFirst({ where: { id: last.contactId, companyId: instance.companyId }, select: { id: true, email: true } }) : null;
    if (!target?.email) throw new BadRequestException('Vuelve a escribir tu correo para pedir un código.');
    return this.sendEmailCode(instance, session, target.id, target.email);
  }

  // Código correcto → esta sesión pasa a ser del contacto que ya tenía chat (ve su historial)
  // y se borra el contacto provisional de esta visita si no llegó a tener conversación.
  async verifyEmailCode(widgetPublicKey: string, token: string, rawCode: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    const code = normalizeCode(rawCode);
    const record = await this.prisma.visitorEmailCode.findFirst({ where: { sessionId: session.id, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!record) throw new BadRequestException('Pide un código nuevo.');
    if (record.expiresAt.getTime() < Date.now()) throw new BadRequestException('El código venció. Pide uno nuevo.');
    if (record.attempts >= CODE_MAX_ATTEMPTS) throw new BadRequestException('Demasiados intentos. Pide un código nuevo.');
    if (code.length !== 6 || hashCode(session.id, code) !== record.codeHash) {
      const updated = await this.prisma.visitorEmailCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      const left = CODE_MAX_ATTEMPTS - updated.attempts;
      throw new BadRequestException(left > 0 ? (left === 1 ? 'Código incorrecto. Te queda 1 intento.' : `Código incorrecto. Te quedan ${left} intentos.`) : 'Demasiados intentos. Pide un código nuevo.');
    }
    // Consumo atómico: el mismo código no sirve dos veces (dos pestañas a la vez).
    const consumed = await this.prisma.visitorEmailCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!consumed.count) throw new BadRequestException('Pide un código nuevo.');

    const target = await this.prisma.contact.findFirst({ where: { id: record.contactId, companyId: instance.companyId }, select: { id: true } });
    if (!target) throw new BadRequestException('Ese chat ya no existe. Escríbenos de nuevo.');
    return this.attachSession(instance, session, target.id, { via: 'code', historyFrom: null });
  }

  // Une esta sesión del navegador al contacto que ya tenía chat (mismo correo) y borra el
  // contacto provisional de esta visita si no llegó a tener conversación.
  private async attachSession(
    instance: Awaited<ReturnType<WidgetService['resolveChannel']>>,
    session: VisitorSession,
    targetContactId: string,
    options: { via: string; historyFrom: Date | null },
  ) {
    const provisionalId = session.contactId;
    await this.prisma.visitorSession.update({ where: { id: session.id }, data: { contactId: targetContactId, via: options.via, historyFrom: options.historyFrom } });
    if (provisionalId !== targetContactId) {
      await this.prisma.contact.deleteMany({ where: { id: provisionalId, companyId: instance.companyId, conversations: { none: {} }, leads: { none: {} } } });
    }
    const target = await this.prisma.contact.findUnique({ where: { id: targetContactId }, select: { metadata: true } });
    const targetMeta = (target?.metadata as ContactMetadata | null) ?? {};
    if (!targetMeta.prechatCompletedAt) {
      await this.prisma.contact.update({ where: { id: targetContactId }, data: { metadata: { ...targetMeta, prechatCompletedAt: new Date().toISOString() } } });
    }
    const conversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: targetContactId } },
      select: { id: true },
    });
    return { conversationId: conversation?.id ?? null, profile: await this.profileState(instance, targetContactId), limitedHistory: !!options.historyFrom };
  }

  // Enlace "Continuar la conversación" del correo (?r=): firma del contacto, no vence.
  // Crea una sesión nueva en este navegador para ese mismo contacto y su chat.
  async resume(widgetPublicKey: string, r: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const contactId = verifyResumeToken(instance.companyId, r);
    const contact = contactId ? await this.prisma.contact.findFirst({ where: { id: contactId, companyId: instance.companyId }, select: { id: true } }) : null;
    if (!contact) throw new BadRequestException('Este enlace no es válido. Escríbenos de nuevo desde el chat.');
    const token = generateVisitorToken();
    await this.prisma.visitorSession.create({
      data: { companyId: instance.companyId, contactId: contact.id, tokenHash: hashApiSecret(token), expiresAt: sessionExpiry(), via: 'email' },
    });
    const conversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: contact.id } },
      select: { id: true },
    });
    return { token, conversationId: conversation?.id ?? null, profile: await this.profileState(instance, contact.id) };
  }

  // "No quiero recibir más avisos" del correo (?baja=). Idempotente.
  async unsubscribe(widgetPublicKey: string, r: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const contactId = verifyResumeToken(instance.companyId, r);
    if (!contactId) throw new BadRequestException('Este enlace no es válido.');
    const { count } = await this.prisma.contact.updateMany({ where: { id: contactId, companyId: instance.companyId }, data: { emailNotify: false } });
    if (!count) throw new BadRequestException('Este enlace no es válido.');
    return { ok: true };
  }

  async startCallConversation(widgetPublicKey: string, token: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    await this.assertProfileReady(instance, session.contactId);
    const conversation = await this.ensureConversation(instance, session, { bumpUnread: false });
    return { conversationId: conversation.id };
  }

  async sendMessage(widgetPublicKey: string, token: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('El mensaje no puede estar vacío');

    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    await this.assertProfileReady(instance, session.contactId);
    const conversation = await this.ensureConversation(instance, session);

    const message = await this.prisma.message.create({
      data: {
        companyId: instance.companyId,
        conversationId: conversation.id,
        instanceId: instance.id,
        contactId: session.contactId,
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.RECEIVED,
        body: trimmed,
      },
      include: { author: { select: { id: true, name: true, pushName: true } } },
    });

    await this.publishInbound(instance.companyId, conversation, message);
    return { conversationId: conversation.id, message };
  }

  async sendMedia(widgetPublicKey: string, token: string, file: Express.Multer.File | undefined, caption?: string) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const type = widgetMessageType(file.mimetype);
    if (!type) throw new BadRequestException('Tipo de archivo no soportado. Solo se aceptan imágenes, PDF, audio o video.');

    const configuredMax = await this.systemSettings.maxMediaSizeBytes();
    const maxBytes = Math.min(configuredMax, WIDGET_MAX_MEDIA_BYTES);
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException(`El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB)`);
    }

    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    await this.assertProfileReady(instance, session.contactId);
    const conversation = await this.ensureConversation(instance, session);

    const { internalUrl } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));

    const message = await this.prisma.message.create({
      data: {
        companyId: instance.companyId,
        conversationId: conversation.id,
        instanceId: instance.id,
        contactId: session.contactId,
        direction: MessageDirection.INBOUND,
        type,
        status: MessageStatus.RECEIVED,
        caption: caption?.trim() || undefined,
        fileName: file.originalname,
        fileSize: file.buffer.length,
        mimeType: file.mimetype,
        mediaUrl: internalUrl,
      },
      include: { author: { select: { id: true, name: true, pushName: true } } },
    });

    await this.publishInbound(instance.companyId, conversation, message);
    return { conversationId: conversation.id, message };
  }

  async history(widgetPublicKey: string, token: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);

    const conversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
      select: { id: true },
    });
    if (!conversation) return { conversationId: null, messages: [] };

    // Los 200 MÁS RECIENTES (antes devolvía los 200 más antiguos: en un chat largo el
    // visitante no veía lo último). Una sesión sin verificar solo ve desde que se unió.
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, ...(session.historyFrom ? { createdAt: { gte: session.historyFrom } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, direction: true, type: true, status: true, body: true, caption: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, deleted: true, metadata: true },
    });
    return { conversationId: conversation.id, messages: messages.reverse() };
  }

  // Edición propia del visitante — a diferencia de WhatsApp (donde la edición llega por el
  // protocolo Baileys y la procesa SessionManager.persistEdit en el worker), este canal no
  // tiene contraparte externa: es solo una fila en la tabla, así que se edita directo acá.
  // Mismo patrón de metadata que persistEdit (edited + originalBody solo la primera vez) para
  // que el panel de agentes (que ya sabe leer esos campos) lo muestre igual sin cambios ahí.
  async editMessage(widgetPublicKey: string, token: string, messageId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('El mensaje no puede estar vacío');

    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: instance.companyId, contactId: session.contactId, direction: MessageDirection.INBOUND },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.deleted) throw new BadRequestException('No se puede editar un mensaje eliminado');
    if (message.type !== MessageType.TEXT) throw new BadRequestException('Solo se pueden editar mensajes de texto');

    const existingMetadata = (message.metadata as Record<string, unknown> | null) || {};
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        body: trimmed,
        metadata: { ...existingMetadata, edited: true, originalBody: (existingMetadata.originalBody as string | undefined) ?? message.body },
      },
    });
    await this.publishUpdate(instance.companyId, message.conversationId, updated);
    return updated;
  }

  // "Eliminar" (delete for everyone), mismo criterio que WhatsApp Web: solo el autor del
  // mensaje puede borrarlo, y es un borrado lógico (ver Message.deleted en el schema) — el
  // panel de agentes ya sabe pintar el placeholder "Se eliminó este mensaje" para esto.
  async deleteMessage(widgetPublicKey: string, token: string, messageId: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: instance.companyId, contactId: session.contactId, direction: MessageDirection.INBOUND },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.deleted) return { success: true };

    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { deleted: true } });
    await this.publishUpdate(instance.companyId, message.conversationId, updated);
    return { success: true };
  }

  // Mismo ruteo que publishInbound (sala conversation:{id} para el visitante + sala de
  // departamento para los agentes), pero como parche parcial en vez de un mensaje nuevo.
  private async publishUpdate(companyId: string, conversationId: string, message: unknown) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { departmentId: true } });
    void this.realtime.publish(companyId, 'message.updated', message, conversation?.departmentId, conversationId);
  }

  // Igual que MediaController, pero con el token de VisitorSession en vez de JWT: solo deja
  // pasar un archivo que pertenezca a una conversación del contacto dueño de ese token —
  // nunca el mediaUrl crudo de MinIO, que no tiene control de acceso propio.
  async resolveMedia(widgetPublicKey: string, token: string, messageId: string) {
    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.findSession(instance.companyId, token);
    if (!session) throw new UnauthorizedException('Sesión de visitante inválida o expirada');

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, companyId: instance.companyId, contactId: session.contactId },
      select: { mediaUrl: true, mimeType: true, fileName: true },
    });
    if (!message?.mediaUrl) throw new NotFoundException('Archivo no encontrado');
    return message;
  }
}
