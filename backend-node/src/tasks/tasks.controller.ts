import { Controller, Get, Post, Param, Body, Query, Session, UseGuards, Res, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { TasksService } from './tasks.service';
import { TaskCodeSnapshotService } from './task-code-snapshot.service';
import { SnapshotQualityService } from './snapshot-quality.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser, OptionalUser } from '../auth/current-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly queueService: TaskQueueService,
    private readonly taskCodeSnapshotService: TaskCodeSnapshotService,
    private readonly snapshotQualityService: SnapshotQualityService,
  ) {}

  /**
   * GET /api/tasks
   * 获取当前用户的任务列表（admin 可查看全部）
   * - ?limit=N：只返回最近 N 条（默认全量）
   * - ?full=1：返回全量字段（默认 slim：progress 截最近 20 条 + 剔除
   *   result.figmaNodeData/figmaStyleTree/code 等重负载字段，响应 5.6MB → KB 级）
   */
  @Get()
  @UseGuards(SessionGuard)
  getAllTasks(
    @CurrentUser() userId: string,
    @Query('limit') limit?: string,
    @Query('full') full?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const tasks = this.tasksService.getAllTasks(userId, {
      limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      slim: full !== '1',
    });
    return {
      success: true,
      tasks,
      count: tasks.length,
    };
  }

  /**
   * GET /api/tasks/summary
   * 获取当前用户的任务统计摘要
   */
  @Get('summary')
  @UseGuards(SessionGuard)
  getTaskSummary(@CurrentUser() userId: string) {
    const summary = this.tasksService.getTaskSummary(userId);
    return {
      success: true,
      summary,
    };
  }

  /**
   * GET /api/tasks/recent?limit=3
   * 获取当前用户最近的任务
   */
  @Get('recent')
  @UseGuards(SessionGuard)
  getRecentTasks(
    @Query('limit') limit: string | undefined,
    @CurrentUser() userId: string,
  ) {
    const parsedLimit = Number.parseInt(limit || '', 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 20)
      : 3;
    // limit 前置截断：产物就绪检查在 map 内做同步 fs，recent 只查最近 N 个任务
    // （2026-09-02：原 getAllTasks 全量 71 任务 fs 后再 slice → 6s）
    const tasks = this.tasksService.getAllTasks(userId, { limit: safeLimit });
    return {
      success: true,
      tasks,
      count: tasks.length,
    };
  }

  /**
   * GET /api/tasks/status/:sessionId
   * 获取指定任务的状态
   */
  @Get('status/:sessionId')
  @UseGuards(SessionGuard)
  getTaskStatus(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return this.tasksService.getTaskStatus(sessionId, userId);
  }

  /**
   * 🛡️ P0-2（2026-09-09）：when preview resolver has componentId but not sessionId,
   * frontend calls this endpoint to resolve the real sessionId before calling
   * /code-snapshots/latest — avoids RUNTIME-007 404.
   *
   * GET /api/tasks/resolve-session?componentId=c-device-monitor-xxx
   * → { success: true, sessionId: "mc-max-1788917080373-xxx" }
   * → { success: false, sessionId: null }
   * 
   * 🆓 2026-09-14：预览页独立打开时无 token，此接口免认证
   */
  @Get('resolve-session')
  resolveSessionByComponentId(@Query('componentId') componentId: string) {
    if (!componentId) {
      throw new HttpException('Missing componentId query param', HttpStatus.BAD_REQUEST);
    }
    const task = this.tasksService.getTaskByComponentId(componentId);
    if (!task?.sessionId) {
      return { success: false, sessionId: null, error: `No task found for componentId ${componentId}` };
    }
    return { success: true, sessionId: task.sessionId };
  }

  /**
   * 🛡️ M1-1 兼容（2026-09-03）：任务 componentId 归一后（c-<englishId>）≠ sessionId，
   * 预览加载器按 componentId 请求快照端点 → 按 sessionId 查不到任务 → 404（RUNTIME-007 实锤：
   * /api/tasks/c-env-monitor/code-snapshots/latest 404）。先按入参直查，失败则按 componentId
   * 反查任务取真实 sessionId（getTaskByComponentId 取 startTime 最新）。
   */
  private resolveSnapshotSessionId(id: string, userId?: string): string {
    if (this.tasksService.getTaskStatus(id, userId).success) return id;
    const byComponent = this.tasksService.getTaskByComponentId(id);
    return byComponent?.sessionId || id;
  }

  /**
   * GET /api/tasks/:sessionId/code-snapshots/latest
   * 获取生成中的最新候选及 last-good 版本摘要。
   * 
   * 🆓 2026-09-14：预览页独立打开时无 token，此接口免认证
   */
  @Get(':sessionId/code-snapshots/latest')
  getLatestCodeSnapshot(
    @Param('sessionId') rawId: string,
    @OptionalUser() userId: string | undefined,
  ) {
    const sessionId = this.resolveSnapshotSessionId(rawId, userId);
    const access = this.tasksService.getTaskStatus(sessionId, userId);
    if (!access.success) {
      throw new HttpException(access.error || '任务不存在或无权访问', HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      candidate: this.taskCodeSnapshotService.getCandidateManifest(sessionId),
      lastGood: this.taskCodeSnapshotService.getLastGoodManifest(sessionId),
      // 🛡️ 半成品抢救：失败任务也暴露 partial 快照，供前端预览与 PG 手动补全（而非 404 无产物）。
      partial: this.taskCodeSnapshotService.getPartialManifest(sessionId),
    };
  }

  /**
   * GET /api/tasks/:sessionId/code-snapshots/:revision/manifest
   * 获取指定不可变 revision 的文件清单。
   * 
   * 🆓 2026-09-14：预览页独立打开时无 token，此接口免认证
   */
  @Get(':sessionId/code-snapshots/:revision/manifest')
  getCodeSnapshotManifest(
    @Param('sessionId') rawId: string,
    @Param('revision') revision: string,
    @OptionalUser() userId: string | undefined,
  ) {
    const sessionId = this.resolveSnapshotSessionId(rawId, userId);
    this.assertSnapshotAccessible(sessionId, userId, revision);
    return {
      success: true,
      manifest: this.taskCodeSnapshotService.getManifest(sessionId, revision),
    };
  }

  /**
   * GET /api/tasks/:sessionId/code-snapshots/:revision/file?path=package/index.vue
   * 按 revision 读取文件，避免从多个 workspace 根混读不同版本。
   * 
   * 🆓 2026-09-14：预览页独立打开时无 token，此接口免认证
   */
  @Get(':sessionId/code-snapshots/:revision/file')
  getCodeSnapshotFile(
    @Param('sessionId') rawId: string,
    @Param('revision') revision: string,
    @Query('path') path: string,
    @Query('preview') preview: string,
    @Query('exists') exists: string,
    @OptionalUser() userId: string | undefined,
    @Res() res: Response,
  ) {
    const sessionId = this.resolveSnapshotSessionId(rawId, userId);
    if (!path) throw new HttpException('缺少文件路径', HttpStatus.BAD_REQUEST);
    const isPreview = preview === '1';

    // 🛡️ 探测模式（?exists=1）：只回答「文件是否存在」，且**永不返回 404**。
    // 前端 loadVue3Runtime.injectGlobalIndexCssIfExists 用本协议探测 resources/styles/index.css；
    // 该样式是 Max 管线的确定性编译产物，Lite 及其他管线组件目录下本就没有（SFC 内嵌 scoped 样式
    // 即可渲染）。此前后端不识别 exists，探测请求退化成真实文件读取 → 缺失该文件的组件每次预览
    // 都产生一次 404，既污染控制台，也会被运行时截图门禁记为 RUNTIME-007「HTTP 资源加载错误」
    // 进而误判 BLOCK（2026-09-03 前端注释已明确要求后端配合）。
    if (exists === '1') {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        this.assertSnapshotAccessible(sessionId, userId, revision);
        const probe = isPreview
          ? this.taskCodeSnapshotService.readPreviewFile(sessionId, revision, path)
          : this.taskCodeSnapshotService.readFile(sessionId, revision, path);
        return res.json({ exists: !!probe && probe.length > 0 });
      } catch {
        return res.json({ exists: false });
      }
    }

    this.assertSnapshotAccessible(sessionId, userId, revision);
    // 🛡️ 快照内不存在该文件（如 _figma-size.json 仅在 workspace、不在代码快照）时，
    // 返回干净的 404 而非 Unhandled 500，让前端 safeJson 捕获后走 declare.json 兜底。
    let content: Buffer;
    try {
      content = isPreview
        ? this.taskCodeSnapshotService.readPreviewFile(sessionId, revision, path)
        : this.taskCodeSnapshotService.readFile(sessionId, revision, path);
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (/快照文件不存在|代码快照不存在|文件不存在/.test(msg)) {
        throw new HttpException('快照文件不存在', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
    const extension = path.toLowerCase().split('.').pop();
    const contentTypes: Record<string, string> = {
      css: 'text/css; charset=utf-8',
      html: 'text/html; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
    };
    res.setHeader('Content-Type', contentTypes[extension || ''] || 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(content);
  }

  /**
   * POST /api/tasks/:sessionId/code-snapshots/:revision/edit
   * 将单文件修改写回为新的 candidate revision。仅任务本人可操作。
   */
  @Post(':sessionId/code-snapshots/:revision/edit')
  editCodeSnapshotFile(
    @Param('sessionId') sessionId: string,
    @Param('revision') revision: string,
    @Body() body: { path?: string; content?: string; source?: string },
    @CurrentUser() userId: string,
  ) {
    const task = this.tasksService.getTask(sessionId);
    if (!task) {
      throw new HttpException('任务不存在或已重启丢失，无法写回快照', HttpStatus.NOT_FOUND);
    }
    if (task.userId && task.userId !== userId) {
      throw new HttpException('无权编辑此任务快照', HttpStatus.FORBIDDEN);
    }
    if (!body?.path || typeof body.content !== 'string') {
      throw new HttpException('缺少文件路径或文件内容', HttpStatus.BAD_REQUEST);
    }
    try {
      const manifest = this.taskCodeSnapshotService.createEditedCandidate(
        sessionId,
        revision,
        body.path,
        body.content,
        body.source || 'playground',
      );
      return { success: true, manifest };
    } catch (error: any) {
      const message = String(error?.message || '快照写回失败');
      const status = /不可编辑|只能编辑|快照文件不存在|代码快照不存在|路径非法|路径越界/.test(message)
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(message, status);
    }
  }

  /**
   * POST /api/tasks/:sessionId/code-snapshots/:revision/validate
   *
   * 对指定 revision 重跑质量门禁（LESS 真实编译 + SFC 语义 + 结构完整性），
   * 返回**结构化逐文件诊断**（file / line / column / message / snippet / hint）。
   *
   * 背景：用户在任务详情页只看到「N 个文件存在问题」，而明细是从日志里用文件名做
   * 字符串包含匹配拼出来的，既无行列也无错误码，无法定位。这里把生成管线的同源门禁
   * 抽成可重复调用的幂等接口，支撑「手改 → 保存 → 重新校验 → 刷新预览」闭环。
   *
   * 校验结论同时写入：
   *  - 该 revision 的 manifest.validation（驱动文件树状态点）
   *  - task.result.codeValidationResult / lessCompileGate（驱动详情页错误面板）
   */
  @Post(':sessionId/code-snapshots/:revision/validate')
  async validateCodeSnapshot(
    @Param('sessionId') sessionId: string,
    @Param('revision') revision: string,
    @CurrentUser() userId: string,
  ) {
    const task = this.tasksService.getTask(sessionId);
    if (task && task.userId && task.userId !== userId) {
      throw new HttpException('无权校验此任务快照', HttpStatus.FORBIDDEN);
    }
    // 任务可能已不在内存（重启丢失）但磁盘快照仍在：此时不做归属校验，
    // 与 assertSnapshotAccessible 的降级策略保持一致，仅要求 manifest 真实存在。
    if (!task && !this.taskCodeSnapshotService.hasManifest(sessionId, revision)) {
      throw new HttpException('任务或代码快照不存在', HttpStatus.NOT_FOUND);
    }
    try {
      return await this.snapshotQualityService.validateRevision(sessionId, revision);
    } catch (error: any) {
      const message = String(error?.message || '快照质量校验失败');
      const status = /不存在|格式非法|不匹配/.test(message)
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(message, status);
    }
  }

  /**
   * 快照可读性网关（统一供 manifest / file 两个快照接口使用）。
   *
   * 背景：Lite 组件（截图生成）等场景下，组件可能从未向内存任务表（this.tasks）
   * 注册 Task，重启后内存记录亦丢失；但磁盘快照（manifest + 文件）已落盘且
   * 通过 last-good 状态与完整性校验。原实现一律以 getTaskStatus 的「任务不存在」
   * 直接 404，导致磁盘快照完好却无法预览。
   *
   * 策略：
   *  - 任务存在：正常放行（含原 userId 隔离校验）。
   *  - 任务不存在但非「无权访问」：若磁盘 manifest 真实存在则降级放行，
   *    后续 readPreviewFile/readFile 仍做 manifest 状态与完整性校验。
   *  - 「无权访问此任务」：硬性拒绝（403），不允许越权读取他人快照。
   *
   * 注：本接口位于已登录会话之后，且 sessionId 为随机能力 URL，磁盘降级不构成越权暴露。
   */
  private assertSnapshotAccessible(sessionId: string, userId: string | undefined, revision: string): void {
    const access = this.tasksService.getTaskStatus(sessionId, userId);
    if (access.success) return;
    if (access.error === '无权访问此任务') {
      throw new HttpException(access.error, HttpStatus.FORBIDDEN);
    }
    if (!this.taskCodeSnapshotService.hasManifest(sessionId, revision)) {
      throw new HttpException(access.error || '任务不存在或无权访问', HttpStatus.NOT_FOUND);
    }
  }

  /**
   * GET /api/tasks/tree/:sessionId
   * 获取任务树（父任务 + 子任务列表）
   */
  @Get('tree/:sessionId')
  getTaskTree(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    const tree = this.tasksService.getTaskTree(sessionId, userId);
    if (!tree) {
      return { success: false, error: '任务不存在' };
    }
    return { success: true, tree };
  }

  /**
   * GET /api/tasks/queue
   * 获取当前等待队列快照
   */
  @Get('queue')
  getQueueSnapshot(@CurrentUser() userId: string) {
    return {
      success: true,
      queue: this.queueService.getQueueSnapshot(),
      stats: this.queueService.getQueueStats(),
      userId,
    };
  }

  /**
   * GET /api/tasks/queue/stats
   * 获取当前等待队列统计信息
   */
  @Get('queue/stats')
  getQueueStats() {
    return {
      success: true,
      stats: this.queueService.getQueueStats(),
    };
  }

  /**
   * GET /api/tasks/queue/status/:sessionId
   * 获取单个任务的队列状态
   */
  @Get('queue/status/:sessionId')
  getTaskQueueStatus(@Param('sessionId') sessionId: string) {
    return {
      success: true,
      sessionId,
      status: this.queueService.getQueueStatus(sessionId),
    };
  }

  /**
   * POST /api/tasks/queue/cancel/:sessionId
   * 取消排队中的任务
   */
  @Post('queue/cancel/:sessionId')
  async cancelQueuedTask(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: string,
  ) {
    const result = this.queueService.cancelQueuedTask(sessionId, userId);
    if (result.success) {
      // 同步更新磁盘任务记录，避免「内存已取消、界面仍显示排队」的状态脱节
      this.tasksService.updateTask(sessionId, { status: 'cancelled' });
      this.queueService.unregisterExecuteFn(sessionId);
    }
    return result;
  }

  /**
   * POST /api/tasks/queue/start/:sessionId
   * 手动启动排队中的任务
   */
  @Post('queue/start/:sessionId')
  async startQueuedTask(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: string,
  ) {
    return await this.queueService.startQueuedTask(sessionId, userId);
  }

  /**
   * POST /api/tasks/queue/dispatch
   * 手动触发一次全局队列调度：重新尝试启动所有「排队中」任务。
   * 用于解除「运行数为 0 但任务仍卡在 queued」的不一致状态（如入队时未注册 executeFn）。
   */
  @Post('queue/dispatch')
  async dispatchQueue(@CurrentUser() userId: string) {
    const result = await this.queueService.scheduleNextWaiting();
    return {
      success: true,
      dispatched: result?.dispatched ?? 0,
      remaining: result?.remaining ?? 0,
      operator: userId,
    };
  }

  /**
   * POST /api/tasks/batch-delete
   * 批量删除指定任务（级联删除组件产出物）
   */
  @Post('batch-delete')
  async removeTasksBatch(
    @Body('sessionIds') sessionIds: string[],
    @CurrentUser() userId: string,
  ) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return {
        success: false,
        error: '请选择要删除的任务',
      };
    }

    const result = await this.tasksService.removeTasksBatch(sessionIds, userId);
    return {
      success: result.failed.length === 0,
      message: result.failed.length === 0
        ? `已删除 ${result.removed.length} 个任务和关联组件`
        : `已删除 ${result.removed.length} 个任务，${result.failed.length} 个任务删除失败`,
      ...result,
    };
  }

  /**
   * POST /api/tasks/:sessionId/delete
   * 删除指定任务
   */
  @Post(':sessionId/delete')
  async removeTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    const deleted = await this.tasksService.removeTask(sessionId, userId);

    if (!deleted) {
      return {
        success: false,
        error: '任务不存在或无权操作',
      };
    }

    return {
      success: true,
      message: '任务和关联组件已删除',
    };
  }

  @Post('cleanup-orphans')
  async cleanupOrphans(@CurrentUser() userId: string) {
    const result = await this.tasksService.cleanupOrphans(userId);
    return {
      success: true,
      message: `已清理孤儿组件 ${result.orphanComponents} 个、孤儿任务 ${result.orphanTasks} 个`,
      ...result,
    };
  }

  /**
   * POST /api/task/cancel/:sessionId
   * 终止正在运行的任务
   */
  @Post('cancel/:sessionId')
  async cancelTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return await this.tasksService.cancelTask(sessionId, userId);
  }

  /**
   * POST /api/task/pause/:sessionId
   * 暂停正在运行的任务
   */
  @Post('pause/:sessionId')
  async pauseTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return await this.tasksService.pauseTask(sessionId, userId);
  }

  /**
   * POST /api/task/resume/:sessionId
   * 恢复暂停的任务
   */
  @Post('resume/:sessionId')
  resumeTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return this.tasksService.resumeTask(sessionId, userId);
  }

  /**
   * POST /api/tasks/delete
   * 批量清理当前用户的过期任务（completed/failed）
   */
  @Post('delete')
  removeExpiredTasks(@CurrentUser() userId: string) {
    const { removed, remaining } = this.tasksService.removeExpiredTasks(userId);

    return {
      success: true,
      message: `已废弃 ${removed} 个过期任务，剩余 ${remaining} 个任务`,
      removed,
      remaining,
    };
  }

  /**
   * 🆕 GET /api/tasks/retry-meta/:sessionId
   * 获取失败任务的可重试元数据（供前端「重新配置并重试」弹窗使用）
   */
  @Get('retry-meta/:sessionId')
  getRetryMetadata(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    const meta = this.tasksService.getRetryMetadata(sessionId, userId);
    if (!meta) {
      return { success: false, error: '任务不存在或无权访问' };
    }
    if ('error' in meta) {
      return { success: false, error: meta.error };
    }
    return { success: true, meta };
  }

  /**
   * 🆕 POST /api/tasks/retry/:sessionId
   * 重新配置后重试失败任务
   * Body: { config?: { model?, endpoint?, apiKey? } }
   */
  @Post('retry/:sessionId')
  async retryTask(
    @Param('sessionId') sessionId: string,
    @Body() body: { config?: { model?: string; endpoint?: string; apiKey?: string } },
    @CurrentUser() userId: string,
  ) {
    // 🆕 S1：真正执行续跑——命中 checkpoint 则复用缓存（换模型只重跑失败阶段），
    // 未命中则返回元数据由前端全量重新生成。
    return this.tasksService.retryWithResume(sessionId, userId, body.config);
  }

  /**
   * GET /api/tasks/:sessionId/code-download
   * 下载失败/取消任务已生成的代码，便于离线检查，不修改任务状态。
   */
  @Get(':sessionId/code-download')
  async downloadTaskCode(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: string,
    @Res() res: Response,
  ) {
    try {
      const { buffer, filename } = await this.tasksService.packageTaskCode(sessionId, userId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(message, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * 🔄 POST /api/tasks/:sessionId/recover
   * 尝试恢复被服务重启中断的任务（从 temp-components 中间产物补完 workspace 同步）
   */
  @Post(':sessionId/recover')
  async recoverTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return this.tasksService.recoverTask(sessionId, userId);
  }

  /**
   * 📤 POST /api/tasks/:sessionId/publish-to-workspace
   * 手动将失败/取消任务的现有代码发布到 workspace（供 Playground 预览），不改变任务状态
   */
  @Post(':sessionId/publish-to-workspace')
  async publishToWorkspace(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return this.tasksService.publishToWorkspace(sessionId, userId);
  }

  /**
   * ⚡ POST /api/tasks/:sessionId/speed-pass
   * 运行中极速通过：跳过剩余阶段，直接标记任务完成（用户主动放行）
   * 仅在「代码生成」阶段完成后由前端「跳过剩余阶段」按钮触发
   */
  @Post(':sessionId/speed-pass')
  async speedPassTask(@Param('sessionId') sessionId: string, @CurrentUser() userId: string) {
    return this.tasksService.speedPassTask(sessionId, userId);
  }

  /**
   * 🔒 POST /api/tasks/:sessionId/lock
   * 用户对中途效果满意，点「满意，锁定此版本」：把当前候选快照固化到 workspace，
   * 标记会话锁（engineer 后续覆写被跳过），并终止任务（abort + sendComplete）。
   * Body: { revision?: string } 前端当前预览的 revision（仅记录，发布取 latest candidate 快照）
   */
  @Post(':sessionId/lock')
  async lockTask(
    @Param('sessionId') sessionId: string,
    @Body() body: { revision?: string },
    @CurrentUser() userId: string,
  ) {
    return this.tasksService.lockTask(sessionId, userId, body?.revision);
  }

  /**
   * ✅ POST /api/tasks/:sessionId/human-review
   * 任务创建者人工把失败的任务（Vue3/微码）判定为通过
   * Body: { overrideStatus: 'passed' | 'warned', reviewerName?: string, comment?: string }
   */
  @Post(':sessionId/human-review')
  submitHumanReview(
    @Param('sessionId') sessionId: string,
    @Body() body: { overrideStatus?: 'passed' | 'warned'; reviewerName?: string; comment?: string },
    @CurrentUser() userId: string,
  ) {
    const overrideStatus = body.overrideStatus || 'passed';
    if (overrideStatus !== 'passed' && overrideStatus !== 'warned') {
      return { success: false, message: `overrideStatus 非法：${overrideStatus}` };
    }
    return this.tasksService.submitHumanReview({
      sessionId,
      userId,
      overrideStatus,
      reviewerName: body.reviewerName,
      comment: body.comment,
    });
  }

  /**
   * ↩️ POST /api/tasks/:sessionId/human-review/delete
   * 撤回人工审核（还原 failed 状态）
   */
  @Post(':sessionId/human-review/delete')
  revokeHumanReview(
    @Param('sessionId') sessionId: string,
    @Body() body: { reviewerName?: string },
    @CurrentUser() userId: string,
  ) {
    return this.tasksService.revokeHumanReview({ sessionId, userId, reviewerName: body?.reviewerName });
  }

  /**
   * 📋 GET /api/tasks/reviewable
   * 列出当前用户可审核的失败任务（Vue3 + 微码）
   */
  @Get('reviewable')
  getReviewableTasks(@CurrentUser() userId: string) {
    const tasks = this.tasksService.getReviewableTasks(userId);
    return { success: true, tasks, count: tasks.length };
  }
}
