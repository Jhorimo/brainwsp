import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { createCorsOriginValidator } from '../common/cors-origin';
import { AgentAccessService } from '../common/services/agent-access.service';
import { hashApiSecret } from '../common/utils/secret';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../common/types/jwt-user';

@WebSocketGateway({
  cors: {
    origin: createCorsOriginValidator(),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly agentAccess: AgentAccessService,
    private readonly prisma: PrismaService,
  ) {}

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
        select: { id: true },
      });
      if (!conversation) return client.disconnect(true);
      client.data.visitorContactId = session.contactId;
      await client.join(`conversation:${conversationId}`);
    } catch {
      client.disconnect(true);
    }
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
}
