import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Task, TaskStatus } from '../tasks/tasks.service';
import { QuotaService } from '../quota/quota.service';

/**
 * 任务队列调度服务 — 并发槽位模式
 * 
 * 职责：
 * 1. 追踪当前运行中的任务数量
 * 2. 超出并发上限的任务进入等待队列
 * 3. 任务完成/失败时释放槽位，自动调度下一个等待任务
 * 4. 同时保留每日配额保护（防止单日滥用）
 * 
 * 核心逻辑：
 * - 最多同时运行 MAX_CONCURRENT 个任务
 * - 当并发槽位满时，新任务入队等待
 * - 任务完成/失败时调用 markTaskCompleted/markTaskFailed 通知队列
 * - 队列自动检查是否有等待的任务，如有则填入空出的槽位
 */
@Injectable()
export class TaskQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskQueueService.name);
  
  // 队列最大容量（防止无限堆积）
  private readonly MAX_QUEUE_SIZE = 100;
  
  // 最大并发执行任务数（可通过环境变量 TASK_MAX_CONCURRENT 配置，默认 2，允许范围 1-10）
  readonly MAX_CONCURRENT = TaskQueueService.resolveMaxConcurrent();

  // 全局并发保护上限（env TASK_GLOBAL_MAX_CONCURRENT，默认 10）。
  // 并发模型为 **per-user**：每个用户独享 MAX_CONCURRENT 个槽位，互不抢占。
  // 但 N 个用户 × MAX_CONCURRENT 可能压垮单机，故再设一道全局天花板。
  readonly GLOBAL_MAX_CONCURRENT = TaskQueueService.resolveGlobalMaxConcurrent();

  /**
   * 解析全局并发上限：env TASK_GLOBAL_MAX_CONCURRENT，非法值回退 10，且不得小于单用户上限
   */
  private static resolveGlobalMaxConcurrent(): number {
    const raw = process.env.TASK_GLOBAL_MAX_CONCURRENT;
    const parsed = Number.parseInt(raw ?? '', 10);
    const perUser = TaskQueueService.resolveMaxConcurrent();
    if (!Number.isFinite(parsed) || parsed < 1) return Math.max(10, perUser);
    return Math.max(parsed, perUser);
  }
  
  // 重试阶梯（秒）：第1次30秒，第2次60秒，第3次120秒...
  private readonly RETRY_BACKOFF_SECONDS = [30, 60, 120, 300, 600]; // 最大10分钟
  
  // 等待队列：sessionId -> Task（等待并发槽位的任务）
  private waitingQueue: Map<string, Task> = new Map();
  
  // 运行中任务追踪：sessionId -> 注册时间戳（用于幽灵任务健康检查）
  // 若任务注册后长时间未收到完成/失败通知，视为幽灵任务，定时释放槽位
  private runningTasks: Map<string, number> = new Map();

  // 会话归属：sessionId -> userId。per-user 并发槽位记账的事实源。
  // 未登录 / 拿不到 userId 时不记录，这类任务退化为「共享桶」（见 getRunningCount）。
  private sessionOwners: Map<string, string> = new Map();

  // 运行中任务健康检查超时：超过该时长无完成/失败通知即强制释放槽位
  // 正常 LLM 生成单块最长 ~10 分钟（CHUNK_TIMEOUT_MS=600s），加上重试与精修，
  // 10 分钟阈值覆盖正常长任务 + 余量，同时快速回收崩溃/回调丢失的幽灵任务
  private readonly RUNNING_STALE_TIMEOUT_MS = 10 * 60 * 1000;
  
  // 执行函数注册表：sessionId -> executeFn（任务运行中/暂停时也保留，供 resumeTask 重新入队使用）
  private executeFnRegistry: Map<string, () => Promise<void>> = new Map();
  
  // 任务执行回调（由外部注入，已废弃，优先使用 per-task executeFn）
  private executeCallback: (() => Promise<void>) | null = null;

  // 恢复执行器列表：服务重启后，把磁盘上残留的 queued 任务重新入队时使用。
  // 由业务模块（Phase2/Vue3 controller）在 onModuleInit 注册多个执行器，
  // 每个执行器负责一种 target，返回 true 表示已处理该任务。
  private restoreExecutors: Array<(task: Task) => Promise<boolean>> = [];

  private reconcileTimer?: NodeJS.Timeout;

  // 终态会话集合：防止 markTaskCompleted / markTaskFailed 被重复调用（progress.service 与
  // controller 收尾都会各调一次，导致「双释放 + 重复调度 + 不在运行中列表」噪声，甚至槽位记账错位）。
  // 任务重新 registerRunning 时会清除其终态标记，允许再次完成。
  private terminalSessions: Set<string> = new Set();
  private readonly TERMINAL_SESSIONS_MAX = 10000;

  /**
   * 记录会话为终态（幂等标记）。超出上限时清理最旧的一半，避免长期运行内存无限增长。
   */
  private markTerminal(sessionId: string): void {
    this.terminalSessions.add(sessionId);
    if (this.terminalSessions.size > this.TERMINAL_SESSIONS_MAX) {
      const toRemove = Math.floor(this.terminalSessions.size / 2);
      let count = 0;
      for (const sid of this.terminalSessions) {
        if (count++ >= toRemove) break;
        this.terminalSessions.delete(sid);
      }
    }
  }

  /**
   * 解析并发上限：env TASK_MAX_CONCURRENT，非法值回退到默认 2，并夹在 1-10 之间
   */
  private static resolveMaxConcurrent(): number {
    const raw = process.env.TASK_MAX_CONCURRENT;
    const parsed = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 2;
    return Math.min(parsed, 10);
  }

  constructor(private readonly quotaService: QuotaService) {
    const raw = process.env.TASK_MAX_CONCURRENT;
    this.logger.log(
      `TaskQueueService 初始化完成，最大并发: ${this.MAX_CONCURRENT}` +
        (raw ? `（来自 TASK_MAX_CONCURRENT=${raw}）` : '（默认值，可用 TASK_MAX_CONCURRENT 覆盖）'),
    );
  }

  onModuleInit(): void {
    this.reconcileTimer = setInterval(() => {
      void this.reconcileWaitingQueue();
    }, 5000);
    void this.reconcileWaitingQueue();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
  }

  /**
   * 注册任务执行回调
   * 当等待队列中的任务可以执行时，调用此回调启动任务
   */
  onExecute(callback: () => Promise<void>): void {
    this.executeCallback = callback;
  }

  /**
   * 为任务注册执行函数（持久化到 registry，暂停/恢复/重新入队时可用）
   */
  registerExecuteFn(sessionId: string, fn: () => Promise<void>): void {
    this.executeFnRegistry.set(sessionId, fn);
  }

  /**
   * 移除任务的执行函数注册
   */
  unregisterExecuteFn(sessionId: string): void {
    this.executeFnRegistry.delete(sessionId);
  }

  /**
   * 注册「恢复执行器」：服务重启后，将磁盘上残留的 queued 任务重新入队时使用。
   * 支持注册多个执行器（每个 controller 注册一个，各自处理自己的 target）。
   * 执行器返回 true 表示已处理该任务；所有执行器都返回 false 时任务视为无法恢复。
   */
  registerRestoreExecutor(fn: (task: Task) => Promise<boolean>): void {
    this.restoreExecutors.push(fn);
    this.logger.log(`恢复执行器已注册（当前 ${this.restoreExecutors.length} 个），服务重启后排队任务可自动恢复执行`);
  }

  /**
   * 恢复磁盘上的排队任务（服务重启场景）。
   * 把任务放回内存等待队列，并在调度时通过 restoreExecutors 重建执行函数。
   * @returns true 表示已恢复入队；false 表示无法恢复（无执行器或队列满）
   */
  async restoreQueuedTask(task: Task): Promise<boolean> {
    if (!task || !task.sessionId) return false;
    // 已在本进程队列中（可能重复恢复），跳过
    if (this.waitingQueue.has(task.sessionId) || this.runningTasks.has(task.sessionId)) return true;

    if (this.waitingQueue.size >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`等待队列已满，无法恢复排队任务: ${task.sessionId}`);
      return false;
    }

    // 没有可用的恢复执行器：任务无法在重启后继续执行，返回 false 由上层标记失败
    if (!task.executeFn && this.restoreExecutors.length === 0) {
      this.logger.warn(`排队任务 ${task.sessionId} 无法恢复：未注册恢复执行器`);
      return false;
    }

    task.status = 'queued';
    task.enqueuedAt = task.enqueuedAt || Date.now();

    // 调度时优先用任务自带 executeFn（内存恢复场景），磁盘恢复时无闭包，改用 restoreExecutors
    if (!task.executeFn) {
      const executors = [...this.restoreExecutors];
      task.executeFn = async () => {
        for (const executor of executors) {
          try {
            if (await executor(task)) return;
          } catch (error) {
            this.logger.error(`恢复执行器处理任务失败: ${task.sessionId}`, error);
          }
        }
        // 🔒 所有恢复执行器均返回 false（如 fileKey/nodeId 为空、target 无执行器等），
        // 任务无法恢复执行。此前这里只 warn 不释放槽位，而 scheduleNextWaiting 已 runningTasks.set 占用槽位，
        // 导致幽灵槽位占满并发、新任务永久排队（"排队错误"根因）。
        // 此处 markTaskFailed 释放槽位 + 调度下一个等待任务，避免槽位泄漏。
        this.logger.warn(
          `排队任务 ${task.sessionId} 恢复执行失败：所有执行器均未处理，释放槽位避免幽灵占用`,
        );
        await this.markTaskFailed(task.sessionId);
      };
    }

    this.waitingQueue.set(task.sessionId, task);
    this.logger.log(`排队任务已从磁盘恢复入队: ${task.sessionId}，当前等待: ${this.waitingQueue.size}`);

    // 有空槽立即调度
    if (this.getAvailableSlots() > 0) {
      await this.scheduleNextWaiting();
    }
    return true;
  }

  // ─── 并发槽位管理 ───────────────────────────────────

  /**
   * 获取当前可用并发槽位数
   * 每次查询前先清理幽灵任务，避免崩溃残留占槽导致新任务误排队
   */
  /**
   * 获取可用并发槽位数。
   * 传入 userId 时按 **per-user** 计算（该用户独享 MAX_CONCURRENT，不受别的用户影响）；
   * 不传时按全局计算。两者都再受 GLOBAL_MAX_CONCURRENT 天花板约束。
   */
  getAvailableSlots(userId?: string): number {
    this.reapStaleRunningTasks();
    const perUser = this.MAX_CONCURRENT - this.countRunningOf(userId);
    const globalLeft = this.GLOBAL_MAX_CONCURRENT - this.runningTasks.size;
    return Math.max(0, Math.min(perUser, globalLeft));
  }

  /**
   * 获取当前运行中的任务数量。
   * 传入 userId 时只统计该用户的运行中任务；不传返回全局数量。
   * 与 getAvailableSlots 一致，查询前先清理幽灵任务（此前两者口径不一致，
   * 导致 controller 用 getRunningCount 判满时把幽灵槽位算进去、新任务误排队）。
   */
  getRunningCount(userId?: string): number {
    this.reapStaleRunningTasks();
    return this.countRunningOf(userId);
  }

  /**
   * 统计运行中任务数：userId 为空 = 全局；否则只数属于该 user 的会话。
   * 没有归属记录（未登录）的会话不计入任何 per-user 桶，只在全局口径下体现。
   */
  private countRunningOf(userId?: string): number {
    if (!userId) return this.runningTasks.size;
    let n = 0;
    for (const sid of this.runningTasks.keys()) {
      if (this.sessionOwners.get(sid) === userId) n++;
    }
    return n;
  }

  /**
   * 判断任务是否仍占用并发槽位
   * 用于调用方在执行收尾时做「槽位是否已被终态回调释放」的兜底判断，
   * 避免重复释放产生噪声日志，也避免异常路径下槽位泄漏。
   */
  isRunning(sessionId: string): boolean {
    return this.runningTasks.has(sessionId);
  }

  /**
   * 注册一个任务开始执行（占用并发槽位）
   * 在任务实际开始执行时调用
   */
  registerRunning(sessionId: string, userId?: string): void {
    // 任务重新注册时清除终态标记，允许其再次完成（防御性，sessionId 正常唯一）
    this.terminalSessions.delete(sessionId);
    // 记录归属，供 per-user 槽位记账
    if (userId) this.sessionOwners.set(sessionId, userId);
    this.runningTasks.set(sessionId, Date.now());
    this.logger.debug(
      `任务 ${sessionId} 注册为运行中（user=${userId || '匿名'}），` +
        `该用户并发: ${this.countRunningOf(userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`,
    );
  }

  /**
   * 内部统一释放入口：同时清理运行记录与归属记录。
   * 所有释放路径都必须走这里，否则 sessionOwners 泄漏会让 per-user 计数只增不减。
   */
  private releaseSlotInternal(sessionId: string): boolean {
    this.sessionOwners.delete(sessionId);
    return this.runningTasks.delete(sessionId);
  }

  /**
   * 刷新运行中任务的心跳时间戳：任务有进度更新时调用，
   * 防止正常长任务被幽灵任务健康检查误杀。
   */
  touchRunning(sessionId: string): void {
    if (this.runningTasks.has(sessionId)) {
      this.runningTasks.set(sessionId, Date.now());
    }
  }

  /**
   * 标记任务执行完成，释放并发槽位，自动调度下一个等待任务
   * 在任务成功完成时由控制器/服务调用
   */
  async markTaskCompleted(sessionId: string): Promise<void> {
    // 幂等保护：同一 sessionId 的完成通知只处理一次（progress.service 与 controller 收尾会重复调用）
    if (this.terminalSessions.has(sessionId)) {
      this.logger.debug(`任务 ${sessionId} 已完成过（幂等跳过），忽略重复完成通知`);
      return;
    }
    this.markTerminal(sessionId);

    // 🔒 无论后续调度是否异常，都必须释放槽位（delete 幂等，重复调用无副作用）
    const wasRunning = this.releaseSlotInternal(sessionId);
    this.logger.log(
      `任务 ${sessionId} 已完成，释放并发槽位（${wasRunning ? '已释放' : '未找到条目'}），当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`,
    );

    // 尝试调度等待队列中的任务（异常不影响槽位释放）
    try {
      await this.scheduleNextWaiting();
    } catch (err: any) {
      this.logger.error(`[markTaskCompleted] 调度等待任务异常: ${err.message}`, err.stack);
    }
  }

  /**
   * 标记任务失败，释放并发槽位，自动调度下一个等待任务
   * 在任务执行失败时由控制器/服务调用
   */
  async markTaskFailed(sessionId: string): Promise<void> {
    // 幂等保护：同一 sessionId 的失败通知只处理一次
    if (this.terminalSessions.has(sessionId)) {
      this.logger.debug(`任务 ${sessionId} 已终态过（幂等跳过），忽略重复失败通知`);
      return;
    }
    this.markTerminal(sessionId);

    // 🔒 无论后续调度是否异常，都必须释放槽位（delete 幂等，重复调用无副作用）
    const wasRunning = this.releaseSlotInternal(sessionId);
    this.logger.log(
      `任务 ${sessionId} 失败，释放并发槽位（${wasRunning ? '已释放' : '未找到条目'}），当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`,
    );

    // 尝试调度等待队列中的任务（异常不影响槽位释放）
    try {
      await this.scheduleNextWaiting();
    } catch (err: any) {
      this.logger.error(`[markTaskFailed] 调度等待任务异常: ${err.message}`, err.stack);
    }
  }

  /**
   * 释放指定任务的并发槽位（不改变任务状态）
   * 用于 pauseTask / cancelTask 场景：任务仍在 runningTasks 中，需要释放槽位让排队任务顶上
   */
  async releaseSlot(sessionId: string): Promise<void> {
    this.logger.log(`[releaseSlot] 尝试释放任务 ${sessionId} 的槽位，当前 runningTasks: ${Array.from(this.runningTasks.keys()).join(',')}`);
    const deleted = this.releaseSlotInternal(sessionId);
    if (deleted) {
      this.logger.log(`[releaseSlot] ✅ 任务 ${sessionId} 释放成功，当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}，开始调度等待任务`);
    } else {
      this.logger.warn(`[releaseSlot] ❌ 任务 ${sessionId} 不在 runningTasks 中，无法释放。当前 runningTasks: ${Array.from(this.runningTasks.keys()).join(',') || '(空)'}`);
    }

    if (this.getAvailableSlots() > 0 && this.waitingQueue.size > 0) {
      await this.scheduleNextWaiting();
    }
  }

  /**
   * 重新注册为运行中（占用一个并发槽位）
   * 用于 resumeTask 场景：恢复暂停的任务，重新进入运行队列
   * @returns true=已注册为运行中, false=槽位不足未注册
   */
  tryReRegister(sessionId: string, userId?: string): boolean {
    if (this.getAvailableSlots(userId) <= 0) {
      this.logger.debug(`任务 ${sessionId} 恢复时无可用槽位，将排队等待`);
      return false;
    }
    this.registerRunning(sessionId, userId);
    this.logger.log(
      `任务 ${sessionId} 恢复运行，重新注册并发槽位（user=${userId || '匿名'}），` +
        `该用户并发: ${this.countRunningOf(userId)}/${this.MAX_CONCURRENT}`,
    );
    return true;
  }

  // ─── 入队/出队 ───────────────────────────────────

  /**
   * 将任务加入等待队列
   * 当并发槽位已满或配额不足时调用
   * @param taskData 任务数据
   * @param reason 入队原因
   * @param executeFn 任务被调度时的执行函数（必须传入，否则排队任务永远无法开始）
   */
  async enqueue(
    taskData: Pick<Task, 'sessionId' | 'componentId'> & Partial<Task>, 
    reason: 'concurrency_full' | 'quota_exceeded' | 'retry_scheduled' = 'concurrency_full',
    executeFn?: () => Promise<void>,
  ): Promise<{ success: boolean; queuePosition: number; message: string }> {
    // 构造完整的 Task 对象
    const task: Task = {
      status: 'queued',
      startTime: Date.now(),
      progress: [],
      progressCount: 0,
      buffer: [],
      componentName: '',
      nodeId: '',
      fileKey: '',
      panelKey: 'default-panel',
      ...taskData,
    } as Task;

    // 绑定执行函数（队列调度时调用）
    if (executeFn) {
      task.executeFn = executeFn;
      // 同时注册到持久化 registry，供 resumeTask 等场景查找
      this.executeFnRegistry.set(task.sessionId, executeFn);
    }

    // 检查队列容量
    if (this.waitingQueue.size >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`等待队列已满，拒绝入队: ${task.sessionId}`);
      return {
        success: false,
        queuePosition: -1,
        message: '等待队列已满，请稍后再试',
      };
    }

    const now = Date.now();
    task.status = 'queued';
    task.enqueuedAt = now;

    if (reason === 'retry_scheduled') {
      const retryCount = (task.retryCount || 0) + 1;
      task.retryCount = retryCount;
      const backoffIndex = Math.min(retryCount - 1, this.RETRY_BACKOFF_SECONDS.length - 1);
      const backoffMs = this.RETRY_BACKOFF_SECONDS[backoffIndex] * 1000;
      task.nextRetryAt = now + backoffMs;
    }
    
    // 加入等待队列
    this.waitingQueue.set(task.sessionId, task);
    
    // 计算队列位置
    const position = this.calculateQueuePosition(task.sessionId);
    
    this.logger.log(`任务入队等待: ${task.sessionId}, 原因: ${reason}, 位置: ${position}, 当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`);

    if (this.getAvailableSlots() > 0) {
      await this.scheduleNextWaiting();
    }
    
    return {
      success: true,
      queuePosition: position,
      message: `当前 ${this.runningTasks.size} 个任务正在执行中，您的任务排在第 ${position} 位，等待前面的任务完成后自动开始`,
    };
  }

  /**
   * 从等待队列中移除任务（用户取消）
   */
  dequeue(sessionId: string): boolean {
    const removed = this.waitingQueue.delete(sessionId);
    if (removed) {
      this.logger.log(`任务从等待队列移除: ${sessionId}`);
    }
    return removed;
  }

  // ─── 查询接口 ───────────────────────────────────

  /**
   * 查询任务在等待队列中的状态
   */
  getQueueStatus(sessionId: string): {
    inQueue: boolean;
    position?: number;
    status?: TaskStatus;
    enqueuedAt?: number;
    waitTime?: number;
    nextRetryAt?: number;
    retryCount?: number;
  } {
    const task = this.waitingQueue.get(sessionId);
    if (!task) {
      return { inQueue: false };
    }

    return {
      inQueue: true,
      position: this.calculateQueuePosition(sessionId),
      status: task.status,
      enqueuedAt: task.enqueuedAt,
      waitTime: Date.now() - (task.enqueuedAt || Date.now()),
      nextRetryAt: task.nextRetryAt,
      retryCount: task.retryCount,
    };
  }

  /**
   * 获取整个等待队列的快照
   */
  getQueueSnapshot(): Array<{
    sessionId: string;
    userId?: string;
    status: TaskStatus;
    position: number;
    waitTime: number;
    componentName?: string;
  }> {
    const snapshot: Array<{
      sessionId: string;
      userId?: string;
      status: TaskStatus;
      position: number;
      waitTime: number;
      componentName?: string;
    }> = [];

    const now = Date.now();
    for (const [sessionId, task] of this.waitingQueue.entries()) {
      snapshot.push({
        sessionId,
        userId: task.userId,
        status: task.status,
        position: this.calculateQueuePosition(sessionId),
        waitTime: now - (task.enqueuedAt || now),
        componentName: task.componentName,
      });
    }

    return snapshot.sort((a, b) => a.position - b.position);
  }

  /**
   * 主动自检等待队列：如果当前有空槽，就尽可能调度任务。
   * 同时清理「幽灵任务」：注册为运行中后长时间未收到完成/失败通知的条目，
   * 强制释放槽位，避免幽灵占满并发导致等待队列永不调度。
   */
  async reconcileWaitingQueue(): Promise<void> {
    this.reapStaleRunningTasks();

    if (this.getAvailableSlots() <= 0 || this.waitingQueue.size === 0) {
      return;
    }
    await this.scheduleNextWaiting();
  }

  /**
   * 幽灵任务健康检查：清理注册后超过 RUNNING_STALE_TIMEOUT_MS 仍未完成的运行中任务。
   * 这些条目往往来自进程崩溃、回调丢失或异常路径，占着并发槽位不放。
   * 仅释放队列槽位，不改任务记录状态（任务本身由 TasksService.gc 超时标记 failed）。
   */
  private reapStaleRunningTasks(): void {
    const now = Date.now();
    for (const [sessionId, registeredAt] of this.runningTasks.entries()) {
      if (now - registeredAt > this.RUNNING_STALE_TIMEOUT_MS) {
        this.logger.warn(
          `[幽灵任务] 任务 ${sessionId} 已运行 ${Math.round((now - registeredAt) / 1000)}s 无完成通知，强制释放并发槽位`,
        );
        this.releaseSlotInternal(sessionId);
        this.logger.log(`[幽灵任务] 释放槽位后并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`);
        // 释放后立即尝试调度等待队列
        void this.scheduleNextWaiting();
      }
    }
  }

  /**
   * 手动触发指定等待任务启动。
   */
  async startQueuedTask(sessionId: string, userId?: string): Promise<{ success: boolean; message: string }> {
    const task = this.waitingQueue.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不在等待队列中，可能已启动或队列上下文已丢失' };
    }

    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权启动此任务' };
    }

    if (this.getAvailableSlots() <= 0) {
      return { success: false, message: `当前仍有 ${this.runningTasks.size} 个任务正在执行，请等待槽位释放` };
    }

    const executor = task.executeFn || this.executeFnRegistry.get(sessionId) || (this.executeCallback ?? undefined);
    if (!executor) {
      return { success: false, message: '任务缺少执行上下文，无法手动启动，请重新发起生成' };
    }

    await this.scheduleSpecificWaiting(sessionId);
    return { success: true, message: '已触发排队任务启动' };
  }

  /**
   * 获取队列统计信息
   */
  getQueueStats(): {
    totalQueued: number;
    runningCount: number;
    maxConcurrent: number;
    availableSlots: number;
    avgWaitTimeMs: number;
    maxWaitTimeMs: number;
  } {
    let totalWaitTime = 0;
    let maxWaitTime = 0;
    const now = Date.now();

    for (const task of this.waitingQueue.values()) {
      const waitTime = now - (task.enqueuedAt || now);
      totalWaitTime += waitTime;
      maxWaitTime = Math.max(maxWaitTime, waitTime);
    }

    return {
      totalQueued: this.waitingQueue.size,
      runningCount: this.runningTasks.size,
      maxConcurrent: this.MAX_CONCURRENT,
      availableSlots: this.getAvailableSlots(),
      avgWaitTimeMs: this.waitingQueue.size > 0 ? totalWaitTime / this.waitingQueue.size : 0,
      maxWaitTimeMs: maxWaitTime,
    };
  }

  /**
   * 取消等待队列中的任务
   */
  cancelQueuedTask(sessionId: string, userId: string): { success: boolean; message: string } {
    const task = this.waitingQueue.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不在等待队列中' };
    }

    if (task.userId !== userId) {
      return { success: false, message: '无权取消此任务' };
    }

    this.waitingQueue.delete(sessionId);
    this.logger.log(`等待队列任务已取消: ${sessionId}`);
    
    return { success: true, message: '任务已从等待队列中取消' };
  }

  // ─── 内部调度 ───────────────────────────────────

  private async scheduleSpecificWaiting(sessionId: string): Promise<void> {
    const task = this.waitingQueue.get(sessionId);
    if (!task) return;

    this.waitingQueue.delete(sessionId);
    this.registerRunning(sessionId, task.userId);

    this.logger.log(
      `手动调度等待任务 ${sessionId} 开始执行（user=${task.userId || '匿名'}），` +
        `该用户并发: ${this.countRunningOf(task.userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`,
    );

    const executor: (() => Promise<void>) | undefined =
      task.executeFn || this.executeFnRegistry.get(sessionId) || (this.executeCallback ?? undefined);
    if (executor) {
      try {
        await executor();
        this.logger.log(`等待任务 ${sessionId} 已触发执行函数`);
      } catch (error) {
        this.logger.error(`调度等待任务失败: ${sessionId}`, error);
        this.releaseSlotInternal(sessionId);
        task.status = 'queued';
        task.enqueuedAt = Date.now();
        this.waitingQueue.set(sessionId, task);
        await this.scheduleNextWaiting();
      }
    } else {
      this.logger.warn(`任务 ${sessionId} 既无 executeFn 也无全局回调，无法调度`);
      this.releaseSlotInternal(sessionId);
      this.waitingQueue.set(sessionId, task);
    }
  }

  /**
   * 尝试调度等待队列中的下一个任务
   * 在任务完成/失败释放槽位后调用
   */
  /**
   * 从等待队列调度下一个任务（循环填满所有空槽）。
   * 按优先级 > 入队时间排序，取出最高优先级的任务执行。
   */
  /**
   * 重新尝试调度所有「排队中」任务。
   * 返回本轮调度的数量与剩余等待数，供手动 dispatch 端点读取。
   */
  async scheduleNextWaiting(): Promise<{ dispatched: number; remaining: number }> {
    let scheduledCount = 0;
    if (this.waitingQueue.size === 0) {
      return { dispatched: 0, remaining: 0 };
    }

    // 快照 + 排序（优先级降序 → 入队时间升序），per-user 场景下逐个判定槽位
    const candidates = [...this.waitingQueue.values()].sort((a, b) => {
      const pa = a.queuePriority || 0;
      const pb = b.queuePriority || 0;
      if (pa !== pb) return pb - pa;
      return (a.enqueuedAt || 0) - (b.enqueuedAt || 0);
    });

    for (const task of candidates) {
      const sessionId = task.sessionId;
      // 本轮中该任务可能已被移除（并发调度/取消）
      if (!this.waitingQueue.has(sessionId)) continue;

      // 全局天花板：到顶就停止本轮调度
      if (this.runningTasks.size >= this.GLOBAL_MAX_CONCURRENT) {
        this.logger.debug(
          `[scheduleNextWaiting] 全局并发到顶 ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}，停止本轮调度`,
        );
        break;
      }

      // 🔑 per-user 槽位：该用户自己的槽满了就跳过，**继续尝试后面的其他用户任务**，
      // 不能像全局模型那样直接 break —— 否则 A 用户占满会堵死所有人的排队任务。
      if (this.getAvailableSlots(task.userId) <= 0) {
        this.logger.debug(
          `[scheduleNextWaiting] 用户 ${task.userId || '匿名'} 槽位已满，任务 ${sessionId} 继续等待`,
        );
        continue;
      }

      // 从等待队列移除，注册为运行中（同时记录归属）
      this.waitingQueue.delete(sessionId);
      this.registerRunning(sessionId, task.userId);

      this.logger.log(
        `调度等待任务 ${sessionId} 开始执行（user=${task.userId || '匿名'}），` +
          `该用户并发: ${this.countRunningOf(task.userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`,
      );

      // 优先用任务自带的 executeFn，其次用 registry，最后用全局回调
      const executor: (() => Promise<void>) | undefined =
        task.executeFn || this.executeFnRegistry.get(sessionId) || (this.executeCallback ?? undefined);

      if (executor) {
        try {
          await executor();
          scheduledCount++;
          this.logger.log(`等待任务 ${sessionId} 已触发执行函数`);
        } catch (error) {
          this.logger.error(`调度等待任务失败: ${sessionId}`, error);
          this.releaseSlotInternal(sessionId);
          // 🔒 清除终态标记，否则下次该任务再失败时 markTaskFailed 会因幂等保护跳过槽位释放
          this.terminalSessions.delete(sessionId);
          task.status = 'queued';
          task.enqueuedAt = Date.now();
          this.waitingQueue.set(sessionId, task);
          // per-user 模型下单个任务失败不应堵死其他用户，继续尝试下一个候选
          continue;
        }
      } else {
        this.logger.warn(`任务 ${sessionId} 既无 executeFn 也无全局回调，无法调度`);
        this.releaseSlotInternal(sessionId);
        this.terminalSessions.delete(sessionId);
        this.waitingQueue.set(sessionId, task);
        continue;
      }
    }

    if (scheduledCount > 0) {
      this.logger.log(`[scheduleNextWaiting] 本轮共调度 ${scheduledCount} 个等待任务`);
    }

    return { dispatched: scheduledCount, remaining: this.waitingQueue.size };
  }

  /**
   * 计算任务在等待队列中的位置
   */
  private calculateQueuePosition(sessionId: string): number {
    const task = this.waitingQueue.get(sessionId);
    if (!task) return -1;

    const taskPriority = task.queuePriority || 0;
    const taskEnqueuedAt = task.enqueuedAt || Date.now();
    
    let position = 1;
    for (const [otherId, otherTask] of this.waitingQueue.entries()) {
      if (otherId === sessionId) continue;
      
      const otherPriority = otherTask.queuePriority || 0;
      const otherEnqueuedAt = otherTask.enqueuedAt || Date.now();
      
      // 优先级高的在前，优先级相同则先入队的在前
      if (otherPriority > taskPriority || 
          (otherPriority === taskPriority && otherEnqueuedAt < taskEnqueuedAt)) {
        position++;
      }
    }
    
    return position;
  }
}
