import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { AgentAccessService } from '../common/services/agent-access.service';
import type { JwtUser } from '../common/types/jwt-user';

@WebSocketGateway({
  cors: {
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',').map((value) => value.trim()).filter(Boolean),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly agentAccess: AgentAccessService,
  ) {}

  async handleConnection(client: Socket) {
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

  emitToCompany(companyId: string, event: string, payload: unknown) {
    this.server.to(`company:${companyId}`).emit(event, payload);
  }

  // departmentId undefined = not conversation-scoped, goes to everyone via the general
  // room. Otherwise it's routed to whichever agents are actually allowed to see it.
  emitScoped(companyId: string, event: string, payload: unknown, departmentId?: string | null) {
    if (departmentId === undefined) {
      this.emitToCompany(companyId, event, payload);
      return;
    }
    this.server.to(`company:${companyId}:all`).emit(event, payload);
    this.server.to(departmentId === null ? `company:${companyId}:unassigned` : `company:${companyId}:dept:${departmentId}`).emit(event, payload);
  }
}
