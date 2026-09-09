import { Controller, Get, Headers, HttpException, HttpStatus, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ProgressService } from './progress.service';
import { TasksService } from '../tasks/tasks.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('progress')
@UseGuards(SessionGuard)
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * SSE端点 - 客户端连接此端点接收实时进度
   * GET /api/progress/:sessionId
   */
  @Get(':sessionId')
  streamProgress(
    @Param('sessionId') sessionId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @CurrentUser() userId: string,
    @Res() res: Response,
  ) {
    const access = this.tasksService.getTaskStatus(sessionId, userId);
    if (!access.success) {
      throw new HttpException(access.error || '任务不存在或无权访问', HttpStatus.NOT_FOUND);
    }
    return this.progressService.register(sessionId, res, lastEventId);
  }
}
