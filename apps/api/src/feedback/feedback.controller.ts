import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

// NOTE: not gated by ModuleAccessGuard/'feedback' — the floating feedback widget
// (POST /feedback) is rendered globally from AppShell on every page, regardless of
// whether the agent has the "Sugerencias" nav item enabled. That module permission is
// enforced as nav visibility only (see AppShell).
@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateFeedbackDto) {
    return this.service.create(user.companyId, user.sub, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateStatus(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return this.service.updateStatus(user.companyId, id, dto.status);
  }
}
