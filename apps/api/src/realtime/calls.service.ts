import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from './realtime.bus';

export type CallEndReason = 'answered' | 'missed' | 'declined' | 'cancelled' | 'failed';

// Cómo se armó la invitación: o bien un agente asignado específico ya estaba conectado (uno
// o más sockets suyos, por si tiene varias pestañas abiertas), o no había nadie asignado /
// no estaba conectado y se hizo fan-out a las salas de departamento — igual que
// RealtimeGateway.emitScoped rutea cualquier otro evento. Guardar esto en el estado de la
// llamada es lo que permite, al aceptar/terminar, avisar exactamente a los mismos
// destinatarios originales sin tener que recalcular el ruteo.
export type CallInviteTargets = { socketIds: string[] } | { rooms: string[] };

export interface CallConversationContext {
  companyId: string;
  conversationId: string;
  departmentId: string | null;
  contactId: string;
  instanceId: string;
}

export interface CallState extends CallConversationContext {
  callId: string;
  visitorSocketId: string;
  inviteTargets: CallInviteTargets;
  status: 'ringing' | 'active' | 'ended';
  agentSocketId?: string;
  acceptedByUserId?: string;
  createdAt: number;
  answeredAt?: number;
  ringTimeout?: NodeJS.Timeout;
}

// Mismo shape que `hydratedConversationInclude` en WidgetService — duplicado a propósito
// (ese const es privado a ese archivo) en vez de depender de él: ambos existen para que el
// panel de agentes pueda pintar la conversación completa apenas llega el evento realtime,
// sin una segunda ida al backend.
const hydratedConversationInclude = {
  contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
  assignedUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  instance: { select: { id: true, name: true, slug: true, status: true, provider: true } },
} as const;

// Estado de llamadas en memoria, deliberadamente ajeno a Socket.IO (nunca referencia
// `Server`/`Socket`) para que RealtimeGateway pueda inyectarlo sin dependencia circular: este
// servicio decide y persiste el resultado de cada llamada, el gateway decide a qué sockets
// avisar. Solo funciona con una instancia de API (ver AGENTS.md / nota en el gateway) — el
// Map no sobrevive un reinicio ni se comparte entre réplicas.
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
  ) {}

  private readonly calls = new Map<string, CallState>();
  private readonly byVisitorSocket = new Map<string, string>();
  private readonly byAgentSocket = new Map<string, string>();

  get(callId: string): CallState | undefined {
    return this.calls.get(callId);
  }

  getByVisitorSocket(socketId: string): CallState | undefined {
    const callId = this.byVisitorSocket.get(socketId);
    return callId ? this.calls.get(callId) : undefined;
  }

  getByAgentSocket(socketId: string): CallState | undefined {
    const callId = this.byAgentSocket.get(socketId);
    return callId ? this.calls.get(callId) : undefined;
  }

  startCall(callId: string, visitorSocketId: string, context: CallConversationContext, inviteTargets: CallInviteTargets): CallState {
    const call: CallState = { callId, visitorSocketId, inviteTargets, status: 'ringing', createdAt: Date.now(), ...context };
    this.calls.set(callId, call);
    this.byVisitorSocket.set(visitorSocketId, callId);
    return call;
  }

  attachRingTimeout(callId: string, timeout: NodeJS.Timeout) {
    const call = this.calls.get(callId);
    if (call) call.ringTimeout = timeout;
  }

  // El ganador de la carrera entre varios "accept" casi simultáneos: el Map es un objeto
  // plano de un solo proceso Node, así que esta comprobación-y-escritura es atómica para el
  // despliegue actual (una sola instancia de API) — dos llamadas a accept() para el mismo
  // callId nunca se intercalan entre sí.
  accept(callId: string, userId: string, agentSocketId: string): CallState | { error: 'not_found' | 'already_taken' } {
    const call = this.calls.get(callId);
    if (!call) return { error: 'not_found' };
    if (call.status !== 'ringing') return { error: 'already_taken' };
    if (call.ringTimeout) clearTimeout(call.ringTimeout);
    call.ringTimeout = undefined;
    call.status = 'active';
    call.agentSocketId = agentSocketId;
    call.acceptedByUserId = userId;
    call.answeredAt = Date.now();
    this.byAgentSocket.set(agentSocketId, callId);
    return call;
  }

  async end(callId: string, reason: CallEndReason): Promise<CallState | undefined> {
    const call = this.calls.get(callId);
    if (!call || call.status === 'ended') return undefined;
    if (call.ringTimeout) clearTimeout(call.ringTimeout);
    const finished: CallState = { ...call, status: 'ended' };
    this.calls.delete(callId);
    this.byVisitorSocket.delete(call.visitorSocketId);
    if (call.agentSocketId) this.byAgentSocket.delete(call.agentSocketId);

    const durationSeconds = call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : undefined;
    await this.persistCallMessage(finished, reason, durationSeconds);
    return finished;
  }

  // Se llama desde el timer de 35s armado en el gateway al emitir "call:invite" — no-op si
  // para entonces ya se aceptó, rechazó o canceló (evita un "perdida" tardío pisando un
  // estado ya resuelto).
  async timeoutIfStillRinging(callId: string): Promise<CallState | undefined> {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'ringing') return undefined;
    return this.end(callId, 'missed');
  }

  // Mismo patrón que WidgetService.sendMessage/publishInbound: crear el Message, bumpear
  // lastMessageAt + unreadCount de la conversación, e hidratarla para el fan-out — así tanto
  // el panel (que ya escucha "message.created") como el propio widget del visitante pintan
  // la burbuja de la llamada sin que ninguno de los dos necesite un listener nuevo.
  private async persistCallMessage(call: CallState, callStatus: CallEndReason, durationSeconds?: number) {
    const message = await this.prisma.message.create({
      data: {
        companyId: call.companyId,
        conversationId: call.conversationId,
        instanceId: call.instanceId,
        contactId: call.contactId,
        direction: MessageDirection.INBOUND,
        type: MessageType.CALL,
        status: MessageStatus.RECEIVED,
        metadata: { callType: 'voice', callStatus, callId: call.callId, ...(durationSeconds !== undefined ? { durationSeconds } : {}) },
      },
    });
    const conversation = await this.prisma.conversation.update({
      where: { id: call.conversationId },
      data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      include: hydratedConversationInclude,
    });
    void this.realtime.publish(
      call.companyId,
      'message.created',
      { message, conversation: { ...conversation, messages: [message] } },
      conversation.departmentId,
      call.conversationId,
    );
  }
}
