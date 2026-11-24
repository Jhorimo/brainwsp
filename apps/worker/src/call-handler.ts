import { MessageDirection, MessageStatus, MessageType, type PrismaClient } from '@prisma/client';
import type { WACallEvent } from '@whiskeysockets/baileys';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { completeLidPair } from './lid-identity.js';
import { jidToPhone } from './message-utils.js';
import type { RealtimePublisher } from './realtime.js';

// Llamadas de WhatsApp entrantes (voz y video) de una línea Baileys.
//
// - Avisa al panel en tiempo real (evento `whatsapp.call`) para mostrar el aviso flotante a
//   TODOS los agentes de la empresa, y lo vuelve a avisar al terminar para que se cierre solo.
// - Solo rechaza por acción humana (comando `reject-call` desde el panel): nunca automático.
// - Al terminar, deja la llamada en el historial del chat (mensaje CALL) si el contacto ya
//   tiene conversación en esa línea. Contestar desde la web NO es posible: Baileys solo maneja
//   la señalización de la llamada, no el audio.
// - Llamadas de grupo y las que llegan "offline" (de cuando la línea estaba desconectada) se
//   descartan: no tiene sentido hacer sonar un aviso de algo que ya pasó.

export type CallPhase = 'ringing' | 'answered_elsewhere' | 'missed' | 'declined';
// Mismos valores que ya pinta el chat para las llamadas del widget (callLabel en el panel).
export type CallEndReason = 'answered' | 'missed' | 'declined';

export interface TrackedCall {
  callId: string;
  instanceId: string;
  companyId: string;
  lineName: string;
  from: string;
  isVideo: boolean;
  startedAt: number;
  acceptedAt?: number;
  rejectedByName?: string | null;
  finalized: boolean;
  simulated: boolean;
  contactId?: string;
  conversationId?: string;
  contactName: string | null;
  phoneMasked: string;
  ringTimer?: ReturnType<typeof setTimeout>;
}

// Tope de timbre: WhatsApp corta solo a los ~45-60 s; si por lo que sea nunca llega el evento
// final, el aviso no puede quedarse sonando para siempre.
export const MAX_RING_MS = 75_000;

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return 'Número oculto';
  const last = digits.slice(-3);
  if (digits.startsWith('51') && digits.length === 11) return `+51 9•• ••• ${last}`;
  return `+${digits.slice(0, 2)} ••• ••• ${last}`;
}

// Qué hacer con cada estado que manda Baileys para una llamada ya conocida (o nueva).
export function classify(status: WACallEvent['status'], tracked: TrackedCall | undefined):
  | { kind: 'start' }
  | { kind: 'answered' }
  | { kind: 'end'; reason: CallEndReason }
  | { kind: 'ignore' } {
  if (status === 'offer') return tracked ? { kind: 'ignore' } : { kind: 'start' };
  if (!tracked || tracked.finalized) return { kind: 'ignore' };
  if (status === 'accept') return tracked.acceptedAt ? { kind: 'ignore' } : { kind: 'answered' };
  if (status === 'reject') return { kind: 'end', reason: 'declined' };
  if (status === 'timeout') return { kind: 'end', reason: 'missed' };
  if (status === 'terminate') return { kind: 'end', reason: tracked.acceptedAt ? 'answered' : 'missed' };
  return { kind: 'ignore' }; // ringing, preaccept, transport, relaylatency
}

type RejectFn = (callId: string, callFrom: string) => Promise<void>;

export class CallHandler {
  private readonly calls = new Map<string, TrackedCall>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly realtime: RealtimePublisher,
    private readonly outboundQueue: Queue,
    private readonly logger: Logger,
    private readonly getRejecter: (instanceId: string) => RejectFn | undefined,
  ) {}

  async handleEvents(instanceId: string, events: WACallEvent[], simulated = false) {
    for (const event of events) {
      await this.handleEvent(instanceId, event, simulated).catch((error) => {
        this.logger.error({ err: error, instanceId, callId: event.id, status: event.status }, 'failed to handle call event');
      });
    }
  }

  private async handleEvent(instanceId: string, event: WACallEvent, simulated: boolean) {
    if (event.isGroup || event.groupJid) return;
    const tracked = this.calls.get(event.id);
    const action = classify(event.status, tracked);
    if (action.kind === 'ignore') return;
    if (action.kind === 'start') {
      if (event.offline) return;
      await this.start(instanceId, event, simulated);
      return;
    }
    if (action.kind === 'answered') {
      tracked!.acceptedAt = Date.now();
      if (tracked!.ringTimer) clearTimeout(tracked!.ringTimer);
      await this.publish(tracked!, 'answered_elsewhere');
      return;
    }
    await this.finish(tracked!, action.reason);
  }

  private async start(instanceId: string, event: WACallEvent, simulated: boolean) {
    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId }, select: { companyId: true, name: true } });
    if (!instance) return;

    const strip = (jid: string) => {
      const [user, server] = jid.split('@');
      return server ? `${user.split(':')[0]}@${server}` : jid;
    };
    const sent = [strip(event.from), ...(event.callerPn ? [strip(event.callerPn)] : [])];
    const pair = await completeLidPair(this.prisma, instance.companyId, sent).catch(() => ({ lidJid: null, phoneJid: null }));
    const phone = (pair.phoneJid && jidToPhone(pair.phoneJid)) || sent.map(jidToPhone).find(Boolean) || null;
    const jids = [...new Set([...sent, ...(pair.lidJid ? [pair.lidJid] : []), ...(pair.phoneJid ? [pair.phoneJid] : [])])];
    const contact = await this.prisma.contact.findFirst({
      where: {
        companyId: instance.companyId,
        OR: [{ waId: { in: jids } }, ...(phone ? [{ phone, waId: { not: { endsWith: '@broadcast' } } }] : [])],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, pushName: true },
    });
    const conversation = contact
      ? await this.prisma.conversation.findUnique({ where: { instanceId_contactId: { instanceId, contactId: contact.id } }, select: { id: true } })
      : null;

    const call: TrackedCall = {
      callId: event.id,
      instanceId,
      companyId: instance.companyId,
      lineName: instance.name,
      from: event.from,
      isVideo: !!event.isVideo,
      startedAt: event.date ? new Date(event.date).getTime() : Date.now(),
      finalized: false,
      simulated,
      contactId: contact?.id,
      conversationId: conversation?.id,
      contactName: contact?.name || contact?.pushName || null,
      phoneMasked: maskPhone(phone),
    };
    if (!Number.isFinite(call.startedAt) || call.startedAt > Date.now()) call.startedAt = Date.now();
    call.ringTimer = setTimeout(() => {
      if (!call.finalized && !call.acceptedAt) void this.finish(call, 'missed');
    }, MAX_RING_MS);
    call.ringTimer.unref?.();
    this.calls.set(call.callId, call);
    this.logger.info({ instanceId, callId: call.callId, isVideo: call.isVideo, simulated, known: !!contact }, 'llamada de WhatsApp entrante');
    await this.publish(call, 'ringing');
  }

  // Rechazo pedido por un agente desde el aviso flotante.
  async reject(instanceId: string, callId: string, rejectedByName: string | null) {
    const call = this.calls.get(callId);
    if (!call || call.instanceId !== instanceId || call.finalized) return { rejected: false, reason: 'not-ringing' as const };
    if (call.acceptedAt) return { rejected: false, reason: 'already-answered' as const };
    if (!call.simulated) {
      const rejectCall = this.getRejecter(instanceId);
      if (!rejectCall) return { rejected: false, reason: 'line-offline' as const };
      await rejectCall(call.callId, call.from);
    }
    call.rejectedByName = rejectedByName || 'un agente';
    await this.finish(call, 'declined');
    await this.maybeAutoReply(call);
    return { rejected: true as const };
  }

  private async finish(call: TrackedCall, reason: CallEndReason) {
    if (call.finalized) return;
    call.finalized = true;
    if (call.ringTimer) clearTimeout(call.ringTimer);
    // Se borra con retraso: si WhatsApp repite el evento final, `classify` lo ignora igual.
    setTimeout(() => this.calls.delete(call.callId), 5 * 60_000).unref?.();
    await this.publish(call, reason === 'answered' ? 'answered_elsewhere' : reason);
    await this.persistHistory(call, reason).catch((error) => {
      this.logger.warn({ err: error, callId: call.callId }, 'failed to store call in chat history');
    });
  }

  private publish(call: TrackedCall, phase: CallPhase) {
    // Sin departmentId => sala general de la empresa: lo ven todos los agentes de la línea.
    return this.realtime.publish(call.companyId, 'whatsapp.call', {
      callId: call.callId,
      instanceId: call.instanceId,
      lineName: call.lineName,
      phase,
      isVideo: call.isVideo,
      contactName: call.contactName,
      phoneMasked: call.phoneMasked,
      conversationId: call.conversationId ?? null,
      startedAt: new Date(call.startedAt).toISOString(),
      rejectedByName: call.rejectedByName ?? null,
      simulated: call.simulated,
    });
  }

  private async persistHistory(call: TrackedCall, reason: CallEndReason) {
    if (!call.conversationId || !call.contactId) return; // contacto sin chat en esta línea: solo aviso
    const durationSeconds = reason === 'answered' && call.acceptedAt ? Math.max(0, Math.round((Date.now() - call.acceptedAt) / 1000)) : undefined;
    const message = await this.prisma.message.create({
      data: {
        companyId: call.companyId,
        conversationId: call.conversationId,
        instanceId: call.instanceId,
        contactId: call.contactId,
        waMessageId: `call:${call.callId}`,
        direction: MessageDirection.INBOUND,
        type: MessageType.CALL,
        status: MessageStatus.RECEIVED,
        metadata: {
          callType: call.isVideo ? 'video' : 'voice',
          callStatus: reason,
          callId: call.callId,
          source: 'whatsapp',
          ...(call.rejectedByName ? { rejectedByName: call.rejectedByName } : {}),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(call.simulated ? { simulated: true } : {}),
        },
      },
    });
    const conversation = await this.prisma.conversation.update({
      where: { id: call.conversationId },
      data: { lastMessageAt: new Date(), ...(reason === 'missed' ? { unreadCount: { increment: 1 } } : {}) },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    await this.realtime.publish(call.companyId, 'message.created', { message, conversation: { ...conversation, messages: [message] } }, conversation.departmentId, call.conversationId);
  }

  // Mensaje opcional tras rechazar: solo si la línea lo tiene activado Y con texto. Por
  // defecto no se envía nada.
  private async maybeAutoReply(call: TrackedCall) {
    if (!call.conversationId || !call.contactId) return;
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { id: call.instanceId },
      select: { callRejectAutoReply: true, callRejectMessage: true },
    });
    const text = instance?.callRejectMessage?.trim();
    if (!instance?.callRejectAutoReply || !text) return;
    const message = await this.prisma.message.create({
      data: {
        companyId: call.companyId,
        conversationId: call.conversationId,
        instanceId: call.instanceId,
        contactId: call.contactId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.QUEUED,
        body: text,
        metadata: { callRejectReply: true, callId: call.callId },
      },
    });
    if (call.simulated) return; // en simulación no sale nada a WhatsApp
    await this.outboundQueue.add('send-text', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });
  }

  // Solo para pruebas locales (ALLOW_CALL_SIMULATION=1): inyecta una llamada falsa por el
  // mismo camino que una real. `end` define cómo termina sola si nadie la rechaza.
  async simulate(instanceId: string, opts: { phone: string; isVideo?: boolean; end?: 'timeout' | 'accept' | 'terminate' | 'none'; afterSeconds?: number }) {
    const callId = `SIM${Date.now().toString(36).toUpperCase()}`;
    const from = `${opts.phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const base = { chatId: from, from, id: callId, isVideo: !!opts.isVideo, isGroup: false, offline: false };
    await this.handleEvents(instanceId, [{ ...base, date: new Date(), status: 'offer' }], true);
    const after = Math.max(1, opts.afterSeconds ?? 12) * 1000;
    if (opts.end === 'accept') {
      setTimeout(() => void this.handleEvents(instanceId, [{ ...base, date: new Date(), status: 'accept' }], true), after);
      setTimeout(() => void this.handleEvents(instanceId, [{ ...base, date: new Date(), status: 'terminate' }], true), after + 8000);
    } else if (opts.end && opts.end !== 'none') {
      const status = opts.end;
      setTimeout(() => void this.handleEvents(instanceId, [{ ...base, date: new Date(), status }], true), after);
    }
    return { callId };
  }
}
