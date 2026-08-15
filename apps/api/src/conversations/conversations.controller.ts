import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { ConversationsService } from './conversations.service';
import { SendAgentMessageDto, UpdateConversationDto } from './conversations.dto';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('status') status?: ConversationStatus) {
    return this.service.list(user.companyId, status);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.messages(user.companyId, id);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendAgentMessageDto) {
    return this.service.sendText(user.companyId, id, dto.message);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Post(':id/take')
  take(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.update(user.companyId, id, { assignedUserId: user.sub, status: ConversationStatus.OPEN });
  }
}
