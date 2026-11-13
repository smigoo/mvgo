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
var BatchController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const crypto_1 = require("crypto");
const batch_service_1 = require("./batch.service");
const tasks_service_1 = require("../tasks/tasks.service");
const progress_service_1 = require("../progress/progress.service");
const quota_service_1 = require("../quota/quota.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const lite_service_1 = require("./lite.service");
const phase2_service_1 = require("../phase2/phase2.service");
const generate_phase2_dto_1 = require("../phase2/dto/generate-phase2.dto");
const figma_url_parser_js_1 = require("../ai-engine/utils/figma-url-parser.js");
const lite_constants_1 = require("./lite.constants");
let BatchController = BatchController_1 = class BatchController {
    batchService;
    liteService;
    phase2Service;
    tasksService;
    progressService;
    quotaService;
    queueService;
    logger = new common_1.Logger(BatchController_1.name);
    constructor(batchService, liteService, phase2Service, tasksService, progressService, quotaService, queueService) {
        this.batchService = batchService;
        this.liteService = liteService;
        this.phase2Service = phase2Service;
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.quotaService = quotaService;
        this.queueService = queueService;
    }
    async preCheck(dto, req) {
        if (!dto.items || dto.items.length === 0) {
            throw new common_1.HttpException('items 不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        const requestedCount = dto.items.length;
        for (let i = 0; i < dto.items.length; i++) {
            const item = dto.items[i];
            const hasImage = !!item.imageBase64 && item.imageBase64.trim().length > 0;
            const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;
            if (!hasImage && !hasFigma) {
                throw new common_1.HttpException(`第 ${i + 1} 个 item 缺少输入数据：需要提供 imageBase64 或 figmaUrl 至少一个`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (!this.quotaService || !userId) {
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
    async generate(dto, req) {
        if (!dto.items || dto.items.length === 0) {
            throw new common_1.HttpException('items 不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        const groupId = await this.liteService.resolvePrivateGroupId(dto.groupId, userId);
        for (let i = 0; i < dto.items.length; i++) {
            const item = dto.items[i];
            const hasImage = !!item.imageBase64 && item.imageBase64.trim().length > 0;
            const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;
            if (!hasImage && !hasFigma) {
                throw new common_1.HttpException(`第 ${i + 1} 个 item 缺少输入数据：需要提供 imageBase64 或 figmaUrl 至少一个`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        let preCheckResult = null;
        let immediateCount = dto.items.length;
        let deferredCount = 0;
        let quotaResetAt;
        let nextRetryAt;
        if (this.quotaService && userId) {
            preCheckResult = await this.quotaService.preCheckBatch(userId, dto.items.length);
            immediateCount = preCheckResult.availableNow;
            deferredCount = preCheckResult.availableLater;
            if (deferredCount > 0) {
                const hourlyReset = preCheckResult.hourly?.resetAt;
                const dailyReset = preCheckResult.daily?.resetAt;
                quotaResetAt = Math.min(hourlyReset || Infinity, dailyReset || Infinity);
                if (quotaResetAt === Infinity)
                    quotaResetAt = Date.now() + 60 * 60 * 1000;
                nextRetryAt = quotaResetAt;
            }
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
        const batchResult = await this.batchService.createBatch(userId, dto.items.map(item => {
            const sourceType = item.figmaUrl ? 'figma' : 'screenshot';
            const generationTier = sourceType === 'screenshot'
                ? 'lite'
                : item.generationTier || 'max';
            return {
                itemId: item.componentName || `item-${(0, crypto_1.randomBytes)(4).toString('hex')}`,
                payload: item,
                componentType: item.componentType || 'vue3',
                generationTier,
            };
        }));
        const batchId = batchResult.batchId;
        if (deferredCount > 0) {
            const batch = await this.batchService.getBatch(batchId);
            if (batch) {
                for (let i = immediateCount; i < dto.items.length; i++) {
                    const item = batch.items[i];
                    if (item) {
                        await this.batchService.markItemRateLimited(batchId, item.sessionId, 'USER_HOURLY_QUOTA', nextRetryAt);
                    }
                }
            }
        }
        this.logger.log(`批量生成已创建: batchId=${batchId}, 立即执行 ${immediateCount}/${dto.items.length}, 延后 ${deferredCount}`);
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
    async list(req) {
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
    async getRecoverable(req) {
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
    async getBatch(batchId, req) {
        const batch = await this.batchService.getBatch(batchId);
        if (!batch) {
            throw new common_1.HttpException('批次不存在', common_1.HttpStatus.NOT_FOUND);
        }
        if (batch.userId !== req.session?.userId) {
            throw new common_1.HttpException('无权访问此批次', common_1.HttpStatus.FORBIDDEN);
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
    async cancelBatch(batchId, req) {
        const userId = req.session?.userId;
        const result = await this.batchService.cancelBatch(batchId, userId);
        if (!result.success) {
            throw new common_1.HttpException(result.message, common_1.HttpStatus.BAD_REQUEST);
        }
        return {
            success: true,
            message: result.message,
        };
    }
    async pauseBatch(batchId, req) {
        const userId = req.session?.userId;
        const result = await this.batchService.pauseBatch(batchId, userId);
        if (!result.success) {
            throw new common_1.HttpException(result.message, common_1.HttpStatus.BAD_REQUEST);
        }
        return {
            success: true,
            message: result.message,
        };
    }
    async retryFailed(batchId, req) {
        const userId = req.session?.userId;
        const batch = await this.batchService.getBatch(batchId);
        if (!batch) {
            throw new common_1.HttpException('批次不存在', common_1.HttpStatus.NOT_FOUND);
        }
        if (batch.userId !== userId) {
            throw new common_1.HttpException('无权访问此批次', common_1.HttpStatus.FORBIDDEN);
        }
        const result = await this.batchService.retryFailedItems(batchId, userId);
        if (!result.success) {
            throw new common_1.HttpException(result.message, common_1.HttpStatus.BAD_REQUEST);
        }
        if (result.retryCount > 0) {
            this.executeBatchGeneration(batchId, userId, '', batch.items.filter(i => i.status === 'pending').map((i, idx) => ({
                imageBase64: undefined,
                figmaUrl: undefined,
                componentName: i.itemId,
            }))).catch((err) => {
                this.logger.error(`失败重试执行失败 batchId=${batchId}: ${err?.message}`);
            });
        }
        return {
            success: true,
            message: result.message,
            retryCount: result.retryCount,
        };
    }
    async resumeBatch(batchId, req) {
        const userId = req.session?.userId;
        const batch = await this.batchService.getBatch(batchId);
        if (!batch) {
            throw new common_1.HttpException('批次不存在', common_1.HttpStatus.NOT_FOUND);
        }
        if (batch.userId !== userId) {
            throw new common_1.HttpException('无权访问此批次', common_1.HttpStatus.FORBIDDEN);
        }
        const result = await this.batchService.resumeBatch(batchId);
        if (!result.success) {
            throw new common_1.HttpException(result.message, common_1.HttpStatus.BAD_REQUEST);
        }
        if (result.resumedItems > 0) {
            const pendingItems = batch.items
                .filter(i => i.status === 'pending')
                .map(i => ({
                sessionId: i.sessionId,
                itemId: i.itemId,
            }));
            this.executeBatchGeneration(batchId, userId, batchId, pendingItems).catch((err) => {
                this.logger.error(`批次恢复执行失败 batchId=${batchId}: ${err?.message}`);
            });
        }
        return {
            success: true,
            message: result.message,
            resumedItems: result.resumedItems,
        };
    }
    async acquireGlobalSlot(sessionId, meta) {
        const queue = this.queueService;
        if (!queue) {
            return false;
        }
        if (queue.getAvailableSlots(meta.userId) > 0) {
            queue.registerRunning(sessionId, meta.userId);
            return true;
        }
        this.logger.log(`批量子任务等待全局并发槽位: ${sessionId}`);
        await new Promise((resolve) => {
            void queue
                .enqueue({
                sessionId,
                componentId: sessionId,
                componentName: meta.componentName || sessionId,
                groupId: meta.groupId,
                userId: meta.userId,
                target: meta.target,
                taskType: 'component',
            }, 'concurrency_full', async () => {
                resolve();
            })
                .catch((err) => {
                this.logger.error(`批量子任务入队失败 ${sessionId}: ${err?.message}，降级为直接执行`);
                resolve();
            });
        });
        return true;
    }
    async waitForTaskTerminal(sessionId, timeoutMs = 30 * 60 * 1000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const task = this.tasksService.getTask(sessionId);
            if (task?.status === 'completed')
                return;
            if (task?.status === 'failed' || task?.status === 'cancelled') {
                throw new Error(task.error || task.lastError || `Max 子任务已${task.status}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error(`Max 子任务等待超时: ${sessionId}`);
    }
    async executeBatchGeneration(batchId, userId, groupId, items) {
        this.logger.log(`开始执行批量生成: batchId=${batchId}, ${items.length} 个子项`);
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
                if (batchItem.status === 'completed') {
                    this.logger.debug(`子项已完成，跳过: ${batchItem.sessionId}`);
                    continue;
                }
                if (batchItem.status === 'cancelled') {
                    this.logger.debug(`子项已取消，跳过: ${batchItem.sessionId}`);
                    continue;
                }
                if (batchItem.status === 'rate_limited' || batchItem.status === 'retry_scheduled') {
                    if (batchItem.nextRetryAt && Date.now() < batchItem.nextRetryAt) {
                        this.logger.debug(`子项等待配额恢复，跳过: ${batchItem.sessionId}, 预计恢复: ${new Date(batchItem.nextRetryAt).toISOString()}`);
                        continue;
                    }
                    await this.batchService.markItemQueued(batchId, batchItem.sessionId);
                }
                const sessionId = batchItem.sessionId;
                let slotHeld = false;
                try {
                    await this.batchService.markItemQueued(batchId, sessionId);
                    this.progressService.sendProgress(sessionId, {
                        type: 'status',
                        status: 'queued',
                        message: '子任务排队中，等待执行...',
                        timestamp: Date.now(),
                    });
                    if (this.quotaService && userId) {
                        const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
                        if (!quotaStatus.allowed) {
                            const rateLimitReason = quotaStatus.reason === 'QUOTA_HOURLY_EXCEEDED'
                                ? 'USER_HOURLY_QUOTA'
                                : 'USER_DAILY_QUOTA';
                            this.logger.warn(`子任务配额不足: sessionId=${sessionId}, reason=${rateLimitReason}`);
                            await this.batchService.markItemRateLimited(batchId, sessionId, rateLimitReason, quotaStatus.quotaResetAt);
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
                    if (!this.tasksService.getTask(sessionId)) {
                        this.tasksService.createTask(sessionId, {
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
                        }, 'queued');
                    }
                    else {
                        this.tasksService.updateTask(sessionId, { status: 'queued' });
                    }
                    slotHeld = await this.acquireGlobalSlot(sessionId, {
                        componentName: item.componentName,
                        groupId,
                        userId,
                        target: item.componentType || 'vue3',
                    });
                    const latestItem = (await this.batchService.getBatch(batchId))?.items[index];
                    if (latestItem?.status === 'cancelled') {
                        this.logger.log(`子项在等待槽位期间被取消，跳过执行: ${sessionId}`);
                        continue;
                    }
                    await this.batchService.markItemRunning(batchId, sessionId);
                    this.progressService.sendProgress(sessionId, {
                        type: 'status',
                        status: 'running',
                        message: '子任务开始执行...',
                        timestamp: Date.now(),
                    });
                    this.tasksService.updateTask(sessionId, { status: 'running' });
                    const hasFigma = !!item.figmaUrl && item.figmaUrl.trim().length > 0;
                    const sourceType = hasFigma ? 'figma' : 'screenshot';
                    const generationTier = sourceType === 'screenshot'
                        ? 'lite'
                        : item.generationTier || 'max';
                    if (generationTier === 'max') {
                        const parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(item.figmaUrl);
                        if (!parsed.fileKey || !parsed.nodeId) {
                            throw new Error('Max 完整生成需要包含 node-id 的有效 Figma 链接');
                        }
                        const phase2Dto = new generate_phase2_dto_1.GeneratePhase2Dto();
                        phase2Dto.componentName = item.componentName || sessionId;
                        phase2Dto.componentId = sessionId;
                        phase2Dto.fileKey = parsed.fileKey;
                        phase2Dto.nodeId = parsed.nodeId;
                        phase2Dto.groupId = groupId;
                        phase2Dto.target = item.componentType || 'vue3';
                        phase2Dto.previewToken = item.previewToken;
                        await this.phase2Service.startGeneration(sessionId, phase2Dto, groupId, userId);
                        this.tasksService.updateTask(sessionId, {
                            generationTier: 'max',
                            sourceType: 'figma',
                        });
                        await this.waitForTaskTerminal(sessionId);
                    }
                    else {
                        await this.liteService.startGeneration(sessionId, {
                            imageBase64: item.imageBase64,
                            figmaUrl: item.figmaUrl,
                            componentName: item.componentName,
                            componentType: item.componentType,
                            generationTier: 'lite',
                            groupId,
                            config: item.config,
                            requirementDoc: item.requirementDoc,
                            panelType: item.panelType,
                        }, groupId, userId, {
                            sourceType,
                            componentType: item.componentType || 'vue3',
                            generationTier: 'lite',
                        });
                    }
                    await this.batchService.markItemCompleted(batchId, sessionId);
                    if (this.quotaService && userId) {
                        await this.quotaService.recordSuccess(userId, sessionId);
                    }
                    this.logger.log(`子任务完成: sessionId=${sessionId}, itemId=${batchItem.itemId}`);
                }
                catch (err) {
                    this.logger.error(`子任务失败: sessionId=${sessionId}, error=${err?.message}`);
                    await this.batchService.markItemFailed(batchId, sessionId, err?.message || '未知错误');
                    this.tasksService.updateTask(sessionId, {
                        status: 'failed',
                        lastError: err?.message || '未知错误',
                    });
                    this.progressService.sendError(sessionId, {
                        code: lite_constants_1.LiteErrorCode.INTERNAL_ERROR,
                        message: err?.message || lite_constants_1.LITE_ERROR_MESSAGES[lite_constants_1.LiteErrorCode.INTERNAL_ERROR],
                    });
                }
                finally {
                    if (slotHeld && this.queueService?.isRunning(sessionId)) {
                        await this.queueService.releaseSlot(sessionId);
                    }
                }
            }
        };
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => executeNext());
        await Promise.all(workers);
        const batch = await this.batchService.getBatch(batchId);
        if (batch) {
            const statusCount = { completed: 0, failed: 0, rate_limited: 0, pending: 0, cancelled: 0, paused: 0, other: 0 };
            const attentionItems = [];
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
                if (statusCount[item.status] !== undefined) {
                    statusCount[item.status]++;
                }
                else {
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
};
exports.BatchController = BatchController;
__decorate([
    (0, common_1.Post)('pre-check'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "preCheck", null);
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "generate", null);
__decorate([
    (0, common_1.Get)('list'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('recoverable'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "getRecoverable", null);
__decorate([
    (0, common_1.Get)(':batchId'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "getBatch", null);
__decorate([
    (0, common_1.Post)(':batchId/cancel'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "cancelBatch", null);
__decorate([
    (0, common_1.Post)(':batchId/pause'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "pauseBatch", null);
__decorate([
    (0, common_1.Post)(':batchId/retry-failed'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "retryFailed", null);
__decorate([
    (0, common_1.Post)(':batchId/resume'),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BatchController.prototype, "resumeBatch", null);
exports.BatchController = BatchController = BatchController_1 = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('lite/batch'),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)(quota_service_1.QuotaService)),
    __param(6, (0, common_1.Optional)()),
    __param(6, (0, common_1.Inject)(task_queue_service_1.TaskQueueService)),
    __metadata("design:paramtypes", [batch_service_1.BatchService,
        lite_service_1.LiteService,
        phase2_service_1.Phase2Service,
        tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        quota_service_1.QuotaService,
        task_queue_service_1.TaskQueueService])
], BatchController);
//# sourceMappingURL=batch.controller.js.map