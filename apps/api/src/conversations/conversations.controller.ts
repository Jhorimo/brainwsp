import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { ConversationsService } from './conversations.service';
import { AttachTagDto, ForwardMessageDto, SendAgentMessageDto, SendStickerDto, StartConversationDto, UpdateConversationDto, UpdateMessageFlagsDto, UpdateNotesDto, UpdateStageDto } from './conversations.dto';

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

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

  @Post('start')
  start(@CurrentUser() user: JwtUser, @Body() dto: StartConversationDto) {
    return this.service.startConversation(user.companyId, dto.instanceId, dto.phone, dto.text, user.sub);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendAgentMessageDto) {
    return this.service.sendText(user.companyId, id, dto.message, user.sub);
  }

  @Post(':id/messages/sticker')
  sendSticker(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendStickerDto) {
    return this.service.sendSticker(user.companyId, id, dto.stickerId, user.sub);
  }

  @Post(':id/messages/media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES } }))
  sendMedia(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption?: string,
    @Body('ptt') ptt?: string,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.service.sendMedia(user.companyId, id, file, caption, ptt === 'true', user.sub);
  }

  @Patch(':id/messages/:messageId')
  updateMessageFlags(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageFlagsDto,
  ) {
    return this.service.updateMessageFlags(user.companyId, id, messageId, dto);
  }

  @Post(':id/messages/:messageId/forward')
  forwardMessage(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.service.forwardMessage(user.companyId, id, messageId, dto.targetConversationId, user.sub);
  }

  @Patch(':id/notes')
  updateNotes(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateNotesDto) {
    return this.service.updateContactNotes(user.companyId, id, dto.notes);
  }

  @Post(':id/tags')
  addTag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AttachTagDto) {
    return this.service.addContactTag(user.companyId, id, dto.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('tagId') tagId: string) {
    return this.service.removeContactTag(user.companyId, id, tagId);
  }

  @Patch(':id/stage')
  updateStage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.service.updateStage(user.companyId, id, dto.stageId);
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
