import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConversationStatus, InstanceStatus, MessageDirection } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats(@CurrentUser() user: JwtUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [connectedInstances, openConversations, unreadConversations, inboundToday, agents] = await Promise.all([
      this.prisma.whatsAppInstance.count({ where: { companyId: user.companyId, status: InstanceStatus.CONNECTED, active: true } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] } } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, unreadCount: { gt: 0 } } }),
      this.prisma.message.count({ where: { companyId: user.companyId, direction: MessageDirection.INBOUND, createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { companyId: user.companyId, active: true } }),
    ]);
    return { connectedInstances, openConversations, unreadConversations, inboundToday, agents };
  }
}
