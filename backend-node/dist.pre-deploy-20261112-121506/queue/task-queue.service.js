"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TaskQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueueService = void 0;
const common_1 = require("@nestjs/common");
const quota_service_1 = require("../quota/quota.service");
let TaskQueueService = TaskQueueService_1 = class TaskQueueService {
    quotaService;
    logger = new common_1.Logger(TaskQueueService_1.name);
    MAX_QUEUE_SIZE = 100;
    MAX_CONCURRENT = TaskQueueService_1.resolveMaxConcurrent();
    GLOBAL_MAX_CONCURRENT = TaskQueueService_1.resolveGlobalMaxConcurrent();
    static resolveGlobalMaxConcurrent() {
        const raw = process.env.TASK_GLOBAL_MAX_CONCURRENT;
        const parsed = Number.parseInt(raw ?? '', 10);
        const perUser = TaskQueueService_1.resolveMaxConcurrent();
        if (!Number.isFinite(parsed) || parsed < 1)
            return Math.max(10, perUser);
        return Math.max(parsed, perUser);
    }
    RETRY_BACKOFF_SECONDS = [30, 60, 120, 300, 600];
    waitingQueue = new Map();
    runningTasks = new Map();
    sessionOwners = new Map();
    RUNNING_STALE_TIMEOUT_MS = 10 * 60 * 1000;
    executeFnRegistry = new Map();
    executeCallback = null;
    taskFailedCallback = null;
    restoreExecutors = [];
    reconcileTimer;
    terminalSessions = new Set();
    TERMINAL_SESSIONS_MAX = 10000;
    markTerminal(sessionId) {
        this.terminalSessions.add(sessionId);
        if (this.terminalSessions.size > this.TERMINAL_SESSIONS_MAX) {
            const toRemove = Math.floor(this.terminalSessions.size / 2);
            let count = 0;
            for (const sid of this.terminalSessions) {
                if (count++ >= toRemove)
                    break;
                this.terminalSessions.delete(sid);
            }
        }
    }
    static resolveMaxConcurrent() {
        const raw = process.env.TASK_MAX_CONCURRENT;
        const parsed = Number.parseInt(raw ?? '', 10);
        if (!Number.isFinite(parsed) || parsed < 1)
            return 2;
        return Math.min(parsed, 10);
    }
    constructor(quotaService) {
        this.quotaService = quotaService;
        const raw = process.env.TASK_MAX_CONCURRENT;
        this.logger.log(`TaskQueueService 初始化完成，最大并发: ${this.MAX_CONCURRENT}` +
            (raw ? `（来自 TASK_MAX_CONCURRENT=${raw}）` : '（默认值，可用 TASK_MAX_CONCURRENT 覆盖）'));
    }
    onModuleInit() {
        this.reconcileTimer = setInterval(() => {
            void this.reconcileWaitingQueue();
        }, 5000);
        void this.reconcileWaitingQueue();
    }
    onModuleDestroy() {
        if (this.reconcileTimer) {
            clearInterval(this.reconcileTimer);
            this.reconcileTimer = undefined;
        }
    }
    onExecute(callback) {
        this.executeCallback = callback;
    }
    registerExecuteFn(sessionId, fn) {
        this.executeFnRegistry.set(sessionId, fn);
    }
    onTaskFailed(callback) {
        this.taskFailedCallback = callback;
    }
    unregisterExecuteFn(sessionId) {
        this.executeFnRegistry.delete(sessionId);
    }
    registerRestoreExecutor(fn) {
        this.restoreExecutors.push(fn);
        this.logger.log(`恢复执行器已注册（当前 ${this.restoreExecutors.length} 个），服务重启后排队任务可自动恢复执行`);
    }
    async restoreQueuedTask(task) {
        if (!task || !task.sessionId)
            return false;
        if (this.waitingQueue.has(task.sessionId) || this.runningTasks.has(task.sessionId))
            return true;
        if (this.waitingQueue.size >= this.MAX_QUEUE_SIZE) {
            this.logger.warn(`等待队列已满，无法恢复排队任务: ${task.sessionId}`);
            return false;
        }
        if (!task.executeFn && this.restoreExecutors.length === 0) {
            this.logger.warn(`排队任务 ${task.sessionId} 无法恢复：未注册恢复执行器`);
            return false;
        }
        task.status = 'queued';
        task.enqueuedAt = task.enqueuedAt || Date.now();
        if (!task.executeFn) {
            const executors = [...this.restoreExecutors];
            task.executeFn = async () => {
                for (const executor of executors) {
                    try {
                        if (await executor(task))
                            return;
                    }
                    catch (error) {
                        this.logger.error(`恢复执行器处理任务失败: ${task.sessionId}`, error);
                    }
                }
                this.logger.warn(`排队任务 ${task.sessionId} 恢复执行失败：所有执行器均未处理，释放槽位避免幽灵占用`);
                if (this.taskFailedCallback) {
                    const reason = !task.fileKey || !task.nodeId
                        ? '服务重启后排队任务无法恢复：缺少 Figma 文件标识（fileKey/nodeId 为空），请重新发起生成'
                        : '服务重启后排队任务无法恢复：无匹配的恢复执行器，请重新发起生成';
                    this.taskFailedCallback(task.sessionId, reason);
                }
                await this.markTaskFailed(task.sessionId);
            };
        }
        this.waitingQueue.set(task.sessionId, task);
        this.logger.log(`排队任务已从磁盘恢复入队: ${task.sessionId}，当前等待: ${this.waitingQueue.size}`);
        if (this.getAvailableSlots() > 0) {
            await this.scheduleNextWaiting();
        }
        return true;
    }
    getAvailableSlots(userId) {
        this.reapStaleRunningTasks();
        const perUser = this.MAX_CONCURRENT - this.countRunningOf(userId);
        const globalLeft = this.GLOBAL_MAX_CONCURRENT - this.runningTasks.size;
        return Math.max(0, Math.min(perUser, globalLeft));
    }
    getRunningCount(userId) {
        this.reapStaleRunningTasks();
        return this.countRunningOf(userId);
    }
    countRunningOf(userId) {
        if (!userId)
            return this.runningTasks.size;
        let n = 0;
        for (const sid of this.runningTasks.keys()) {
            if (this.sessionOwners.get(sid) === userId)
                n++;
        }
        return n;
    }
    isRunning(sessionId) {
        return this.runningTasks.has(sessionId);
    }
    registerRunning(sessionId, userId) {
        this.terminalSessions.delete(sessionId);
        if (userId)
            this.sessionOwners.set(sessionId, userId);
        this.runningTasks.set(sessionId, Date.now());
        this.logger.debug(`任务 ${sessionId} 注册为运行中（user=${userId || '匿名'}），` +
            `该用户并发: ${this.countRunningOf(userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`);
    }
    releaseSlotInternal(sessionId) {
        this.sessionOwners.delete(sessionId);
        return this.runningTasks.delete(sessionId);
    }
    touchRunning(sessionId) {
        if (this.runningTasks.has(sessionId)) {
            this.runningTasks.set(sessionId, Date.now());
        }
    }
    async markTaskCompleted(sessionId) {
        if (this.terminalSessions.has(sessionId)) {
            this.logger.debug(`任务 ${sessionId} 已完成过（幂等跳过），忽略重复完成通知`);
            return;
        }
        this.markTerminal(sessionId);
        const wasRunning = this.releaseSlotInternal(sessionId);
        this.logger.log(`任务 ${sessionId} 已完成，释放并发槽位（${wasRunning ? '已释放' : '未找到条目'}），当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`);
        try {
            await this.scheduleNextWaiting();
        }
        catch (err) {
            this.logger.error(`[markTaskCompleted] 调度等待任务异常: ${err.message}`, err.stack);
        }
    }
    async markTaskFailed(sessionId) {
        if (this.terminalSessions.has(sessionId)) {
            this.logger.debug(`任务 ${sessionId} 已终态过（幂等跳过），忽略重复失败通知`);
            return;
        }
        this.markTerminal(sessionId);
        const wasRunning = this.releaseSlotInternal(sessionId);
        this.logger.log(`任务 ${sessionId} 失败，释放并发槽位（${wasRunning ? '已释放' : '未找到条目'}），当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`);
        try {
            await this.scheduleNextWaiting();
        }
        catch (err) {
            this.logger.error(`[markTaskFailed] 调度等待任务异常: ${err.message}`, err.stack);
        }
    }
    async releaseSlot(sessionId) {
        this.logger.log(`[releaseSlot] 尝试释放任务 ${sessionId} 的槽位，当前 runningTasks: ${Array.from(this.runningTasks.keys()).join(',')}`);
        const deleted = this.releaseSlotInternal(sessionId);
        if (deleted) {
            this.logger.log(`[releaseSlot] ✅ 任务 ${sessionId} 释放成功，当前并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}，开始调度等待任务`);
        }
        else {
            this.logger.warn(`[releaseSlot] ❌ 任务 ${sessionId} 不在 runningTasks 中，无法释放。当前 runningTasks: ${Array.from(this.runningTasks.keys()).join(',') || '(空)'}`);
        }
        if (this.getAvailableSlots() > 0 && this.waitingQueue.size > 0) {
            await this.scheduleNextWaiting();
        }
    }
    tryReRegister(sessionId, userId) {
        if (this.getAvailableSlots(userId) <= 0) {
            this.logger.debug(`任务 ${sessionId} 恢复时无可用槽位，将排队等待`);
            return false;
        }
        this.registerRunning(sessionId, userId);
        this.logger.log(`任务 ${sessionId} 恢复运行，重新注册并发槽位（user=${userId || '匿名'}），` +
            `该用户并发: ${this.countRunningOf(userId)}/${this.MAX_CONCURRENT}`);
        return true;
    }
    async enqueue(taskData, reason = 'concurrency_full', executeFn) {
        const task = {
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
        };
        if (executeFn) {
            task.executeFn = executeFn;
            this.executeFnRegistry.set(task.sessionId, executeFn);
        }
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
        this.waitingQueue.set(task.sessionId, task);
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
    dequeue(sessionId) {
        const removed = this.waitingQueue.delete(sessionId);
        if (removed) {
            this.logger.log(`任务从等待队列移除: ${sessionId}`);
        }
        return removed;
    }
    getQueueStatus(sessionId) {
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
    getQueueSnapshot() {
        const snapshot = [];
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
    async reconcileWaitingQueue() {
        this.reapStaleRunningTasks();
        if (this.getAvailableSlots() <= 0 || this.waitingQueue.size === 0) {
            return;
        }
        await this.scheduleNextWaiting();
    }
    reapStaleRunningTasks() {
        const now = Date.now();
        for (const [sessionId, registeredAt] of this.runningTasks.entries()) {
            if (now - registeredAt > this.RUNNING_STALE_TIMEOUT_MS) {
                this.logger.warn(`[幽灵任务] 任务 ${sessionId} 已运行 ${Math.round((now - registeredAt) / 1000)}s 无完成通知，强制释放并发槽位`);
                this.releaseSlotInternal(sessionId);
                this.logger.log(`[幽灵任务] 释放槽位后并发: ${this.runningTasks.size}/${this.MAX_CONCURRENT}`);
                void this.scheduleNextWaiting();
            }
        }
    }
    async startQueuedTask(sessionId, userId) {
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
        const result = await this.scheduleSpecificWaiting(sessionId);
        if (!result.triggered) {
            return {
                success: false,
                message: result.reason || '任务未能进入执行，请重新发起生成',
            };
        }
        return { success: true, message: '已触发排队任务启动' };
    }
    getQueueStats(userId) {
        let totalWaitTime = 0;
        let maxWaitTime = 0;
        const now = Date.now();
        for (const task of this.waitingQueue.values()) {
            const waitTime = now - (task.enqueuedAt || now);
            totalWaitTime += waitTime;
            maxWaitTime = Math.max(maxWaitTime, waitTime);
        }
        const userRunningCount = userId ? this.countRunningOf(userId) : 0;
        const globalRunningCount = this.runningTasks.size;
        return {
            totalQueued: this.waitingQueue.size,
            runningCount: globalRunningCount,
            maxConcurrent: this.MAX_CONCURRENT,
            availableSlots: this.getAvailableSlots(userId),
            avgWaitTimeMs: this.waitingQueue.size > 0 ? totalWaitTime / this.waitingQueue.size : 0,
            maxWaitTimeMs: maxWaitTime,
            userRunningCount,
            userMaxConcurrent: this.MAX_CONCURRENT,
            globalRunningCount,
            globalMaxConcurrent: this.GLOBAL_MAX_CONCURRENT,
            queueReason: this.diagnoseQueueReason(userId),
        };
    }
    diagnoseQueueReason(userId) {
        if (!userId)
            return 'other';
        const userFull = this.countRunningOf(userId) >= this.MAX_CONCURRENT;
        const globalFull = this.runningTasks.size >= this.GLOBAL_MAX_CONCURRENT;
        if (userFull && globalFull)
            return 'both';
        if (userFull)
            return 'user_full';
        if (globalFull)
            return 'global_full';
        return 'other';
    }
    cancelQueuedTask(sessionId, userId) {
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
    async scheduleSpecificWaiting(sessionId) {
        const task = this.waitingQueue.get(sessionId);
        if (!task)
            return { triggered: false, reason: '任务已不在等待队列中' };
        this.waitingQueue.delete(sessionId);
        this.registerRunning(sessionId, task.userId);
        this.logger.log(`手动调度等待任务 ${sessionId} 开始执行（user=${task.userId || '匿名'}），` +
            `该用户并发: ${this.countRunningOf(task.userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`);
        const executor = task.executeFn || this.executeFnRegistry.get(sessionId) || (this.executeCallback ?? undefined);
        if (executor) {
            try {
                await executor();
                this.logger.log(`等待任务 ${sessionId} 已触发执行函数`);
                return { triggered: true };
            }
            catch (error) {
                this.logger.error(`调度等待任务失败: ${sessionId}`, error);
                this.releaseSlotInternal(sessionId);
                task.status = 'queued';
                task.enqueuedAt = Date.now();
                this.waitingQueue.set(sessionId, task);
                await this.scheduleNextWaiting();
                return { triggered: false, reason: '执行函数抛出异常，任务已退回队列' };
            }
        }
        else {
            this.logger.warn(`任务 ${sessionId} 既无 executeFn 也无全局回调，无法调度`);
            this.releaseSlotInternal(sessionId);
            this.waitingQueue.set(sessionId, task);
            return { triggered: false, reason: '任务缺少执行上下文，无法手动启动，请重新发起生成' };
        }
    }
    async scheduleNextWaiting() {
        let scheduledCount = 0;
        if (this.waitingQueue.size === 0) {
            return { dispatched: 0, remaining: 0 };
        }
        const candidates = [...this.waitingQueue.values()].sort((a, b) => {
            const pa = a.queuePriority || 0;
            const pb = b.queuePriority || 0;
            if (pa !== pb)
                return pb - pa;
            return (a.enqueuedAt || 0) - (b.enqueuedAt || 0);
        });
        for (const task of candidates) {
            const sessionId = task.sessionId;
            if (!this.waitingQueue.has(sessionId))
                continue;
            if (this.runningTasks.size >= this.GLOBAL_MAX_CONCURRENT) {
                this.logger.debug(`[scheduleNextWaiting] 全局并发到顶 ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}，停止本轮调度`);
                break;
            }
            if (this.getAvailableSlots(task.userId) <= 0) {
                this.logger.debug(`[scheduleNextWaiting] 用户 ${task.userId || '匿名'} 槽位已满，任务 ${sessionId} 继续等待`);
                continue;
            }
            this.waitingQueue.delete(sessionId);
            this.registerRunning(sessionId, task.userId);
            this.logger.log(`调度等待任务 ${sessionId} 开始执行（user=${task.userId || '匿名'}），` +
                `该用户并发: ${this.countRunningOf(task.userId)}/${this.MAX_CONCURRENT}，全局: ${this.runningTasks.size}/${this.GLOBAL_MAX_CONCURRENT}`);
            const executor = task.executeFn || this.executeFnRegistry.get(sessionId) || (this.executeCallback ?? undefined);
            if (executor) {
                try {
                    await executor();
                    scheduledCount++;
                    this.logger.log(`等待任务 ${sessionId} 已触发执行函数`);
                }
                catch (error) {
                    this.logger.error(`调度等待任务失败: ${sessionId}`, error);
                    this.releaseSlotInternal(sessionId);
                    this.terminalSessions.delete(sessionId);
                    task.status = 'queued';
                    task.enqueuedAt = Date.now();
                    this.waitingQueue.set(sessionId, task);
                    continue;
                }
            }
            else {
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
    calculateQueuePosition(sessionId) {
        const task = this.waitingQueue.get(sessionId);
        if (!task)
            return -1;
        const taskPriority = task.queuePriority || 0;
        const taskEnqueuedAt = task.enqueuedAt || Date.now();
        let position = 1;
        for (const [otherId, otherTask] of this.waitingQueue.entries()) {
            if (otherId === sessionId)
                continue;
            const otherPriority = otherTask.queuePriority || 0;
            const otherEnqueuedAt = otherTask.enqueuedAt || Date.now();
            if (otherPriority > taskPriority ||
                (otherPriority === taskPriority && otherEnqueuedAt < taskEnqueuedAt)) {
                position++;
            }
        }
        return position;
    }
};
exports.TaskQueueService = TaskQueueService;
exports.TaskQueueService = TaskQueueService = TaskQueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [quota_service_1.QuotaService])
], TaskQueueService);
//# sourceMappingURL=task-queue.service.js.map