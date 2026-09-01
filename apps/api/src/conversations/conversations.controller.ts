import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { ConversationsService } from './conversations.service';
import { AttachTagDto, ForwardMessageDto, SendAgentMessageDto, SendContactDto, SendReactionDto, SendStickerDto, StartConversationDto, UpdateContactNameDto, UpdateConversationDto, UpdateMessageFlagsDto, UpdateNotesDto, UpdateStageDto } from './conversations.dto';

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequireModule('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('status') status?: ConversationStatus) {
    return this.service.list(user, status);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.messages(user, id);
  }

  @Post('start')
  start(@CurrentUser() user: JwtUser, @Body() dto: StartConversationDto) {
    return this.service.startConversation(user.companyId, dto.instanceId, dto.phone, dto.text, user.sub, dto.name);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendAgentMessageDto) {
    return this.service.sendText(user, id, dto.message, user.sub, dto.quotedMessageId);
  }

  @Post(':id/messages/sticker')
  sendSticker(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendStickerDto) {
    return this.service.sendSticker(user, id, dto.stickerId, user.sub);
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
    @Body('quotedMessageId') quotedMessageId?: string,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.service.sendMedia(user, id, file, caption, ptt === 'true', user.sub, quotedMessageId);
  }

  @Post(':id/messages/contact')
  sendContact(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendContactDto) {
    return this.service.sendContact(user, id, dto.contactId, user.sub);
  }

  @Post(':id/messages/:messageId/reaction')
  sendReaction(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() dto: SendReactionDto) {
    return this.service.sendReaction(user, id, messageId, dto.emoji);
  }

  @Patch(':id/messages/:messageId')
  updateMessageFlags(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageFlagsDto,
  ) {
    return this.service.updateMessageFlags(user, id, messageId, dto);
  }

  @Delete(':id/messages/:messageId')
  deleteMessage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    return this.service.deleteMessage(user, id, messageId);
  }

  @Post(':id/messages/:messageId/forward')
  forwardMessage(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.service.forwardMessage(user, id, messageId, dto.targetConversationId, user.sub);
  }

  @Patch(':id/notes')
  updateNotes(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateNotesDto) {
    return this.service.updateContactNotes(user, id, dto.notes);
  }

  @Patch(':id/contact-name')
  updateContactName(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateContactNameDto) {
    return this.service.updateContactName(user, id, dto.name);
  }

  @Post(':id/tags')
  addTag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AttachTagDto) {
    return this.service.addContactTag(user, id, dto.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('tagId') tagId: string) {
    return this.service.removeContactTag(user, id, tagId);
  }

  @Patch(':id/stage')
  updateStage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.service.updateStage(user, id, dto.stageId);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/take')
  take(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.update(user, id, { assignedUserId: user.sub, status: ConversationStatus.OPEN });
  }
}
