import { Injectable, Logger, OnModuleInit, Optional, Inject, forwardRef } from '@nestjs/common';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { dataDir } from '../config/backend-root';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';

/**
 * 批次状态
 */
export type BatchStatus =
  | 'pending'              // 等待开始
  | 'running'              // 运行中
  | 'partially_completed'  // 部分完成（有成功也有失败）
  | 'completed'            // 全部完成
  | 'failed'               // 全部失败
  | 'cancelled'            // 已取消
  | 'awaiting_recovery';   // 等待恢复（进程重启后）

/**
 * 批次子项状态（与 TaskStatus 对齐）
 */
export type BatchItemStatus =
  | 'pending'          // 尚未开始
  | 'queued'           // 排队等待调度
  | 'running'          // 正在执行
  | 'rate_limited'     // 被限流，等待配额恢复
  | 'retry_scheduled'  // 已安排重试
  | 'paused'           // 用户暂停
  | 'completed'        // 成功完成
  | 'failed'           // 执行失败
  | 'cancelled';       // 已取消

/**
 * 批次记录（持久化到 data/batches.json）
 */
export interface BatchRecord {
  batchId: string;
  userId: string;
  status: BatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  items: BatchItem[];
}

/**
 * 批次子项（与 Task 模型关联）
 */
export interface BatchItem {
  sessionId: string;
  itemId: string;            // 业务标识（如组件名）
  status: BatchItemStatus;
  idempotencyKey: string;    // 幂等键（确定性生成，防重复执行）
  attemptCount: number;      // 已尝试次数
  lastError?: string;        // 最近错误
  completedAt?: number;      // 完成时间
  nextRetryAt?: number;      // 下次重试时间（retry_scheduled 状态）
  rateLimitReason?: RateLimitReason; // 限流原因
}

const MAX_PERSISTED_BATCHES = 200;
const ZOMBIE_BATCH_TIMEOUT = 2 * 60 * 60 * 1000; // 2小时

/**
 * 批量生产服务（Phase 7 #207）
 * 
 * 职责：
 * 1. 创建批次记录（批次 ID、子任务列表、状态汇总）
 * 2. 持久化到磁盘 data/batches.json（原子写入 + 启动恢复）
 * 3. 更新批次汇总状态（完成数、失败数、总状态）
 * 4. 支持批次恢复（进程重启后自动恢复未完成项）
 * 5. 保证幂等性（idempotencyKey 防重复执行，确定性生成）
 */
@Injectable()
export class BatchService implements OnModuleInit {
  private readonly logger = new Logger(BatchService.name);

  private batches = new Map<string, BatchRecord>();
  private persistFile: string;
  private persistInFlight: Promise<void> | null = null;
  private persistAgain = false;

  constructor(
    private readonly tasksService: TasksService,
    @Optional() @Inject(forwardRef(() => QuotaService)) private readonly quotaService?: QuotaService,
    @Optional() @Inject(forwardRef(() => TaskQueueService)) private readonly queueService?: TaskQueueService,
  ) {
    this.persistFile = join(dataDir, 'batches.json');
    this.logger.log('BatchService 初始化');
  }

  /**
   * 启动时加载磁盘批次并自动恢复
   */
  onModuleInit(): void {
    this.loadFromDisk();

    // 自动恢复未完成的批次
    this.autoRecoverBatches();

    // 定期持久化（每30秒）
    setInterval(() => {
      if (this.batches.size > 0) this.persist();
    }, 30 * 1000);

    // 优雅关闭
    process.on('SIGTERM', () => {
      this.persist();
    });
    process.on('SIGINT', () => {
      this.persist();
    });
  }

  // ─── 持久化 ───────────────────────────────────

  /**
   * 从磁盘加载历史批次
   */
  private loadFromDisk(): void {
    try {
      if (!existsSync(this.persistFile)) {
        // 尝试从 .tmp 恢复
        if (existsSync(this.persistFile + '.tmp')) {
          const tmpRaw = readFileSync(this.persistFile + '.tmp', 'utf-8');
          if (tmpRaw && tmpRaw.trim()) {
            require('fs').renameSync(this.persistFile + '.tmp', this.persistFile);
          }
        } else {
          return;
        }
      }
      const raw = readFileSync(this.persistFile, 'utf-8');
      if (!raw || raw.trim() === '') return;

      const list: BatchRecord[] = JSON.parse(raw);
      if (!Array.isArray(list)) return;

      for (const batch of list) {
        if (!batch || !batch.batchId) continue;
        this.batches.set(batch.batchId, batch);
      }

      this.logger.log(`从磁盘加载 ${this.batches.size} 个批次记录`);
    } catch (err: any) {
      this.logger.warn(`加载批次记录失败: ${err.message}`);
    }
  }

  /**
   * 持久化到磁盘（原子写入）
   */
  private persist(): Promise<void> {
    if (this.persistInFlight) {
      this.persistAgain = true;
      return this.persistInFlight;
    }

    this.persistInFlight = this.flushPersist()
      .finally(() => {
        this.persistInFlight = null;
        if (this.persistAgain) {
          this.persistAgain = false;
          this.persist();
        }
      });

    return this.persistInFlight;
  }

  private async flushPersist(): Promise<void> {
    try {
      const list = Array.from(this.batches.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_PERSISTED_BATCHES);

      const dir = join(this.persistFile, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 原子写入：先写唯一 .tmp 再 rename
      const tmpFile = `${this.persistFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
      require('fs').renameSync(tmpFile, this.persistFile);
    } catch (err: any) {
      this.logger.warn(`持久化批次记录失败: ${err.message}`);
    }
  }

  // ─── 启动恢复 ───────────────────────────────────

  /**
   * 自动恢复未完成的批次
   * 进程重启后，将 running/queued/rate_limited/retry_scheduled 状态的子项重置为 pending
   */
  private autoRecoverBatches(): void {
    const now = Date.now();
    let recoveredCount = 0;

    for (const [batchId, batch] of this.batches) {
      // 跳过已终态的批次
      if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
        continue;
      }

      // 僵尸批次检查：超过2小时未更新的运行中批次标记为失败
      if (now - batch.updatedAt > ZOMBIE_BATCH_TIMEOUT) {
        batch.status = 'failed';
        batch.updatedAt = now;
        this.logger.warn(`僵尸批次已标记失败: ${batchId}`);
        continue;
      }

      // 恢复未完成的子项
      let itemRecovered = 0;
      for (const item of batch.items) {
        if (
          item.status === 'running' ||
          item.status === 'queued' ||
          item.status === 'rate_limited' ||
          item.status === 'retry_scheduled'
        ) {
          // 重置为 pending，等待重新调度
          item.status = 'pending';
          item.nextRetryAt = undefined;
          itemRecovered++;
        }
      }

      if (itemRecovered > 0) {
        batch.status = 'awaiting_recovery';
        batch.updatedAt = now;
        recoveredCount++;
        this.logger.log(`批次 ${batchId} 恢复 ${itemRecovered} 个未完成子项`);
      }
    }

    if (recoveredCount > 0) {
      this.logger.log(`自动恢复完成：${recoveredCount} 个批次待重新调度`);
      this.persist();
    }
  }

  // ─── 批次操作 ───────────────────────────────────

  /**
   * 创建批次
   */
  async createBatch(
    userId: string,
    items: Array<{ itemId: string; payload: any; componentType?: string; generationTier?: string }>,
  ): Promise<{ batchId: string; totalItems: number }> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();

    const batchItems: BatchItem[] = items.map((item, index) => {
      // 子任务 ID 统一格式：{类型}-{档位}-{ts}-{hex}，与单组件生成一致
      const typePrefix = item.componentType === 'microcode' ? 'mc' : 'mv';
      const tierSuffix = item.generationTier === 'lite' ? 'lite' : 'max';
      const sessionId = `${typePrefix}-${tierSuffix}-${Date.now() + index}-${randomBytes(4).toString('hex')}`;
      return {
        sessionId,
        itemId: item.itemId,
        status: 'pending' as BatchItemStatus,
        idempotencyKey: this.generateIdempotencyKey(batchId, item.itemId),
        attemptCount: 0,
      };
    });

    const record: BatchRecord = {
      batchId,
      userId,
      status: 'pending',
      totalItems: items.length,
      completedItems: 0,
      failedItems: 0,
      createdAt: now,
      updatedAt: now,
      items: batchItems,
    };

    this.batches.set(batchId, record);
    this.persist();

    this.logger.log(`批次已创建: ${batchId}, ${items.length} 个子项, 用户: ${userId}`);

    return { batchId, totalItems: items.length };
  }

  /**
   * 获取批次记录
   */
  async getBatch(batchId: string): Promise<BatchRecord | null> {
    return this.batches.get(batchId) || null;
  }

  /**
   * 更新子任务状态（成功）
   * 幂等：已完成的不重复更新
   */
  async markItemCompleted(batchId: string, sessionId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      this.logger.warn(`批次不存在: ${batchId}`);
      return;
    }

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) {
      this.logger.warn(`子任务不存在: ${sessionId} in batch ${batchId}`);
      return;
    }

    // 幂等检查
    if (item.status === 'completed') {
      this.logger.debug(`子任务已完成，跳过: ${sessionId}`);
      return;
    }

    item.status = 'completed';
    item.completedAt = Date.now();
    item.nextRetryAt = undefined;
    item.rateLimitReason = undefined;
    batch.completedItems++;
    batch.updatedAt = Date.now();

    this.updateBatchSummaryStatus(batch);
    this.persist();

    this.logger.log(`子任务完成: ${sessionId}, 批次进度: ${batch.completedItems}/${batch.totalItems}`);
  }

  /**
   * 更新子任务状态（失败）
   * 幂等：已失败的不重复增加 attemptCount
   */
  async markItemFailed(
    batchId: string,
    sessionId: string,
    error: string,
  ): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      this.logger.warn(`批次不存在: ${batchId}`);
      return;
    }

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) {
      this.logger.warn(`子任务不存在: ${sessionId} in batch ${batchId}`);
      return;
    }

    // 幂等检查
    if (item.status === 'completed') {
      this.logger.debug(`子任务已完成，跳过失败标记: ${sessionId}`);
      return;
    }

    // 只有从非 failed 状态转到 failed 时才增加计数
    if (item.status !== 'failed') {
      item.attemptCount++;
      batch.failedItems++;
    }

    item.status = 'failed';
    item.lastError = error;
    item.nextRetryAt = undefined;
    batch.updatedAt = Date.now();

    this.updateBatchSummaryStatus(batch);
    this.persist();

    this.logger.warn(`子任务失败: ${sessionId}, 错误: ${error}, 尝试次数: ${item.attemptCount}`);
  }

  /**
   * 更新子任务状态为排队中
   */
  async markItemQueued(batchId: string, sessionId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) return;

    // 幂等：已终态不更新
    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') return;

    item.status = 'queued';
    item.nextRetryAt = undefined;
    batch.updatedAt = Date.now();
    this.persist();
  }

  /**
   * 更新子任务状态为运行中
   */
  async markItemRunning(batchId: string, sessionId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) return;

    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') return;

    item.status = 'running';
    item.nextRetryAt = undefined;
    batch.updatedAt = Date.now();
    this.persist();
  }

  /**
   * 标记子任务为限流状态
   */
  async markItemRateLimited(
    batchId: string,
    sessionId: string,
    reason: RateLimitReason,
    quotaResetAt?: number,
  ): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) return;

    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') return;

    item.status = 'rate_limited';
    item.rateLimitReason = reason;
    item.nextRetryAt = quotaResetAt;
    batch.updatedAt = Date.now();
    this.persist();

    this.logger.log(`子任务限流: ${sessionId}, 原因: ${reason}, 恢复时间: ${quotaResetAt ? new Date(quotaResetAt).toISOString() : '未知'}`);
  }

  /**
   * 标记子任务为重试调度
   */
  async markItemRetryScheduled(
    batchId: string,
    sessionId: string,
    retryAt: number,
  ): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    const item = batch.items.find(i => i.sessionId === sessionId);
    if (!item) return;

    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') return;

    item.status = 'retry_scheduled';
    item.nextRetryAt = retryAt;
    item.attemptCount++;
    batch.updatedAt = Date.now();
    this.persist();

    this.logger.log(`子任务重试已调度: ${sessionId}, 重试时间: ${new Date(retryAt).toISOString()}, 尝试次数: ${item.attemptCount}`);
  }

  /**
   * 获取用户的所有批次
   */
  async getUserBatches(userId: string): Promise<BatchRecord[]> {
    const batches: BatchRecord[] = [];
    for (const batch of this.batches.values()) {
      if (batch.userId === userId) {
        batches.push(batch);
      }
    }
    return batches.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取所有待恢复的批次
   */
  async getBatchesAwaitingRecovery(): Promise<BatchRecord[]> {
    const batches: BatchRecord[] = [];
    for (const batch of this.batches.values()) {
      if (batch.status === 'awaiting_recovery') {
        batches.push(batch);
      }
    }
    return batches;
  }

  /**
   * 取消批次
   */
  async cancelBatch(batchId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return { success: false, message: '批次不存在' };
    }

    if (batch.userId !== userId) {
      return { success: false, message: '无权取消此批次' };
    }

    if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
      return { success: false, message: `批次状态为 ${batch.status}，无法取消` };
    }

    batch.status = 'cancelled';
    batch.updatedAt = Date.now();

    // 取消所有未完成的子任务
    for (const item of batch.items) {
      if (item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled') {
        item.status = 'cancelled';
        item.nextRetryAt = undefined;
        // 从队列中移除
        if (this.queueService) {
          this.queueService.dequeue(item.sessionId);
        }
      }
    }

    this.persist();
    this.logger.log(`批次已取消: ${batchId}`);

    return { success: true, message: '批次已取消' };
  }

  /**
   * 恢复批次（进程重启后或用户手动恢复）
   * 将 awaiting_recovery/paused 状态的子项重置为 pending，批次状态设为 running
   */
  async resumeBatch(batchId: string): Promise<{ success: boolean; message: string; resumedItems: number }> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return { success: false, message: '批次不存在', resumedItems: 0 };
    }

    if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
      return { success: false, message: `批次状态为 ${batch.status}，无法恢复`, resumedItems: 0 };
    }

    let resumedCount = 0;

    for (const item of batch.items) {
      // 恢复所有非终态的子任务
      if (item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled') {
        item.status = 'pending';
        item.nextRetryAt = undefined;
        item.rateLimitReason = undefined;
        resumedCount++;
      }
    }

    if (resumedCount > 0) {
      batch.status = 'running';
      batch.updatedAt = Date.now();
      this.persist();
    }

    this.logger.log(`批次恢复: ${batchId}, 恢复 ${resumedCount} 个子项`);

    return { success: true, message: `已恢复 ${resumedCount} 个子项`, resumedItems: resumedCount };
  }

  /**
   * 获取批次中所有待执行的子项（pending 状态）
   */
  getPendingItems(batchId: string): BatchItem[] {
    const batch = this.batches.get(batchId);
    if (!batch) return [];
    return batch.items.filter(i => i.status === 'pending');
  }

  /**
   * 检查子任务是否已完成（幂等检查用）
   */
  isItemCompleted(batchId: string, sessionId: string): boolean {
    const batch = this.batches.get(batchId);
    if (!batch) return false;
    const item = batch.items.find(i => i.sessionId === sessionId);
    return item?.status === 'completed';
  }

  // ─── 内部方法 ───────────────────────────────────

  /**
   * 更新批次汇总状态
   */
  private updateBatchSummaryStatus(batch: BatchRecord): void {
    const total = batch.totalItems;
    const completed = batch.completedItems;
    const failed = batch.failedItems;
    const processed = completed + failed;

    if (processed === total) {
      // 全部处理完成
      if (completed === total) {
        batch.status = 'completed';
        batch.completedAt = Date.now();
      } else if (completed === 0) {
        batch.status = 'failed';
        batch.completedAt = Date.now();
      } else {
        batch.status = 'partially_completed';
        batch.completedAt = Date.now();
      }
    } else if (processed > 0) {
      // 部分处理完成，还有进行中的
      batch.status = 'running';
    }
  }

  /**
   * Phase 7 #210：暂停批次（暂停所有未完成子项）
   */
  async pauseBatch(batchId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return { success: false, message: '批次不存在' };
    }

    if (batch.userId !== userId) {
      return { success: false, message: '无权操作此批次' };
    }

    if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
      return { success: false, message: `批次状态为 ${batch.status}，无法暂停` };
    }

    let pausedCount = 0;
    for (const item of batch.items) {
      if (item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled' && item.status !== 'paused') {
        item.status = 'paused';
        item.nextRetryAt = undefined;
        if (this.queueService) {
          this.queueService.dequeue(item.sessionId);
        }
        pausedCount++;
      }
    }

    if (pausedCount > 0) {
      batch.updatedAt = Date.now();
      // 暂停后批次仍可恢复
      this.persist();
    }

    this.logger.log(`批次暂停: ${batchId}, 暂停 ${pausedCount} 个子项`);

    return { success: true, message: `已暂停 ${pausedCount} 个子项` };
  }

  /**
   * Phase 7 #210：仅重试失败的子项
   */
  async retryFailedItems(batchId: string, userId: string): Promise<{ success: boolean; message: string; retryCount: number }> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return { success: false, message: '批次不存在', retryCount: 0 };
    }

    if (batch.userId !== userId) {
      return { success: false, message: '无权操作此批次', retryCount: 0 };
    }

    if (batch.status === 'completed' || batch.status === 'cancelled') {
      return { success: false, message: `批次状态为 ${batch.status}，无需重试`, retryCount: 0 };
    }

    let retryCount = 0;
    for (const item of batch.items) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.lastError = undefined;
        item.nextRetryAt = undefined;
        item.rateLimitReason = undefined;
        retryCount++;
      }
    }

    if (retryCount > 0) {
      // 重置批次计数
      batch.failedItems = Math.max(0, batch.failedItems - retryCount);
      batch.status = 'running';
      batch.updatedAt = Date.now();
      this.persist();
    }

    this.logger.log(`批次重试失败项: ${batchId}, 重试 ${retryCount} 个子项`);

    return { success: true, message: `已重置 ${retryCount} 个失败子项，等待重新执行`, retryCount };
  }

  /**
   * 生成确定性幂等键（不含时间戳，保证重启后幂等）
   * 格式：batchId:itemId（确定性，同一批次同一 itemId 永远生成相同的 key）
   */
  private generateIdempotencyKey(batchId: string, itemId: string): string {
    return `${batchId}:${itemId}`;
  }
}
