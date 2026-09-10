import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Param,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { BatchService } from './batch.service';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { LiteService } from './lite.service';
import { Phase2Service } from '../phase2/phase2.service';
import { GeneratePhase2Dto } from '../phase2/dto/generate-phase2.dto';
import { GenerateLiteDto } from './dto/generate-lite.dto';
import { parseFigmaUrl } from '../ai-engine/utils/figma-url-parser.js';
import {
  LiteErrorCode,
  LITE_ERROR_MESSAGES,
  LiteComponentType,
  LiteSourceType,
  LiteGenerationTier,
} from './lite.constants';

/**
 * 批量生成请求 DTO
 */
interface BatchGenerateDto {
  items: Array<{
    imageBase64?: string;
    figmaUrl?: string;
    previewToken?: string;
    componentName?: string;
    componentType?: LiteComponentType;
    generationTier?: LiteGenerationTier;
    config?: Record<string, any>;
    panelType?: string;
    requirementDoc?: string;
  }>;
  groupId?: string;
}

/**
 * 批量生成控制器（Phase 7 #207）
 * 
 * 端点：
 * - POST /lite/batch/generate：创建批量生成任务
 * - GET /lite/batch/list：获取用户的所有批次
 * - GET /lite/batch/:batchId：获取批次详情
 * - POST /lite/batch/:batchId/cancel：取消批次
 * - POST /lite/batch/:batchId/resume：恢复批次
 * - GET /lite/batch/recoverable：获取待恢复的批次列表
 */
@Controller('lite/batch')
export class BatchController {
  private readonly logger = new Logger(BatchController.name);

  constructor(
    private readonly batchService: BatchService,
    private readonly liteService: LiteService,
    private readonly phase2Service: Phase2Service,
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    @Optional() @Inject(QuotaService) private readonly quotaService?: QuotaService,
    @Optional() @Inject(TaskQueueService) private readonly queueService?: TaskQueueService,
  ) {}

  /**
   * POST /lite/batch/pre-check
   * Phase 7 #208：批量生成配额预检
   * 提交前返回配额拆批建议：可立即执行的数量、需等待的数量、恢复时间
   */
  @Post('pre-check')
  async preCheck(@Body() dto: BatchGenerateDto, @Req() req: any) {
    if (!dto.items || dto.items.length === 0) {
      throw new HttpException('items 不能为空', HttpStatus.BAD_REQUEST);
    }

    const userId = req.session?.userId;
    const requestedCount = dto.items.length;

    // 验证每个 item
    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      const hasImage = !!item.imageBase64 && item.imageBase64.trim().length > 0;
      const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;

      if (!hasImage && !hasFigma) {
        throw new HttpException(
          `第 ${i + 1} 个 item 缺少输入数据：需要提供 imageBase64 或 figmaUrl 至少一个`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (!this.quotaService || !userId) {
      // 无配额服务或未登录，直接返回全部可用
      return {
        success: true,
        requestedCount,
        availableNow: requestedCount,
        availableLater: 0,
        recommendedAction: 'all_now',
        message: `全部 ${requestedCount} 个组件可以立即生成`,
      };
    }

    const result = await this.quotaService.preCheckBatch(userId, requestedCount);

    return {
      success: true,
      ...result,
    };
  }

  /**
   * POST /lite/batch/generate
   * 创建批量生成任务
   */
  @Post('generate')
  async generate(@Body() dto: BatchGenerateDto, @Req() req: any) {
    if (!dto.items || dto.items.length === 0) {
      throw new HttpException('items 不能为空', HttpStatus.BAD_REQUEST);
    }

    const userId = req.session?.userId;
    const groupId = await this.liteService.resolvePrivateGroupId(dto.groupId, userId);

    // 验证每个 item
    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      const hasImage = !!item.imageBase64 && item.imageBase64.trim().length > 0;
      const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;

      if (!hasImage && !hasFigma) {
        throw new HttpException(
          `第 ${i + 1} 个 item 缺少输入数据：需要提供 imageBase64 或 figmaUrl 至少一个`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Phase 7 #208：配额预检 + 自动拆批
    let preCheckResult: any = null;
    let immediateCount = dto.items.length;
    let deferredCount = 0;
    let quotaResetAt: number | undefined;
    let nextRetryAt: number | undefined;

    if (this.quotaService && userId) {
      preCheckResult = await this.quotaService.preCheckBatch(userId, dto.items.length);
      immediateCount = preCheckResult.availableNow;
      deferredCount = preCheckResult.availableLater;

      // 计算延后项的预计重试时间（取小时和日恢复时间中较早的）
      if (deferredCount > 0) {
        const hourlyReset = preCheckResult.hourly?.resetAt;
        const dailyReset = preCheckResult.daily?.resetAt;
        quotaResetAt = Math.min(
          hourlyReset || Infinity,
          dailyReset || Infinity,
        );
        if (quotaResetAt === Infinity) quotaResetAt = Date.now() + 60 * 60 * 1000;
        nextRetryAt = quotaResetAt;
      }

      // 完全无配额：返回预检结果让前端展示
      if (immediateCount === 0) {
        return {
          success: true,
          queued: true,
          batchId: null,
          requestCount: dto.items.length,
          availableNow: 0,
          availableLater: dto.items.length,
          recommendedAction: preCheckResult.recommendedAction,
          message: preCheckResult.message,
          quotaDetails: {
            hourly: preCheckResult.hourly,
            daily: preCheckResult.daily,
          },
          quotaResetAt,
          waitMinutes: preCheckResult.hourly?.waitMinutes || 60,
        };
      }
    }

    // 创建批次
    const batchResult = await this.batchService.createBatch(
      userId,
      dto.items.map(item => {
        const sourceType = item.figmaUrl ? 'figma' : 'screenshot';
        const generationTier = sourceType === 'screenshot'
          ? 'lite'
          : item.generationTier || 'max';
        return {
          itemId: item.componentName || `item-${randomBytes(4).toString('hex')}`,
          payload: item,
          componentType: item.componentType || 'vue3',
          generationTier,
        };
      }),
    );

    const batchId = batchResult.batchId;

    // Phase 7 #208：预标记延后项为限流状态
    if (deferredCount > 0) {
      const batch = await this.batchService.getBatch(batchId);
      if (batch) {
        for (let i = immediateCount; i < dto.items.length; i++) {
          const item = batch.items[i];
          if (item) {
            await this.batchService.markItemRateLimited(
              batchId,
              item.sessionId,
              'USER_HOURLY_QUOTA',
              nextRetryAt,
            );
          }
        }
      }
    }

    this.logger.log(`批量生成已创建: batchId=${batchId}, 立即执行 ${immediateCount}/${dto.items.length}, 延后 ${deferredCount}`);

    // 异步执行批量生成（不阻塞响应）
    this.executeBatchGeneration(batchId, userId, groupId, dto.items).catch((err) => {
      this.logger.error(`批量生成启动失败 batchId=${batchId}: ${err?.message}`);
    });

    return {
      success: true,
      batchId,
      totalItems: batchResult.totalItems,
      immediateItems: immediateCount,
      deferredItems: deferredCount,
      quotaResetAt,
      message: deferredCount > 0
        ? `批量生成已创建：${immediateCount} 个立即执行，${deferredCount} 个配额恢复后自动开始`
        : `批量生成任务已创建，共 ${batchResult.totalItems} 个子项`,
    };
  }

  /**
   * GET /lite/batch/list
   * 获取用户的所有批次
   */
  @Get('list')
  async list(@Req() req: any) {
    const userId = req.session?.userId;
    const batches = await this.batchService.getUserBatches(userId);

    return {
      success: true,
      batches: batches.map(b => ({
        batchId: b.batchId,
        status: b.status,
        totalItems: b.totalItems,
        completedItems: b.completedItems,
        failedItems: b.failedItems,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };
  }

  /**
   * GET /lite/batch/recoverable
   * 获取待恢复的批次列表
   */
  @Get('recoverable')
  async getRecoverable(@Req() req: any) {
    const userId = req.session?.userId;
    const allBatches = await this.batchService.getUserBatches(userId);
    const recoverable = allBatches.filter(b => b.status === 'awaiting_recovery');

    return {
      success: true,
      batches: recoverable.map(b => ({
        batchId: b.batchId,
        status: b.status,
        totalItems: b.totalItems,
        completedItems: b.completedItems,
        failedItems: b.failedItems,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };
  }

  /**
   * GET /lite/batch/:batchId
   * 获取批次详情
   */
  @Get(':batchId')
  async getBatch(@Param('batchId') batchId: string, @Req() req: any) {
    const batch = await this.batchService.getBatch(batchId);

    if (!batch) {
      throw new HttpException('批次不存在', HttpStatus.NOT_FOUND);
    }

    if (batch.userId !== req.session?.userId) {
      throw new HttpException('无权访问此批次', HttpStatus.FORBIDDEN);
    }

    return {
      success: true,
      batch: {
        batchId: batch.batchId,
        status: batch.status,
        totalItems: batch.totalItems,
        completedItems: batch.completedItems,
        failedItems: batch.failedItems,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        completedAt: batch.completedAt,
        items: batch.items.map(i => ({
          sessionId: i.sessionId,
          itemId: i.itemId,
          status: i.status,
          attemptCount: i.attemptCount,
          lastError: i.lastError,
          completedAt: i.completedAt,
          nextRetryAt: i.nextRetryAt,
          rateLimitReason: i.rateLimitReason,
        })),
      },
    };
  }

  /**
   * POST /lite/batch/:batchId/cancel
   * 取消批次
   */
  @Post(':batchId/cancel')
  async cancelBatch(@Param('batchId') batchId: string, @Req() req: any) {
    const userId = req.session?.userId;
    const result = await this.batchService.cancelBatch(batchId, userId);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    return {
      success: true,
      message: result.message,
    };
  }

  /**
   * POST /lite/batch/:batchId/pause
   * Phase 7 #210：暂停批次
   */
  @Post(':batchId/pause')
  async pauseBatch(@Param('batchId') batchId: string, @Req() req: any) {
    const userId = req.session?.userId;
    const result = await this.batchService.pauseBatch(batchId, userId);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    return {
      success: true,
      message: result.message,
    };
  }

  /**
   * POST /lite/batch/:batchId/retry-failed
   * Phase 7 #210：仅重试失败的子项
   */
  @Post(':batchId/retry-failed')
  async retryFailed(@Param('batchId') batchId: string, @Req() req: any) {
    const userId = req.session?.userId;
    const batch = await this.batchService.getBatch(batchId);

    if (!batch) {
      throw new HttpException('批次不存在', HttpStatus.NOT_FOUND);
    }

    if (batch.userId !== userId) {
      throw new HttpException('无权访问此批次', HttpStatus.FORBIDDEN);
    }

    const result = await this.batchService.retryFailedItems(batchId, userId);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    // 如果有重试的子项，重新触发执行
    if (result.retryCount > 0) {
      this.executeBatchGeneration(batchId, userId, '', batch.items.filter(i => i.status === 'pending').map((i, idx) => ({
        imageBase64: undefined,
        figmaUrl: undefined,
        componentName: i.itemId,
      })) as any).catch((err) => {
        this.logger.error(`失败重试执行失败 batchId=${batchId}: ${err?.message}`);
      });
    }

    return {
      success: true,
      message: result.message,
      retryCount: result.retryCount,
    };
  }

  /**
   * POST /lite/batch/:batchId/resume
   * 恢复批次
   */
  @Post(':batchId/resume')
  async resumeBatch(@Param('batchId') batchId: string, @Req() req: any) {
    const userId = req.session?.userId;
    const batch = await this.batchService.getBatch(batchId);

    if (!batch) {
      throw new HttpException('批次不存在', HttpStatus.NOT_FOUND);
    }

    if (batch.userId !== userId) {
      throw new HttpException('无权访问此批次', HttpStatus.FORBIDDEN);
    }

    const result = await this.batchService.resumeBatch(batchId);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    // 如果有恢复的子项，重新触发执行
    if (result.resumedItems > 0) {
      // 重建 items 列表用于重新执行
      const pendingItems = batch.items
        .filter(i => i.status === 'pending')
        .map(i => ({
          sessionId: i.sessionId,
          itemId: i.itemId,
        }));

      // 异步重新执行
      this.executeBatchGeneration(batchId, userId, batchId, pendingItems as any).catch((err) => {
        this.logger.error(`批次恢复执行失败 batchId=${batchId}: ${err?.message}`);
      });
    }

    return {
      success: true,
      message: result.message,
      resumedItems: result.resumedItems,
    };
  }

  /**
   * 申请全局并发槽位（与单任务共用 TaskQueueService 的 MAX_CONCURRENT）
   *
   * 背景：批量生成过去跑自己的 worker 池（concurrency=2），与单任务的全局队列
   * 互不知情，导致高峰期实际并发可达 4。这里让每个子项在真正开始生成前，
   * 必须先从全局队列拿到槽位。
   *
   * 语义对齐 TaskQueueService：
   * - 有空槽位 → registerRunning 直接占位
   * - 槽位已满 → enqueue 等待；scheduleNextWaiting 调度到本任务时会先
   *   runningTasks.set 再调用 executor，因此 executor 里 resolve 即代表「已持有槽位」
   * - 槽位的释放不在这里做，统一由 ProgressService.sendComplete/sendError 处理
   *
   * @returns true=已持有槽位（需要在收尾时兜底释放）；false=队列不可用，降级为不受控执行
   */
  private async acquireGlobalSlot(
    sessionId: string,
    meta: { componentName?: string; groupId?: string; userId?: string; target?: string },
  ): Promise<boolean> {
    const queue = this.queueService;
    if (!queue) {
      // 队列服务不可用时降级：保持原有行为，不阻塞批量执行
      return false;
    }

    if (queue.getAvailableSlots(meta.userId) > 0) {
      queue.registerRunning(sessionId, meta.userId);
      return true;
    }

    // 槽位已满：入队等待，被调度时才继续往下执行
    this.logger.log(`批量子任务等待全局并发槽位: ${sessionId}`);

    await new Promise<void>((resolve) => {
      void queue
        .enqueue(
          {
            sessionId,
            componentId: sessionId,
            componentName: meta.componentName || sessionId,
            groupId: meta.groupId,
            userId: meta.userId,
            target: meta.target,
            taskType: 'component',
          } as any,
          'concurrency_full',
          async () => {
            // 调度器已在此前完成 runningTasks.set，这里放行即代表拿到槽位
            resolve();
          },
        )
        .catch((err) => {
          this.logger.error(`批量子任务入队失败 ${sessionId}: ${err?.message}，降级为直接执行`);
          resolve();
        });
    });

    return true;
  }

  /** 等待 Phase2 子任务进入终态，保持批次状态与真实生成结果一致 */
  private async waitForTaskTerminal(
    sessionId: string,
    timeoutMs = 30 * 60 * 1000,
  ): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const task = this.tasksService.getTask(sessionId);
      if (task?.status === 'completed') return;
      if (task?.status === 'failed' || task?.status === 'cancelled') {
        throw new Error(task.error || task.lastError || `Max 子任务已${task.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Max 子任务等待超时: ${sessionId}`);
  }

  /**
   * 执行批量生成（异步）
   * 支持幂等恢复：已完成的子项自动跳过
   */
  private async executeBatchGeneration(
    batchId: string,
    userId: string,
    groupId: string,
    items: BatchGenerateDto['items'],
  ): Promise<void> {
    this.logger.log(`开始执行批量生成: batchId=${batchId}, ${items.length} 个子项`);

    // 并发控制：worker 数量跟随全局队列上限，避免两处硬编码漂移。
    // 真正的并发闸门在每个子项的 acquireGlobalSlot()——批量与单任务共用同一组槽位。
    const concurrency = this.queueService?.MAX_CONCURRENT ?? 2;
    let currentIndex = 0;

    const executeNext = async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        const item = items[index];
        const batch = await this.batchService.getBatch(batchId);
        const batchItem = batch?.items[index];

        if (!batchItem) {
          this.logger.warn(`子项不存在: batchId=${batchId}, index=${index}`);
          continue;
        }

        // 幂等检查：已完成的跳过（支持恢复场景）
        if (batchItem.status === 'completed') {
          this.logger.debug(`子项已完成，跳过: ${batchItem.sessionId}`);
          continue;
        }

        // 已取消的跳过
        if (batchItem.status === 'cancelled') {
          this.logger.debug(`子项已取消，跳过: ${batchItem.sessionId}`);
          continue;
        }

        // Phase 7 #208：限流等待中的跳过（配额恢复后由 resume/reconcile 触发）
        if (batchItem.status === 'rate_limited' || batchItem.status === 'retry_scheduled') {
          if (batchItem.nextRetryAt && Date.now() < batchItem.nextRetryAt) {
            this.logger.debug(`子项等待配额恢复，跳过: ${batchItem.sessionId}, 预计恢复: ${new Date(batchItem.nextRetryAt).toISOString()}`);
            continue;
          }
          // 已到恢复时间，重置为 pending 继续执行
          await this.batchService.markItemQueued(batchId, batchItem.sessionId);
        }

        const sessionId = batchItem.sessionId;
        let slotHeld = false;

        try {
          // 更新子任务状态为排队中
          await this.batchService.markItemQueued(batchId, sessionId);

          // SSE 推送：子任务排队中
          this.progressService.sendProgress(sessionId, {
            type: 'status',
            status: 'queued',
            message: '子任务排队中，等待执行...',
            timestamp: Date.now(),
          });

          // 配额检查（每个子项都要检查，因为配额可能在执行过程中耗尽）
          if (this.quotaService && userId) {
            const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
            if (!quotaStatus.allowed) {
              // 配额不足：标记为限流状态，而不是直接失败
              const rateLimitReason: RateLimitReason = quotaStatus.reason === 'QUOTA_HOURLY_EXCEEDED'
                ? 'USER_HOURLY_QUOTA'
                : 'USER_DAILY_QUOTA';

              this.logger.warn(`子任务配额不足: sessionId=${sessionId}, reason=${rateLimitReason}`);

              await this.batchService.markItemRateLimited(
                batchId,
                sessionId,
                rateLimitReason,
                quotaStatus.quotaResetAt,
              );

              // 同步 Task 状态
              this.tasksService.updateTask(sessionId, {
                status: 'rate_limited',
                rateLimitReason,
                quotaResetAt: quotaStatus.quotaResetAt,
              });

              this.progressService.sendProgress(sessionId, {
                type: 'status',
                status: 'rate_limited',
                message: `配额不足，等待恢复... ${quotaStatus.message}`,
                rateLimitReason,
                quotaResetAt: quotaStatus.quotaResetAt,
                waitMinutes: quotaStatus.waitMinutes,
                timestamp: Date.now(),
              });

              continue;
            }
          }

          // 先落任务记录（状态 queued），这样等待槽位期间任务中心也能看到「排队中」，
          // 而不是等到真正开始生成才凭空出现一条 running 任务。
          if (!this.tasksService.getTask(sessionId)) {
            this.tasksService.createTask(
              sessionId,
              {
                componentId: sessionId,
                componentName: item.componentName || sessionId,
                target: item.componentType || 'vue3',
                groupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                idempotencyKey: batchItem.idempotencyKey,
                attemptCount: batchItem.attemptCount,
              },
              'queued',
            );
          } else {
            this.tasksService.updateTask(sessionId, { status: 'queued' });
          }

          // 申请全局并发槽位：与单任务共用同一组 MAX_CONCURRENT 槽位。
          // 槽位已满时会在此阻塞排队，直到被队列调度到才继续执行。
          slotHeld = await this.acquireGlobalSlot(sessionId, {
            componentName: item.componentName,
            groupId,
            userId,
            target: item.componentType || 'vue3',
          });

          // 拿到槽位期间批次可能已被取消，重新核对一次避免无效生成
          const latestItem = (await this.batchService.getBatch(batchId))?.items[index];
          if (latestItem?.status === 'cancelled') {
            this.logger.log(`子项在等待槽位期间被取消，跳过执行: ${sessionId}`);
            continue;
          }

          // 更新子任务状态为运行中
          await this.batchService.markItemRunning(batchId, sessionId);

          // SSE 推送：子任务开始执行
          this.progressService.sendProgress(sessionId, {
            type: 'status',
            status: 'running',
            message: '子任务开始执行...',
            timestamp: Date.now(),
          });

          // 任务记录已在申请槽位前创建（状态 queued），此处推进为运行中
          this.tasksService.updateTask(sessionId, { status: 'running' });

          // 动态判断 sourceType 和 generationTier
          const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;
          const sourceType: LiteSourceType = hasFigma ? 'figma' : 'screenshot';
          const generationTier: LiteGenerationTier = sourceType === 'screenshot'
            ? 'lite'
            : item.generationTier || 'max';

          if (generationTier === 'max') {
            const parsed = parseFigmaUrl(item.figmaUrl!);
            if (!parsed.fileKey || !parsed.nodeId) {
              throw new Error('Max 完整生成需要包含 node-id 的有效 Figma 链接');
            }
            const phase2Dto = new GeneratePhase2Dto();
            phase2Dto.componentName = item.componentName || sessionId;
            phase2Dto.componentId = sessionId;
            phase2Dto.fileKey = parsed.fileKey;
            phase2Dto.nodeId = parsed.nodeId;
            phase2Dto.groupId = groupId;
            phase2Dto.target = item.componentType || 'vue3';
            phase2Dto.previewToken = item.previewToken;
            await this.phase2Service.startGeneration(
              sessionId,
              phase2Dto,
              groupId,
              userId,
            );
            this.tasksService.updateTask(sessionId, {
              generationTier: 'max',
              sourceType: 'figma',
            });
            await this.waitForTaskTerminal(sessionId);
          } else {
            await this.liteService.startGeneration(sessionId, {
              imageBase64: item.imageBase64,
              figmaUrl: item.figmaUrl,
              componentName: item.componentName,
              componentType: item.componentType,
              generationTier: 'lite',
              groupId,
              config: item.config,
              requirementDoc: item.requirementDoc,
              panelType: item.panelType as GenerateLiteDto['panelType'],
            } as GenerateLiteDto, groupId, userId, {
              sourceType,
              componentType: item.componentType || 'vue3',
              generationTier: 'lite',
            });
          }

          // 更新子任务状态为完成
          await this.batchService.markItemCompleted(batchId, sessionId);

          // 记录配额（Phase 7）
          if (this.quotaService && userId) {
            await this.quotaService.recordSuccess(userId, sessionId);
          }

          this.logger.log(`子任务完成: sessionId=${sessionId}, itemId=${batchItem.itemId}`);
        } catch (err) {
          this.logger.error(`子任务失败: sessionId=${sessionId}, error=${err?.message}`);

          await this.batchService.markItemFailed(batchId, sessionId, err?.message || '未知错误');

          // 同步 Task 状态
          this.tasksService.updateTask(sessionId, {
            status: 'failed',
            lastError: err?.message || '未知错误',
          });

          this.progressService.sendError(sessionId, {
            code: LiteErrorCode.INTERNAL_ERROR,
            message: err?.message || LITE_ERROR_MESSAGES[LiteErrorCode.INTERNAL_ERROR],
          });
        } finally {
          // 兜底释放：正常终态下 ProgressService.sendComplete/sendError 已释放槽位，
          // 这里只处理「跳过执行」或回调缺失的异常路径，避免槽位泄漏卡死后续排队任务。
          if (slotHeld && this.queueService?.isRunning(sessionId)) {
            await this.queueService.releaseSlot(sessionId);
          }
        }
      }
    };

    // 并发执行
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => executeNext());
    await Promise.all(workers);

    // 推送批次完成事件（Phase 7 #210：增强进度信息）
    const batch = await this.batchService.getBatch(batchId);
    if (batch) {
      // 统计各状态数量
      const statusCount = { completed: 0, failed: 0, rate_limited: 0, pending: 0, cancelled: 0, paused: 0, other: 0 };
      const attentionItems: Array<{ sessionId: string; itemId: string; status: string; lastError?: string; nextRetryAt?: number }> = [];

      for (const item of batch.items) {
        if (item.status === 'failed' || item.status === 'rate_limited') {
          attentionItems.push({
            sessionId: item.sessionId,
            itemId: item.itemId,
            status: item.status,
            lastError: item.lastError,
            nextRetryAt: item.nextRetryAt,
          });
        }
        if (statusCount[item.status as keyof typeof statusCount] !== undefined) {
          statusCount[item.status as keyof typeof statusCount]++;
        } else {
          statusCount.other++;
        }
      }

      this.progressService.sendProgress(`batch-${batchId}`, {
        type: 'batch_complete',
        batchId,
        status: batch.status,
        completedItems: batch.completedItems,
        failedItems: batch.failedItems,
        totalItems: batch.totalItems,
        statusBreakdown: statusCount,
        attentionItems: attentionItems.slice(0, 10),
        hasAttention: attentionItems.length > 0,
        timestamp: Date.now(),
      });

      this.logger.log(`批量生成完成: batchId=${batchId}, status=${batch.status}, completed=${batch.completedItems}, failed=${batch.failedItems}`);
    }
  }
}
