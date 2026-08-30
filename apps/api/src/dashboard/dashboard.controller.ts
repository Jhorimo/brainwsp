import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConversationStatus, InstanceStatus, MessageDirection, WhatsAppProvider } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequireModule('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  // `from`/`to` are full ISO instants, not bare calendar dates — the frontend computes
  // them from the viewer's own local midnight (e.g. "hoy" = local midnight through local
  // midnight tomorrow) and sends the resulting UTC instant, so there's no reinterpretation
  // here: a Peru-based manager's "hoy" always means Peru's calendar day, not UTC's. No
  // params at all falls back to a UTC-today window (Swagger/manual testing convenience).
  private resolveRange(from?: string, to?: string) {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const start = from ? new Date(from) : todayUtc;
    const end = to ? new Date(to) : (() => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + 1); return d; })();
    return { start, end };
  }

  @Get('stats')
  async stats(@CurrentUser() user: JwtUser, @Query('from') from?: string, @Query('to') to?: string) {
    const { start, end } = this.resolveRange(from, to);
    const [connectedInstances, openConversations, unreadConversations, inboundInRange, outboundInRange, agents, aiActiveConversations, aiMessagesInRange] = await Promise.all([
      this.prisma.whatsAppInstance.count({ where: { companyId: user.companyId, status: InstanceStatus.CONNECTED, active: true } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] } } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, unreadCount: { gt: 0 } } }),
      this.prisma.message.count({ where: { companyId: user.companyId, direction: MessageDirection.INBOUND, createdAt: { gte: start, lt: end } } }),
      this.prisma.message.count({ where: { companyId: user.companyId, direction: MessageDirection.OUTBOUND, createdAt: { gte: start, lt: end } } }),
      this.prisma.user.count({ where: { companyId: user.companyId, active: true } }),
      this.prisma.conversation.count({ where: { companyId: user.companyId, aiEnabled: true } }),
      this.prisma.message.count({ where: { companyId: user.companyId, createdAt: { gte: start, lt: end }, metadata: { path: ['aiGenerated'], equals: true } } }),
    ]);
    return { connectedInstances, openConversations, unreadConversations, inboundInRange, outboundInRange, agents, aiActiveConversations, aiMessagesInRange };
  }

  // Real per-day inbound/outbound counts for the dashboard's activity chart — every day in
  // the range is present with a 0 rather than only days that had messages, so "últimos 7
  // días" always draws 7 bars.
  @Get('message-volume')
  async messageVolume(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutesRaw?: string,
  ) {
    const { start, end } = this.resolveRange(from, to);
    // JS's own `getTimezoneOffset()` convention (minutes to SUBTRACT from a UTC instant to
    // get local time) — sent by the frontend so a message stored as a UTC instant lands in
    // the calendar-day bucket the viewer actually saw it on, not UTC's. Peru has no DST, so
    // a single fixed offset per request is exact, not just an approximation.
    const tzOffsetMinutes = Number(tzOffsetMinutesRaw) || 0;
    const localDayKey = (date: Date) => new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);

    const messages = await this.prisma.message.findMany({
      where: { companyId: user.companyId, createdAt: { gte: start, lt: end } },
      select: { createdAt: true, direction: true, conversationId: true },
    });

    const days: string[] = [];
    for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(localDayKey(cursor));
    }
    // `interactions` = conversaciones DISTINTAS con al menos un mensaje ese día — a diferencia
    // de inbound+outbound (volumen), no crece solo porque una misma charla tuvo muchos
    // mensajes; mide cuántas charlas separadas hubo, no cuánto se escribió.
    const counts = new Map(days.map((day) => [day, { inbound: 0, outbound: 0, conversationIds: new Set<string>() }]));
    for (const message of messages) {
      const bucket = counts.get(localDayKey(message.createdAt));
      if (!bucket) continue;
      if (message.direction === MessageDirection.INBOUND) bucket.inbound += 1;
      else bucket.outbound += 1;
      bucket.conversationIds.add(message.conversationId);
    }
    return days.map((date) => {
      const bucket = counts.get(date)!;
      return { date, inbound: bucket.inbound, outbound: bucket.outbound, interactions: bucket.conversationIds.size };
    });
  }

  // Per-agent KPI for managerial control: messages a human agent actually sent (not
  // AI/API-key sends, which have no `sentByUserId`) and how many distinct conversations
  // they touched, scoped to the selected range — unlike `breakdown.byUser` below, which is
  // an all-time snapshot of current conversation assignment, not a period metric.
  @Get('agent-performance')
  async agentPerformance(@CurrentUser() user: JwtUser, @Query('from') from?: string, @Query('to') to?: string) {
    const { start, end } = this.resolveRange(from, to);
    const companyId = user.companyId;
    const [users, messages] = await Promise.all([
      this.prisma.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, email: true, role: true } }),
      this.prisma.message.findMany({
        where: { companyId, sentByUserId: { not: null }, createdAt: { gte: start, lt: end } },
        select: { sentByUserId: true, conversationId: true },
      }),
    ]);

    const messagesByUser = new Map<string, number>();
    const conversationsByUser = new Map<string, Set<string>>();
    for (const message of messages) {
      const userId = message.sentByUserId as string;
      messagesByUser.set(userId, (messagesByUser.get(userId) || 0) + 1);
      if (!conversationsByUser.has(userId)) conversationsByUser.set(userId, new Set());
      conversationsByUser.get(userId)!.add(message.conversationId);
    }

    return users
      .map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        messagesSent: messagesByUser.get(item.id) || 0,
        conversationsTouched: conversationsByUser.get(item.id)?.size || 0,
      }))
      .sort((a, b) => b.messagesSent - a.messagesSent);
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

  // Same per-day-with-zeros shape as message-volume, but counting new Contact rows instead
  // of messages — feeds the "Nuevos Contactos" tab of the activity chart.
  @Get('contacts-new')
  async contactsNew(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutesRaw?: string,
  ) {
    const { start, end } = this.resolveRange(from, to);
    const tzOffsetMinutes = Number(tzOffsetMinutesRaw) || 0;
    const localDayKey = (date: Date) => new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);

    const contacts = await this.prisma.contact.findMany({
      where: { companyId: user.companyId, createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    });

    const days: string[] = [];
    for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(localDayKey(cursor));
    }
    const counts = new Map(days.map((day) => [day, 0]));
    for (const contact of contacts) {
      const bucket = localDayKey(contact.createdAt);
      if (counts.has(bucket)) counts.set(bucket, counts.get(bucket)! + 1);
    }
    return days.map((date) => ({ date, count: counts.get(date)! }));
  }

  // Message count bucketed by hour-of-day (0-23), summed across every day in the range —
  // "¿a qué hora escriben más los clientes?" for staffing/AI-schedule decisions. Bucketing is
  // done in JS (not SQL EXTRACT(HOUR ...)) so the same tzOffsetMinutes convention as the other
  // range endpoints applies, instead of bucketing by the DB server's own timezone.
  @Get('hourly-distribution')
  async hourlyDistribution(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutesRaw?: string,
  ) {
    const { start, end } = this.resolveRange(from, to);
    const tzOffsetMinutes = Number(tzOffsetMinutesRaw) || 0;

    const messages = await this.prisma.message.findMany({
      where: { companyId: user.companyId, createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    });

    const counts = new Array(24).fill(0);
    for (const message of messages) {
      const localHour = new Date(message.createdAt.getTime() - tzOffsetMinutes * 60_000).getUTCHours();
      counts[localHour] += 1;
    }
    return counts.map((count, hour) => ({ hour, count }));
  }

  // "¿Cuánto me falta antes de que me corten?" — cuota mensual del plan (mensajes entrantes +
  // salientes contados desde el 1 del mes en curso) y cuándo vence la licencia, para el banner
  // y las barras de uso del dashboard. La cuota "de hoy" se deriva de la mensual (÷30) en vez
  // de guardarse aparte, para no tener dos límites que se puedan desincronizar.
  @Get('plan-usage')
  async planUsage(@CurrentUser() user: JwtUser) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { licenseRenewsAt: true, plan: { select: { name: true, maxMessages: true, maxInstances: true } } },
    });
    const [primaryInstance, activeInstances] = await Promise.all([
      this.prisma.whatsAppInstance.findFirst({
        where: { companyId: user.companyId, active: true },
        select: { provider: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.whatsAppInstance.count({ where: { companyId: user.companyId, active: true } }),
    ]);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
    const [messagesThisMonth, messagesToday] = await Promise.all([
      this.prisma.message.count({ where: { companyId: user.companyId, createdAt: { gte: monthStart } } }),
      this.prisma.message.count({ where: { companyId: user.companyId, createdAt: { gte: todayStart } } }),
    ]);

    const maxMessages = company.plan?.maxMessages ?? null;
    const daysUntilRenewal = company.licenseRenewsAt
      ? Math.ceil((company.licenseRenewsAt.getTime() - now.getTime()) / (24 * 3600 * 1000))
      : null;

    return {
      planName: company.plan?.name ?? null,
      mode: primaryInstance?.provider === WhatsAppProvider.META_CLOUD ? 'API' : 'QR',
      licenseRenewsAt: company.licenseRenewsAt,
      daysUntilRenewal,
      maxMessages,
      messagesThisMonth,
      dailyBudget: maxMessages ? Math.max(1, Math.round(maxMessages / 30)) : null,
      messagesToday,
      activeInstances,
      maxInstances: company.plan?.maxInstances ?? null,
    };
  }
}
