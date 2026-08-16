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

  @Get('breakdown')
  async breakdown(@CurrentUser() user: JwtUser) {
    const companyId = user.companyId;
    const [users, departments, projects, conversations] = await Promise.all([
      this.prisma.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, email: true, role: true } }),
      this.prisma.department.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.project.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.conversation.findMany({ where: { companyId }, select: { assignedUserId: true, departmentId: true, projectId: true } }),
    ]);

    const countBy = (key: 'assignedUserId' | 'departmentId' | 'projectId') => {
      const counts = new Map<string, number>();
      for (const conversation of conversations) {
        const id = conversation[key];
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
      }
      return counts;
    };

    const byAssignee = countBy('assignedUserId');
    const byDepartment = countBy('departmentId');
    const byProject = countBy('projectId');

    return {
      byUser: users
        .map((item) => ({ ...item, conversations: byAssignee.get(item.id) || 0 }))
        .sort((a, b) => b.conversations - a.conversations),
      byDepartment: departments
        .map((item) => ({ ...item, conversations: byDepartment.get(item.id) || 0 }))
        .sort((a, b) => b.conversations - a.conversations),
      byProject: projects
        .map((item) => ({ ...item, conversations: byProject.get(item.id) || 0 }))
        .sort((a, b) => b.conversations - a.conversations),
      unassigned: conversations.filter((item) => !item.assignedUserId).length,
    };
  }
}
