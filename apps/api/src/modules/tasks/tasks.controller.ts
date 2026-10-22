import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import type { SessionUser } from '@task/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { AttachmentsService, MAX_ATTACHMENT_BYTES, type UploadedFile as Uploaded } from './attachments.service';
import { AssignDto, ChangeStateDto, CreateCommentDto, CreateTaskDto, ListTasksDto, SizePresetsQueryDto, UpdateTaskDto, UpsertSizePresetsDto } from './dto/task.dto';
import { TasksService } from './tasks.service';

/** Content-Disposition آمن لأسماء عربية: اسم ASCII بديل + filename* بترميز UTF-8 (RFC 5987) */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService, private readonly attachments: AttachmentsService) {}

  // ── أحجام المهام → ساعات (قبل :id حتى لا يلتقطها مسار المعرّف) ──
  @Get('size-presets') @Require('tasks.read')
  @ApiOperation({ summary: 'الساعات الفعلية لكل حجم (ضبط الإدارة أو الافتراضي العام)' })
  sizePresets(@CurrentUser() actor: SessionUser, @Query() q: SizePresetsQueryDto) {
    return this.tasks.effectivePresets(q.administrationId ?? actor.administrationId ?? null);
  }

  @Put('size-presets') @Require('tasks.update') @Audit({ action: 'tasks.sizePresets.update', entity: 'SizePresetConfig' })
  upsertSizePresets(@CurrentUser() actor: SessionUser, @Body() dto: UpsertSizePresetsDto) {
    return this.tasks.upsertPresets(actor, dto);
  }

  @Get('stats') @Require('tasks.read')
  stats(@CurrentUser() actor: SessionUser) {
    return this.tasks.stats(actor);
  }

  // ── المهام ──
  @Get() @Require('tasks.read')
  @ApiOperation({ summary: 'المهام ضمن نطاق الرؤية (الموظف: المسند إليه فقط)' })
  list(@CurrentUser() actor: SessionUser, @Query() q: ListTasksDto) {
    return this.tasks.list(actor, q);
  }

  @Get(':id') @Require('tasks.read')
  get(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(actor, id);
  }

  @Post() @Require('tasks.create') @Audit({ action: 'tasks.create', entity: 'Task' })
  create(@CurrentUser() actor: SessionUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(actor, dto);
  }

  @Patch(':id') @Require('tasks.update') @Audit({ action: 'tasks.update', entity: 'Task' })
  update(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(actor, id, dto);
  }

  @Post(':id/state') @Require('tasks.update') @Audit({ action: 'tasks.state', entity: 'Task' })
  changeState(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStateDto) {
    return this.tasks.changeState(actor, id, dto);
  }

  @Delete(':id') @Require('tasks.update') @Audit({ action: 'tasks.delete', entity: 'Task' })
  async remove(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.tasks.remove(actor, id);
    await this.attachments.removeFiles(r.removedFiles);
    return { ok: true };
  }

  // ── الإسناد ──
  @Post(':id/assignments') @Require('tasks.assign') @Audit({ action: 'tasks.assign', entity: 'Task' })
  assign(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.tasks.addAssignments(actor, id, dto.assignments);
  }

  @Delete(':id/assignments/:assignmentId') @Require('tasks.assign') @Audit({ action: 'tasks.unassign', entity: 'Task' })
  unassign(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.tasks.removeAssignment(actor, id, assignmentId);
  }

  // ── التعليقات ──
  @Post(':id/comments') @Require('tasks.comment') @Audit({ action: 'tasks.comment.create', entity: 'Task' })
  comment(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCommentDto) {
    return this.tasks.addComment(actor, id, dto.content);
  }

  @Delete(':id/comments/:commentId') @Require('tasks.comment') @Audit({ action: 'tasks.comment.delete', entity: 'Task' })
  deleteComment(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.tasks.deleteComment(actor, id, commentId);
  }

  // ── المرفقات ──
  @Post(':id/attachments') @Require('tasks.attach') @Audit({ action: 'tasks.attachment.create', entity: 'Task' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  upload(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Uploaded) {
    return this.attachments.upload(actor, id, file);
  }

  @Get(':id/attachments/:attachmentId/download') @Require('tasks.read')
  async download(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.attachments.resolveForDownload(actor, id, attachmentId);
    res.set({
      'Content-Type': f.mimeType,
      'Content-Length': String(f.size),
      'Content-Disposition': contentDisposition(f.fileName),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(f.path));
  }

  @Delete(':id/attachments/:attachmentId') @Require('tasks.attach') @Audit({ action: 'tasks.attachment.delete', entity: 'Task' })
  deleteAttachment(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    return this.attachments.remove(actor, id, attachmentId);
  }
}
