import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType, UserRole, WhatsAppProvider, type Conversation, type VisitorSession } from '@prisma/client';
import { hashApiSecret, generateAuthKey as generateVisitorToken } from '../common/utils/secret';
import type { WidgetConfiguration } from '../instances/instances.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { StorageService } from '../storage/storage.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

const VISITOR_SESSION_DAYS = 180;

// Techo duro para el widget público, independiente del límite configurable por el
// superadmin para el panel (que puede llegar a 500MB pensado para agentes internos de
// confianza). Un visitante anónimo de internet es una superficie de abuso distinta — ver
// AGENTS.md "no aceptar archivos ejecutables libremente" y el punto 22/23 del brief.
const WIDGET_MAX_MEDIA_BYTES = 15 * 1024 * 1024;

// Lista blanca deliberadamente corta para Fase 1 del widget (imágenes + PDF, ver punto 22
// del brief) — nada de ejecutables, scripts, ni el "application/* => DOCUMENT" permisivo
// que sí usa conversations.service.ts para el panel interno (agentes de confianza).
function widgetMessageType(mimetype: string): MessageType | null {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimetype)) return MessageType.IMAGE;
  if (mimetype === 'application/pdf') return MessageType.DOCUMENT;
  return null;
}

// Selects shared with ConversationsService/SessionManager's own "hydrate for realtime"
// shape, kept in sync by hand since the widget creates these rows outside either of those
// — the panel's conversations list/thread rendering depends on this exact shape.
const hydratedConversationInclude = {
  contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
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
    };
  }

  async getBootstrap(widgetPublicKey: string) {
    return this.branding(await this.resolveChannel(widgetPublicKey));
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
    return this.branding(instance);
  }

  private async findSession(companyId: string, token: string) {
    return this.prisma.visitorSession.findFirst({
      where: { tokenHash: hashApiSecret(token), companyId, expiresAt: { gt: new Date() } },
    });
  }

  private async requireSession(companyId: string, token: string): Promise<VisitorSession> {
    const session = await this.findSession(companyId, token);
    if (!session) throw new UnauthorizedException('Sesión de visitante inválida o expirada');
    await this.prisma.visitorSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return session;
  }

  // Sin registro: a un visitante nuevo se le crea Contact + VisitorSession en el momento.
  // Si ya traía un token válido (localStorage de una visita anterior), se reconoce al mismo
  // contacto y se le devuelve el id de su conversación existente, si la tiene.
  async startSession(widgetPublicKey: string, existingToken?: string) {
    const instance = await this.resolveChannel(widgetPublicKey);

    if (existingToken) {
      const session = await this.findSession(instance.companyId, existingToken);
      if (session) {
        await this.prisma.visitorSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
        const conversation = await this.prisma.conversation.findUnique({
          where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
          select: { id: true },
        });
        return { token: existingToken, conversationId: conversation?.id ?? null };
      }
    }

    const visitorId = randomUUID();
    const contact = await this.prisma.contact.create({
      data: { companyId: instance.companyId, waId: `web:${visitorId}`, visitorId, source: 'widget' },
    });
    const token = generateVisitorToken();
    await this.prisma.visitorSession.create({
      data: {
        companyId: instance.companyId,
        contactId: contact.id,
        tokenHash: hashApiSecret(token),
        expiresAt: new Date(Date.now() + VISITOR_SESSION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return { token, conversationId: null };
  }

  // Mismas reglas de asignación por defecto y creación de Lead que el inbound de WhatsApp
  // (ver SessionManager.persistIncoming) — se replican aquí porque el widget no pasa por el
  // worker, que es quien las aplica para los mensajes entrantes de Baileys. Compartido por
  // sendMessage y sendMedia: ambos son "el visitante mandó algo", solo cambia el tipo.
  private async ensureConversation(instance: Awaited<ReturnType<WidgetService['resolveChannel']>>, session: VisitorSession): Promise<Conversation> {
    const existingConversation = await this.prisma.conversation.findUnique({
      where: { instanceId_contactId: { instanceId: instance.id, contactId: session.contactId } },
    });
    if (existingConversation) {
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
        unreadCount: 1,
        lastMessageAt: new Date(),
        departmentId: defaultDepartmentId,
        assignedUserId: defaultAgentId,
      },
    });

    const contact = await this.prisma.contact.findUnique({ where: { id: session.contactId }, select: { name: true, email: true } });
    const lead = await this.prisma.lead.create({
      data: {
        companyId: instance.companyId,
        title: contact?.name || 'Prospecto de Clienera Chat',
        personName: contact?.name || undefined,
        personEmail: contact?.email || undefined,
        assignedUserId: defaultAgentId,
        channel: 'clienera_chat',
        source: 'widget',
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

  async sendMessage(widgetPublicKey: string, token: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('El mensaje no puede estar vacío');

    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
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
    if (!type) throw new BadRequestException('Tipo de archivo no soportado. Solo se aceptan imágenes y PDF.');

    const configuredMax = await this.systemSettings.maxMediaSizeBytes();
    const maxBytes = Math.min(configuredMax, WIDGET_MAX_MEDIA_BYTES);
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException(`El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB)`);
    }

    const instance = await this.resolveChannel(widgetPublicKey);
    const session = await this.requireSession(instance.companyId, token);
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

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, direction: true, type: true, status: true, body: true, caption: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    });
    return { conversationId: conversation.id, messages };
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
