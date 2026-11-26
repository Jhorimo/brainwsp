import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from './realtime.bus';

// Avisos para los agentes dentro de un chat (tabla ConversationEvent, no son mensajes).
// Presencia del visitante de Clienera Chat:
//   visitor_joined → "El cliente se conectó · vía Instagram"
//   visitor_left   → "El cliente salió del chat" (solo si no vuelve en 2 min, para no llenar
//                    el chat de avisos cada vez que recarga o cambia de pestaña)
export const VISITOR_LEFT_GRACE_MS = 2 * 60 * 1000;

export type PresenceEventType = 'visitor_joined' | 'visitor_left';

// Decide si corresponde registrar un aviso según el último aviso de presencia del chat:
// "se conectó" si antes había salido o si entra por OTRA vía (otro dispositivo, otro
// enlace) aunque siga conectado en el primero; "salió" solo si estaba conectado.
export function shouldRecordPresence(
  type: PresenceEventType,
  last: { type: PresenceEventType; via?: string | null } | null,
  via?: string | null,
): boolean {
  if (type === 'visitor_joined') return last?.type !== 'visitor_joined' || (last.via ?? null) !== (via ?? null);
  return last?.type === 'visitor_joined';
}

@Injectable()
export class ConversationEventsService {
  private readonly logger = new Logger(ConversationEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
  ) {}

  async list(companyId: string, conversationId: string) {
    const rows = await this.prisma.conversationEvent.findMany({
      where: { companyId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.reverse();
  }

  // Registra un aviso de presencia si cambia el estado (conectado ↔ salió). El panel lo
  // recibe por realtime ('conversation.event'); nunca va a la sala del visitante.
  async recordPresence(conversationId: string, type: PresenceEventType, data?: Record<string, unknown>) {
    try {
      const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { companyId: true, departmentId: true } });
      if (!conversation) return null;
      const last = await this.prisma.conversationEvent.findFirst({
        where: { conversationId, type: { in: ['visitor_joined', 'visitor_left'] } },
        orderBy: { createdAt: 'desc' },
        select: { type: true, data: true },
      });
      const lastPresence = last ? { type: last.type as PresenceEventType, via: (last.data as { via?: string | null } | null)?.via ?? null } : null;
      if (!shouldRecordPresence(type, lastPresence, (data?.via as string | null | undefined) ?? null)) return null;
      const event = await this.prisma.conversationEvent.create({
        data: { companyId: conversation.companyId, conversationId, type, data: (data ?? {}) as object },
      });
      void this.realtime.publish(conversation.companyId, 'conversation.event', event, conversation.departmentId);
      return event;
    } catch (error) {
      this.logger.warn(`no se pudo registrar el aviso ${type} (${conversationId}): ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
