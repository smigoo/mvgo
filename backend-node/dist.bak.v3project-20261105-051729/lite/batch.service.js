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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const tasks_service_1 = require("../tasks/tasks.service");
const backend_root_1 = require("../config/backend-root");
const quota_service_1 = require("../quota/quota.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const MAX_PERSISTED_BATCHES = 200;
const ZOMBIE_BATCH_TIMEOUT = 2 * 60 * 60 * 1000;
let BatchService = BatchService_1 = class BatchService {
    tasksService;
    quotaService;
    queueService;
    logger = new common_1.Logger(BatchService_1.name);
    batches = new Map();
    persistFile;
    persistInFlight = null;
    persistAgain = false;
    constructor(tasksService, quotaService, queueService) {
        this.tasksService = tasksService;
        this.quotaService = quotaService;
        this.queueService = queueService;
        this.persistFile = (0, path_1.join)(backend_root_1.dataDir, 'batches.json');
        this.logger.log('BatchService 初始化');
    }
    onModuleInit() {
        this.loadFromDisk();
        this.autoRecoverBatches();
        setInterval(() => {
            if (this.batches.size > 0)
                this.persist();
        }, 30 * 1000);
        process.on('SIGTERM', () => {
            this.persist();
        });
        process.on('SIGINT', () => {
            this.persist();
        });
    }
    loadFromDisk() {
        try {
            if (!(0, fs_1.existsSync)(this.persistFile)) {
                if ((0, fs_1.existsSync)(this.persistFile + '.tmp')) {
                    const tmpRaw = (0, fs_1.readFileSync)(this.persistFile + '.tmp', 'utf-8');
                    if (tmpRaw && tmpRaw.trim()) {
                        require('fs').renameSync(this.persistFile + '.tmp', this.persistFile);
                    }
                }
                else {
                    return;
                }
            }
            const raw = (0, fs_1.readFileSync)(this.persistFile, 'utf-8');
            if (!raw || raw.trim() === '')
                return;
            const list = JSON.parse(raw);
            if (!Array.isArray(list))
                return;
            for (const batch of list) {
                if (!batch || !batch.batchId)
                    continue;
                this.batches.set(batch.batchId, batch);
            }
            this.logger.log(`从磁盘加载 ${this.batches.size} 个批次记录`);
        }
        catch (err) {
            this.logger.warn(`加载批次记录失败: ${err.message}`);
        }
    }
    persist() {
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
    async flushPersist() {
        try {
            const list = Array.from(this.batches.values())
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, MAX_PERSISTED_BATCHES);
            const dir = (0, path_1.join)(this.persistFile, '..');
            if (!(0, fs_1.existsSync)(dir)) {
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            }
            const tmpFile = `${this.persistFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
            const json = JSON.stringify(list, null, 2);
            (0, fs_1.writeFileSync)(tmpFile, json, 'utf-8');
            try {
                require('fs').renameSync(tmpFile, this.persistFile);
            }
            catch (renameErr) {
                if (renameErr?.code !== 'EPERM' && renameErr?.code !== 'EBUSY')
                    throw renameErr;
                (0, fs_1.writeFileSync)(this.persistFile, json, 'utf-8');
                try {
                    require('fs').unlinkSync(tmpFile);
                }
                catch { }
                this.logger.warn(`持久化批次记录：rename ${renameErr.code}，已降级为直写`);
            }
        }
        catch (err) {
            this.logger.warn(`持久化批次记录失败: ${err.message}`);
        }
    }
    autoRecoverBatches() {
        const now = Date.now();
        let recoveredCount = 0;
        for (const [batchId, batch] of this.batches) {
            if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
                continue;
            }
            if (now - batch.updatedAt > ZOMBIE_BATCH_TIMEOUT) {
                batch.status = 'failed';
                batch.updatedAt = now;
                this.logger.warn(`僵尸批次已标记失败: ${batchId}`);
                continue;
            }
            let itemRecovered = 0;
            for (const item of batch.items) {
                if (item.status === 'running' ||
                    item.status === 'queued' ||
                    item.status === 'rate_limited' ||
                    item.status === 'retry_scheduled') {
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
    async createBatch(userId, items) {
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();
        const batchItems = items.map((item, index) => {
            const typePrefix = item.componentType === 'microcode' ? 'mc' : 'mv';
            const tierSuffix = item.generationTier === 'lite' ? 'lite' : 'max';
            const sessionId = `${typePrefix}-${tierSuffix}-${Date.now() + index}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
            return {
                sessionId,
                itemId: item.itemId,
                status: 'pending',
                idempotencyKey: this.generateIdempotencyKey(batchId, item.itemId),
                attemptCount: 0,
            };
        });
        const record = {
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
    async getBatch(batchId) {
        return this.batches.get(batchId) || null;
    }
    async markItemCompleted(batchId, sessionId) {
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
    async markItemFailed(batchId, sessionId, error) {
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
        if (item.status === 'completed') {
            this.logger.debug(`子任务已完成，跳过失败标记: ${sessionId}`);
            return;
        }
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
    async markItemQueued(batchId, sessionId) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return;
        const item = batch.items.find(i => i.sessionId === sessionId);
        if (!item)
            return;
        if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
            return;
        item.status = 'queued';
        item.nextRetryAt = undefined;
        batch.updatedAt = Date.now();
        this.persist();
    }
    async markItemRunning(batchId, sessionId) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return;
        const item = batch.items.find(i => i.sessionId === sessionId);
        if (!item)
            return;
        if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
            return;
        item.status = 'running';
        item.nextRetryAt = undefined;
        batch.updatedAt = Date.now();
        this.persist();
    }
    async markItemRateLimited(batchId, sessionId, reason, quotaResetAt) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return;
        const item = batch.items.find(i => i.sessionId === sessionId);
        if (!item)
            return;
        if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
            return;
        item.status = 'rate_limited';
        item.rateLimitReason = reason;
        item.nextRetryAt = quotaResetAt;
        batch.updatedAt = Date.now();
        this.persist();
        this.logger.log(`子任务限流: ${sessionId}, 原因: ${reason}, 恢复时间: ${quotaResetAt ? new Date(quotaResetAt).toISOString() : '未知'}`);
    }
    async markItemRetryScheduled(batchId, sessionId, retryAt) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return;
        const item = batch.items.find(i => i.sessionId === sessionId);
        if (!item)
            return;
        if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
            return;
        item.status = 'retry_scheduled';
        item.nextRetryAt = retryAt;
        item.attemptCount++;
        batch.updatedAt = Date.now();
        this.persist();
        this.logger.log(`子任务重试已调度: ${sessionId}, 重试时间: ${new Date(retryAt).toISOString()}, 尝试次数: ${item.attemptCount}`);
    }
    async getUserBatches(userId) {
        const batches = [];
        for (const batch of this.batches.values()) {
            if (batch.userId === userId) {
                batches.push(batch);
            }
        }
        return batches.sort((a, b) => b.createdAt - a.createdAt);
    }
    async getBatchesAwaitingRecovery() {
        const batches = [];
        for (const batch of this.batches.values()) {
            if (batch.status === 'awaiting_recovery') {
                batches.push(batch);
            }
        }
        return batches;
    }
    async cancelBatch(batchId, userId) {
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
        for (const item of batch.items) {
            if (item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled') {
                item.status = 'cancelled';
                item.nextRetryAt = undefined;
                if (this.queueService) {
                    this.queueService.dequeue(item.sessionId);
                }
            }
        }
        this.persist();
        this.logger.log(`批次已取消: ${batchId}`);
        return { success: true, message: '批次已取消' };
    }
    async resumeBatch(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch) {
            return { success: false, message: '批次不存在', resumedItems: 0 };
        }
        if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
            return { success: false, message: `批次状态为 ${batch.status}，无法恢复`, resumedItems: 0 };
        }
        let resumedCount = 0;
        for (const item of batch.items) {
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
    getPendingItems(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return [];
        return batch.items.filter(i => i.status === 'pending');
    }
    isItemCompleted(batchId, sessionId) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return false;
        const item = batch.items.find(i => i.sessionId === sessionId);
        return item?.status === 'completed';
    }
    updateBatchSummaryStatus(batch) {
        const total = batch.totalItems;
        const completed = batch.completedItems;
        const failed = batch.failedItems;
        const processed = completed + failed;
        if (processed === total) {
            if (completed === total) {
                batch.status = 'completed';
                batch.completedAt = Date.now();
            }
            else if (completed === 0) {
                batch.status = 'failed';
                batch.completedAt = Date.now();
            }
            else {
                batch.status = 'partially_completed';
                batch.completedAt = Date.now();
            }
        }
        else if (processed > 0) {
            batch.status = 'running';
        }
    }
    async pauseBatch(batchId, userId) {
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
            this.persist();
        }
        this.logger.log(`批次暂停: ${batchId}, 暂停 ${pausedCount} 个子项`);
        return { success: true, message: `已暂停 ${pausedCount} 个子项` };
    }
    async retryFailedItems(batchId, userId) {
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
            batch.failedItems = Math.max(0, batch.failedItems - retryCount);
            batch.status = 'running';
            batch.updatedAt = Date.now();
            this.persist();
        }
        this.logger.log(`批次重试失败项: ${batchId}, 重试 ${retryCount} 个子项`);
        return { success: true, message: `已重置 ${retryCount} 个失败子项，等待重新执行`, retryCount };
    }
    generateIdempotencyKey(batchId, itemId) {
        return `${batchId}:${itemId}`;
    }
};
exports.BatchService = BatchService;
exports.BatchService = BatchService = BatchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => quota_service_1.QuotaService))),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => task_queue_service_1.TaskQueueService))),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        quota_service_1.QuotaService,
        task_queue_service_1.TaskQueueService])
], BatchService);
//# sourceMappingURL=batch.service.js.map