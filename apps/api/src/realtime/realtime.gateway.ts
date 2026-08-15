import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtUser } from '../common/types/jwt-user';

@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:3000', credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = String(client.handshake.auth?.token || '').replace(/^Bearer\s+/i, '');
    if (!token) return client.disconnect(true);
    try {
      const user = await this.jwt.verifyAsync<JwtUser>(token, { secret: process.env.JWT_SECRET || 'development-only-secret-change-me' });
      client.data.user = user;
      await client.join(`company:${user.companyId}`);
    } catch {
      client.disconnect(true);
    }
  }

  emitToCompany(companyId: string, event: string, payload: unknown) {
    this.server.to(`company:${companyId}`).emit(event, payload);
  }
}
