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
    const [connectedInstances, openConversations, unreadConversations, inboundToday, agents, aiActiveConversations, aiMessagesToday] = await Promise.all([
      this.prisma.whatsAppInstance.count({ where: { companyId: user.companyId, status: InstanceStatus.CONNECTED, active: true } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] } } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, unreadCount: { gt: 0 } } }),
      this.prisma.message.count({ where: { companyId: user.companyId, direction: MessageDirection.INBOUND, createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { companyId: user.companyId, active: true } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, aiEnabled: true } }),
      this.prisma.message.count({ where: { companyId: user.companyId, createdAt: { gte: today }, metadata: { path: ['aiGenerated'], equals: true } } }),
    ]);
    return { connectedInstances, openConversations, unreadConversations, inboundToday, agents, aiActiveConversations, aiMessagesToday };
  }

  @Get('breakdown')
  async breakdown(@CurrentUser() user: JwtUser) {
    const companyId = user.companyId;
    const [users, departments, projects, conversations, tags] = await Promise.all([
      this.prisma.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, email: true, role: true } }),
      this.prisma.department.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.project.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.conversation.findMany({ where: { companyId }, select: { assignedUserId: true, departmentId: true, projectId: true } }),
      this.prisma.tag.findMany({ where: { companyId }, select: { id: true, name: true, color: true, _count: { select: { contacts: true } } } }),
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
      byTag: tags
        .map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, contacts: tag._count.contacts }))
        .filter((tag) => tag.contacts > 0)
        .sort((a, b) => b.contacts - a.contacts),
    };
  }

  // The core operations view: where conversations are piling up in each department's own
  // pipeline. Only counts OPEN/PENDING conversations — a finished pipeline (WON/RESOLVED)
  // sitting in CLOSED doesn't represent active work a manager needs to unblock.
  @Get('pipeline')
  async pipeline(@CurrentUser() user: JwtUser) {
    const companyId = user.companyId;
    const [departments, conversations] = await Promise.all([
      this.prisma.department.findMany({
        where: { companyId, active: true },
        select: { id: true, name: true, stages: { select: { id: true, name: true, color: true }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.conversation.findMany({
        where: { companyId, departmentId: { not: null }, status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] } },
        select: { departmentId: true, stageId: true },
      }),
    ]);

    const countByDeptStage = new Map<string, number>();
    for (const conversation of conversations) {
      const key = `${conversation.departmentId}:${conversation.stageId || 'none'}`;
      countByDeptStage.set(key, (countByDeptStage.get(key) || 0) + 1);
    }

    return departments
      .filter((department) => department.stages.length > 0)
      .map((department) => ({
        id: department.id,
        name: department.name,
        stages: department.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          count: countByDeptStage.get(`${department.id}:${stage.id}`) || 0,
        })),
        noStage: countByDeptStage.get(`${department.id}:none`) || 0,
      }));
  }
}
