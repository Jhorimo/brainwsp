import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageDirection, MessageStatus, MessageType, WhatsAppProvider } from '@prisma/client';
import { getPrimaryWebOrigin } from '../common/cors-origin';
import type { WidgetConfiguration } from '../instances/instances.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { MailService } from '../system-settings/mail.service';
import { buildReplyEmail } from './reply-email';
import { createResumeToken } from './resume-token';

// Espera antes de avisar: si el visitante tiene el chat abierto, lo lee (✓✓ azul → READ) y
// no recibe correo. Y como máximo un correo cada 30 min por conversación.
const WAIT_MS = 3 * 60 * 1000;
const MIN_GAP_MS = 30 * 60 * 1000;
// No se avisa de mensajes de más de un día (ej. al activar el correo por primera vez).
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;
// En Clienera Chat el mensaje del agente ya es visible para el visitante apenas se publica;
// el estado solo refleja el acuse del worker (QUEUED → SENT) y del visitante (READ). Todo lo
// que no sea READ ni FAILED cuenta como "no lo vio".
const UNREAD_BY_VISITOR = [MessageStatus.QUEUED, MessageStatus.PROCESSING, MessageStatus.SENT, MessageStatus.DELIVERED];

const TYPE_LABELS: Partial<Record<MessageType, string>> = {
  IMAGE: '🖼️ Te enviaron una imagen',
  AUDIO: '🎤 Te enviaron un audio',
  VIDEO: '🎬 Te enviaron un video',
  DOCUMENT: '📎 Te enviaron un archivo',
  LOCATION: '📍 Te enviaron una ubicación',
  CONTACT: '👤 Te enviaron un contacto',
  STICKER: '🙂 Te enviaron un sticker',
};

// Avisos por correo de Clienera Chat: cuando un agente (o el bot) responde a un visitante
// que llegó por el ENLACE, dejó su correo y no vio la respuesta, se le manda un correo con
// el botón "Continuar la conversación". Corre cada minuto en la API; con dos réplicas
// durante el rolling deploy, el "reclamo" atómico de lastEmailNotifiedAt evita duplicados.
@Injectable()
export class ClieneraMailNotifier {
  private readonly logger = new Logger(ClieneraMailNotifier.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeBus,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.mail.status()).enabled) return;
      const now = Date.now();
      const pending = await this.prisma.message.findMany({
        where: {
          direction: MessageDirection.OUTBOUND,
          status: { in: UNREAD_BY_VISITOR },
          deleted: false,
          createdAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now - WAIT_MS) },
          instance: { provider: WhatsAppProvider.CLIENERA_CHAT },
          contact: { email: { not: null }, emailNotify: true, source: { startsWith: 'link' } },
        },
        distinct: ['conversationId'],
        select: { conversationId: true },
        take: BATCH,
      });
      for (const { conversationId } of pending) {
        await this.notify(conversationId, now).catch((error) =>
          this.logger.warn(`aviso por correo falló (conversación ${conversationId}): ${error instanceof Error ? error.message : error}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  async notify(conversationId: string, now = Date.now()) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        companyId: true,
        departmentId: true,
        lastEmailNotifiedAt: true,
        contact: { select: { id: true, name: true, email: true, emailNotify: true, metadata: true } },
        instance: { select: { configuration: true, company: { select: { name: true, slug: true } } } },
      },
    });
    if (!conversation?.contact.email || !conversation.contact.emailNotify) return false;
    const previous = conversation.lastEmailNotifiedAt;
    if (previous && now - previous.getTime() < MIN_GAP_MS) return false;

    const since = new Date(Math.max(previous?.getTime() ?? 0, now - LOOKBACK_MS));
    const unread = await this.prisma.message.findMany({
      where: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        status: { in: UNREAD_BY_VISITOR },
        deleted: false,
        type: { not: MessageType.CALL },
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'asc' },
      select: { body: true, caption: true, type: true, createdAt: true },
    });
    if (!unread.length) return false;

    // Reclamo atómico: solo una réplica/tick gana el envío de esta conversación.
    const claimed = await this.prisma.conversation.updateMany({
      where: { id: conversationId, OR: [{ lastEmailNotifiedAt: null }, { lastEmailNotifiedAt: { lt: new Date(now - MIN_GAP_MS) } }] },
      data: { lastEmailNotifiedAt: new Date(now) },
    });
    if (!claimed.count) return false;

    const config = (conversation.instance.configuration as WidgetConfiguration | null) ?? {};
    const companyName = config.displayName || conversation.instance.company.name;
    const web = getPrimaryWebOrigin().replace(/\/+$/, '');
    const token = createResumeToken(conversation.companyId, conversation.contact.id);
    const pageUrl = `${web}/c/${conversation.instance.company.slug}`;
    const completed = Boolean((conversation.contact.metadata as { prechatCompletedAt?: string } | null)?.prechatCompletedAt);
    const email = buildReplyEmail({
      companyName,
      color: config.color || '#6b8afd',
      visitorName: completed ? conversation.contact.name : null,
      messages: unread.map((m) => ({ text: m.body || m.caption || TYPE_LABELS[m.type] || 'Tienes un mensaje nuevo', at: m.createdAt })),
      continueUrl: `${pageUrl}?r=${encodeURIComponent(token)}`,
      unsubscribeUrl: `${pageUrl}?baja=${encodeURIComponent(token)}`,
    });

    let sent = false;
    try {
      sent = await this.mail.send({
        to: conversation.contact.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        fromName: companyName,
        headers: { 'List-Unsubscribe': `<${pageUrl}?baja=${encodeURIComponent(token)}>` },
      });
    } finally {
      // Si no salió, se devuelve el valor anterior para reintentar en el próximo minuto.
      if (!sent) await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastEmailNotifiedAt: previous } });
    }
    if (!sent) return false;

    this.logger.log(`aviso por correo enviado (conversación ${conversationId}, ${unread.length} mensaje(s))`);
    void this.realtime.publish(conversation.companyId, 'conversation.updated', { id: conversationId, lastEmailNotifiedAt: new Date(now).toISOString() }, conversation.departmentId);
    return true;
  }
}
