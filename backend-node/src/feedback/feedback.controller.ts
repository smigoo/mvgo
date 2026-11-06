// 2026-11-06 源文件丢失后由 dist 编译产物（dist/feedback/feedback.controller.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import type { Response } from 'express'
import { SessionGuard } from '../auth/session.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { AdminService } from '../admin/admin.service'
import { FeedbackService, FEEDBACK_MAX_FILE_BYTES } from './feedback.service'
import type { FeedbackStatus } from './feedback.schema'

@Controller('tasks')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':sessionId/feedback')
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FEEDBACK_MAX_FILE_BYTES }, }))
  async submitFeedback(
    @Param('sessionId') sessionId: string,
    @Body() body: Record<string, any>,
    @UploadedFile() file: any,
    @CurrentUser() userId: string,
    @Req() req: any,
  ) {
    const result = await this.feedbackService.create({
      sessionId,
      userId,
      username: req?.session?.username,
      category: body?.category,
      description: body?.description,
      includes: body?.includes,
      logsText: body?.logsText,
      pageUrl: body?.pageUrl,
      userAgent: req?.headers?.['user-agent'],
      file,
    })
    return result
  }
}

@Controller('admin/feedbacks')
@UseGuards(SessionGuard)
export class FeedbackAdminController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly adminService: AdminService,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('sessionId') sessionId?: string,
    @Query('keyword') keyword?: string,
  ) {
    await this.adminService.assertAdmin(userId)
    const data = await this.feedbackService.list({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status,
      category,
      sessionId,
      keyword,
    })
    return { success: true, ...data }
  }

  @Get(':id')
  async detail(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.adminService.assertAdmin(userId)
    const feedback = await this.feedbackService.detail(id)
    return { success: true, feedback }
  }

  @Post(':id/status')
  async updateStatus(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { status?: FeedbackStatus; adminNote?: string },
    @Req() req: any,
  ) {
    await this.adminService.assertAdmin(userId)
    if (!body?.status) {
      return { success: false, message: '缺少 status' }
    }
    const feedback = await this.feedbackService.updateStatus(id, {
      status: body.status,
      adminNote: body.adminNote,
      adminId: userId,
      adminName: req?.session?.username,
    })
    return { success: true, feedback }
  }

  @Post(':id/delete')
  async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.adminService.assertAdmin(userId)
    return this.feedbackService.remove(id)
  }

  @Get(':id/attachment')
  async download(@CurrentUser() userId: string, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    await this.adminService.assertAdmin(userId)
    const { absPath, filename, mimeType } = await this.feedbackService.resolveAttachment(id)
    const encoded = encodeURIComponent(filename)
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="feedback-attachment"; filename*=UTF-8''${encoded}`,
    })
    return new StreamableFile(createReadStream(absPath))
  }
}
