import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MessageDirection, MessageStatus, UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { createCorsOriginValidator } from '../common/cors-origin';
import { AgentAccessService } from '../common/services/agent-access.service';
import { hashApiSecret } from '../common/utils/secret';
import type { WidgetConfiguration } from '../instances/instances.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../common/types/jwt-user';
import { CallsService, type CallEndReason, type CallInviteTargets, type CallState } from './calls.service';

// Cuánto suena una llamada antes de darla por perdida si nadie contesta — ver
// handleRingTimeout.
const CALL_RING_TIMEOUT_MS = 35_000;

@WebSocketGateway({
  cors: {
    origin: createCorsOriginValidator(),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly agentAccess: AgentAccessService,
    private readonly prisma: PrismaService,
    private readonly calls: CallsService,
  ) {}

  // Sockets de agentes actualmente conectados, por userId — en memoria, de esta sola
  // instancia de API (ver nota de escalado en CallsService). Es lo único que permite
  // "call:invite" decidir si suena solo el agente asignado o si hay que hacer fan-out al
  // departamento; nada de esto existía antes de las llamadas (el gateway era puramente
  // servidor→cliente).
  private readonly agentSockets = new Map<string, Set<string>>();

  async handleConnection(client: Socket) {
    // Dos formas de autenticarse en el mismo gateway: un agente del panel (JWT, como
    // siempre) o un visitante del widget de Clienera Chat (token de VisitorSession, sin
    // cuenta). Son caminos disjuntos a propósito — un visitante jamás obtiene un JWT y
    // jamás se une a una sala `company:*`, solo a la de su propia conversación.
    const visitorToken = client.handshake.auth?.visitorToken ? String(client.handshake.auth.visitorToken) : '';
    if (visitorToken) return this.handleVisitorConnection(client, visitorToken);

    const token = String(client.handshake.auth?.token || '').replace(/^Bearer\s+/i, '');
    if (!token) return client.disconnect(true);
    try {
      const user = await this.jwt.verifyAsync<JwtUser>(token, { secret: process.env.JWT_SECRET || 'development-only-secret-change-me' });
      client.data.user = user;
      this.registerAgentSocket(user.sub, client.id);
      // Every connection gets the general room (events that aren't tied to a single
      // conversation, e.g. instance connectivity). Conversation-scoped events go only
      // to the "full" room (Owner/Admin/Supervisor, who aren't department-restricted)
      // or to the specific department/unassigned rooms an Agent is scoped to — see
      // ConversationsService.resolveDepartmentRestriction for the matching REST rule.
      await client.join(`company:${user.companyId}`);
      if (user.role === UserRole.AGENT) {
        const { departmentIds } = await this.agentAccess.getAgentAccess(user.sub);
        await client.join(`company:${user.companyId}:unassigned`);
        await Promise.all(departmentIds.map((departmentId) => client.join(`company:${user.companyId}:dept:${departmentId}`)));
      } else {
        await client.join(`company:${user.companyId}:all`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  // The widget already knows its own conversationId by the time it opens a socket (it
  // gets it back from the first POST /widget/:key/messages) — so there's no separate
  // "join" handshake to design: the token proves who the visitor is, and the only room it
  // can ever ask to join is the one conversation that token's contact actually owns.
  private async handleVisitorConnection(client: Socket, visitorToken: string) {
    const conversationId = String(client.handshake.auth?.conversationId || '');
    if (!conversationId) return client.disconnect(true);
    try {
      const session = await this.prisma.visitorSession.findFirst({
        where: { tokenHash: hashApiSecret(visitorToken), expiresAt: { gt: new Date() } },
        select: { contactId: true },
      });
      if (!session) return client.disconnect(true);
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, contactId: session.contactId },
        select: { id: true, companyId: true, departmentId: true },
      });
      if (!conversation) return client.disconnect(true);
      client.data.visitorContactId = session.contactId;
      // Guardado para "call:invite" y para escritura/acuses de entrega-lectura (typing,
      // message:delivered, message:read), que no mandan payload propio — la conversación
      // (y a quién avisarle) sale del socket, nunca de algo que mande el cliente (mismo
      // principio que el resto de este gateway).
      client.data.conversationId = conversationId;
      client.data.companyId = conversation.companyId;
      client.data.departmentId = conversation.departmentId;
      await client.join(`conversation:${conversationId}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as JwtUser | undefined;
    if (user) {
      const sockets = this.agentSockets.get(user.sub);
      sockets?.delete(client.id);
      if (sockets && sockets.size === 0) this.agentSockets.delete(user.sub);

      const call = this.calls.getByAgentSocket(client.id);
      if (call) await this.finishCall(call.callId, call.status === 'active' ? 'failed' : 'missed');
      return;
    }

    const visitorCall = this.calls.getByVisitorSocket(client.id);
    if (visitorCall) await this.finishCall(visitorCall.callId, visitorCall.status === 'active' ? 'failed' : 'cancelled');
  }

  private registerAgentSocket(userId: string, socketId: string) {
    const set = this.agentSockets.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.agentSockets.set(userId, set);
  }

  emitToCompany(companyId: string, event: string, payload: unknown) {
    this.server.to(`company:${companyId}`).emit(event, payload);
  }

  // departmentId undefined = not conversation-scoped, goes to everyone via the general
  // room. Otherwise it's routed to whichever agents are actually allowed to see it.
  emitScoped(companyId: string, event: string, payload: unknown, departmentId?: string | null, conversationId?: string) {
    if (conversationId) this.server.to(`conversation:${conversationId}`).emit(event, payload);
    if (departmentId === undefined) {
      this.emitToCompany(companyId, event, payload);
      return;
    }
    this.server.to(`company:${companyId}:all`).emit(event, payload);
    this.server.to(departmentId === null ? `company:${companyId}:unassigned` : `company:${companyId}:dept:${departmentId}`).emit(event, payload);
  }

  // ---- Llamadas de voz WebRTC (Clienera Chat) ----
  // El gateway solo hace ruteo (quién se entera de qué) y las consultas a Prisma que ese
  // ruteo necesita; CallsService guarda el estado y persiste el resultado. Ver el plan en
  // la conversación / PR para el diagrama completo de la secuencia.

  @SubscribeMessage('call:invite')
  async handleCallInvite(@ConnectedSocket() client: Socket) {
    const conversationId = client.data.conversationId as string | undefined;
    if (!conversationId || !client.data.visitorContactId) return; // solo visitantes invitan
    if (this.calls.getByVisitorSocket(client.id)) return; // ya tiene una llamada en curso

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        companyId: true,
        departmentId: true,
        assignedUserId: true,
        instanceId: true,
        contactId: true,
        instance: { select: { configuration: true } },
      },
    });
    if (!conversation) return;

    const config = (conversation.instance?.configuration as WidgetConfiguration | null) ?? {};
    if (config.allowCalls === false) {
      client.emit('call:error', { reason: 'disabled' });
      return;
    }

    const callId = randomUUID();
    const assignedSockets = conversation.assignedUserId ? this.agentSockets.get(conversation.assignedUserId) : undefined;
    const inviteTargets: CallInviteTargets = assignedSockets?.size
      ? { socketIds: Array.from(assignedSockets) }
      : {
          rooms: [
            `company:${conversation.companyId}:all`,
            conversation.departmentId
              ? `company:${conversation.companyId}:dept:${conversation.departmentId}`
              : `company:${conversation.companyId}:unassigned`,
          ],
        };

    this.calls.startCall(
      callId,
      client.id,
      {
        companyId: conversation.companyId,
        conversationId,
        departmentId: conversation.departmentId,
        contactId: conversation.contactId,
        instanceId: conversation.instanceId,
      },
      inviteTargets,
    );

    const contact = await this.prisma.contact.findUnique({
      where: { id: conversation.contactId },
      select: { name: true, pushName: true, phone: true },
    });
    const invitePayload = {
      callId,
      conversationId,
      contact: { name: contact?.name || contact?.pushName || contact?.phone || 'Visitante' },
    };
    this.emitToInviteTargets(inviteTargets, 'call:invite', invitePayload);
    client.emit('call:ringing', { callId });

    const timeout = setTimeout(() => void this.handleRingTimeout(callId), CALL_RING_TIMEOUT_MS);
    this.calls.attachRingTimeout(callId, timeout);
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { callId?: string }) {
    const user = client.data.user as JwtUser | undefined;
    if (!user || !data?.callId) return;

    const result = this.calls.accept(data.callId, user.sub, client.id);
    if ('error' in result) {
      client.emit('call:error', { callId: data.callId, reason: result.error });
      return;
    }

    this.server.to(result.visitorSocketId).emit('call:accepted', { callId: result.callId });
    client.emit('call:accepted', { callId: result.callId });
    // Avisa a todos los invitados originales (incluido, inofensivamente, el propio ganador)
    // de que la llamada ya se tomó — el cliente descarta su propia "sonando" comparando
    // byUserId contra el suyo.
    this.emitToInviteTargets(result.inviteTargets, 'call:taken', { callId: result.callId, byUserId: user.sub });
  }

  @SubscribeMessage('call:decline')
  async handleCallDecline(@ConnectedSocket() client: Socket, @MessageBody() data: { callId?: string }) {
    if (!data?.callId) return;
    const call = this.calls.get(data.callId);
    // Fan-out grupal (nadie asignado conectado): "rechazar" solo descarta la UI de ESE
    // agente — la llamada sigue sonando para el resto y para el visitante. Solo cuando era
    // 1:1 (agente asignado conectado) un rechazo termina la llamada de verdad.
    if (!call || call.status !== 'ringing' || 'rooms' in call.inviteTargets) return;
    await this.finishCall(data.callId, 'declined');
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { callId?: string }) {
    if (!data?.callId) return;
    const call = this.calls.get(data.callId);
    if (!call) return;
    const reason: CallEndReason = call.status === 'active' ? 'answered' : client.id === call.visitorSocketId ? 'cancelled' : 'declined';
    await this.finishCall(data.callId, reason);
  }

  // Relay puro de señalización SDP/ICE — el gateway no entiende ni toca el contenido, solo
  // verifica que quien manda sea realmente una de las dos puntas de ESA llamada (si no,
  // cualquiera podría inyectar señalización en una llamada ajena adivinando un callId).
  @SubscribeMessage('call:signal')
  handleCallSignal(@ConnectedSocket() client: Socket, @MessageBody() data: { callId?: string; type?: string; data?: unknown }) {
    if (!data?.callId) return;
    const call = this.calls.get(data.callId);
    if (!call || call.status !== 'active') return;

    let targetSocketId: string | undefined;
    if (client.id === call.visitorSocketId) targetSocketId = call.agentSocketId;
    else if (client.id === call.agentSocketId) targetSocketId = call.visitorSocketId;
    else return;

    if (targetSocketId) this.server.to(targetSocketId).emit('call:signal', { callId: data.callId, type: data.type, data: data.data });
  }

  private async handleRingTimeout(callId: string) {
    const call = await this.calls.timeoutIfStillRinging(callId);
    if (call) this.emitCallEnded(call, 'missed');
  }

  private async finishCall(callId: string, reason: CallEndReason) {
    const call = await this.calls.end(callId, reason);
    if (call) this.emitCallEnded(call, reason);
  }

  private emitCallEnded(call: CallState, reason: CallEndReason) {
    this.server.to(call.visitorSocketId).emit('call:end', { callId: call.callId, reason });
    this.emitToInviteTargets(call.inviteTargets, 'call:end', { callId: call.callId, reason });
  }

  private emitToInviteTargets(targets: CallInviteTargets, event: string, payload: unknown) {
    const destinations = 'socketIds' in targets ? targets.socketIds : targets.rooms;
    destinations.forEach((destination) => this.server.to(destination).emit(event, payload));
  }

  // ---- "Escribiendo..." y acuses de entrega/lectura (Clienera Chat) ----
  // Mismo principio que las llamadas: esto es puro ruteo en tiempo real, sin pasar por
  // RealtimeBus/Redis (solo funciona con una instancia de API, ver nota de escalado en
  // CallsService) — nada de esto se persiste salvo el cambio de `Message.status`, que sí
  // necesita sobrevivir un refresh de la página.

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId?: string; typing?: boolean }) {
    const typing = Boolean(data?.typing);
    if (client.data.visitorContactId) {
      const conversationId = client.data.conversationId as string | undefined;
      const companyId = client.data.companyId as string | undefined;
      const departmentId = (client.data.departmentId ?? null) as string | null;
      if (conversationId && companyId) this.emitScoped(companyId, 'contact.typing', { conversationId, typing }, departmentId);
      return;
    }
    const user = client.data.user as JwtUser | undefined;
    if (!user || !data?.conversationId) return;
    // El agente puede tener varias conversaciones en pestañas: a diferencia del visitante,
    // acá sí hace falta el conversationId que manda el cliente, verificado contra su propia
    // empresa antes de reenviarlo (nunca se confía en el company/departmentId del cliente).
    const conversation = await this.prisma.conversation.findFirst({ where: { id: data.conversationId, companyId: user.companyId }, select: { id: true } });
    if (!conversation) return;
    this.server.to(`conversation:${data.conversationId}`).emit('agent:typing', { typing });
  }

  // Sube el status de un lote de mensajes de una conversación (nunca lo baja: ver el filtro
  // `in: from`) y devuelve los ids realmente tocados, para que el caller decida a quién
  // avisar del cambio — distinto según sea el visitante o un agente quien confirma.
  private async bumpMessageStatus(conversationId: string, direction: MessageDirection, from: MessageStatus[], to: MessageStatus): Promise<string[]> {
    const rows = await this.prisma.message.findMany({ where: { conversationId, direction, status: { in: from } }, select: { id: true } });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    await this.prisma.message.updateMany({ where: { id: { in: ids } }, data: { status: to } });
    return ids;
  }

  // El visitante confirma que su navegador recibió en vivo la(s) respuesta(s) del agente
  // (✓✓ gris) — se emite apenas llega "message.created" y también al cargar el historial
  // (ver widget page.tsx), así que es intencionalmente idempotente (el filtro `from` evita
  // volver a tocar lo que ya avanzó).
  @SubscribeMessage('message:delivered')
  async handleMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId?: string }) {
    if (client.data.visitorContactId) {
      const conversationId = client.data.conversationId as string | undefined;
      const companyId = client.data.companyId as string | undefined;
      const departmentId = (client.data.departmentId ?? null) as string | null;
      if (!conversationId || !companyId) return;
      const ids = await this.bumpMessageStatus(conversationId, MessageDirection.OUTBOUND, [MessageStatus.SENT], MessageStatus.DELIVERED);
      if (ids.length) this.emitScoped(companyId, 'message.status', { conversationId, ids, status: 'DELIVERED' }, departmentId, conversationId);
      return;
    }
    // Un agente confirma que el mensaje del visitante "llegó a la bandeja" (✓✓ gris en el
    // widget) — se emite al recibir "message.created" en el panel, sin importar si esa
    // conversación está abierta o no. El "leído" (✓✓ azul) de este lado llega aparte, por
    // ConversationsService.markRead (POST /conversations/:id/read), que es la acción real
    // de abrir/seleccionar la conversación.
    const user = client.data.user as JwtUser | undefined;
    if (!user || !data?.conversationId) return;
    const conversation = await this.prisma.conversation.findFirst({ where: { id: data.conversationId, companyId: user.companyId }, select: { id: true } });
    if (!conversation) return;
    const ids = await this.bumpMessageStatus(data.conversationId, MessageDirection.INBOUND, [MessageStatus.RECEIVED], MessageStatus.DELIVERED);
    if (ids.length) this.server.to(`conversation:${data.conversationId}`).emit('message.status', { conversationId: data.conversationId, ids, status: 'DELIVERED' });
  }

  // Solo el visitante marca lectura por socket (ve la respuesta del agente con el chat
  // abierto) — la lectura del lado del agente ya la cubre la ruta REST de arriba.
  @SubscribeMessage('message:read')
  async handleMessageRead(@ConnectedSocket() client: Socket) {
    if (!client.data.visitorContactId) return;
    const conversationId = client.data.conversationId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    const departmentId = (client.data.departmentId ?? null) as string | null;
    if (!conversationId || !companyId) return;
    const ids = await this.bumpMessageStatus(conversationId, MessageDirection.OUTBOUND, [MessageStatus.SENT, MessageStatus.DELIVERED], MessageStatus.READ);
    if (ids.length) this.emitScoped(companyId, 'message.status', { conversationId, ids, status: 'READ' }, departmentId, conversationId);
  }
}
