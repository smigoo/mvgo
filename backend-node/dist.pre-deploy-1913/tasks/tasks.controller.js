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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const tasks_service_1 = require("./tasks.service");
const task_code_snapshot_service_1 = require("./task-code-snapshot.service");
const snapshot_quality_service_1 = require("./snapshot-quality.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const backend_root_js_1 = require("../config/backend-root.js");
let TasksController = class TasksController {
    tasksService;
    queueService;
    taskCodeSnapshotService;
    snapshotQualityService;
    constructor(tasksService, queueService, taskCodeSnapshotService, snapshotQualityService) {
        this.tasksService = tasksService;
        this.queueService = queueService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
        this.snapshotQualityService = snapshotQualityService;
    }
    getAllTasks(userId, limit, full) {
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
    getTaskSummary(userId) {
        const summary = this.tasksService.getTaskSummary(userId);
        return {
            success: true,
            summary,
        };
    }
    getRecentTasks(limit, userId) {
        const parsedLimit = Number.parseInt(limit || '', 10);
        const safeLimit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 20)
            : 3;
        const tasks = this.tasksService.getAllTasks(userId, { limit: safeLimit, slim: true });
        return {
            success: true,
            tasks,
            count: tasks.length,
        };
    }
    getTaskStatus(sessionId, userId) {
        return this.tasksService.getTaskStatus(sessionId, userId);
    }
    resolveSessionByComponentId(componentId) {
        if (!componentId) {
            throw new common_1.HttpException('Missing componentId query param', common_1.HttpStatus.BAD_REQUEST);
        }
        const task = this.tasksService.getTaskByComponentId(componentId);
        if (!task?.sessionId) {
            return { success: false, sessionId: null, error: `No task found for componentId ${componentId}` };
        }
        return { success: true, sessionId: task.sessionId };
    }
    resolveSnapshotSessionId(id, userId) {
        if (this.tasksService.getTaskStatus(id, userId).success)
            return id;
        const byComponent = this.tasksService.getTaskByComponentId(id);
        return byComponent?.sessionId || id;
    }
    getLatestCodeSnapshot(rawId, userId) {
        const sessionId = this.resolveSnapshotSessionId(rawId, userId);
        const access = this.tasksService.getTaskStatus(sessionId, userId);
        if (!access.success) {
            if (access.error === '无权访问此任务') {
                throw new common_1.HttpException(access.error, common_1.HttpStatus.FORBIDDEN);
            }
            const diskSnapshot = this.taskCodeSnapshotService.getLatestManifest(sessionId) ||
                this.taskCodeSnapshotService.getPartialManifest(sessionId);
            if (!diskSnapshot) {
                throw new common_1.HttpException(access.error || '任务不存在或无权访问', common_1.HttpStatus.NOT_FOUND);
            }
        }
        return {
            success: true,
            candidate: this.taskCodeSnapshotService.getCandidateManifest(sessionId),
            lastGood: this.taskCodeSnapshotService.getLastGoodManifest(sessionId),
            partial: this.taskCodeSnapshotService.getPartialManifest(sessionId),
        };
    }
    getRefineDiff(rawId, source, userId) {
        let snapshotSession = source || null;
        if (!snapshotSession) {
            try {
                const st = this.tasksService.getTaskStatus(this.resolveSnapshotSessionId(rawId, userId), userId);
                snapshotSession = st?.success ? st?.task?.refineOf : null;
            }
            catch {
                snapshotSession = null;
            }
        }
        if (!snapshotSession) {
            return { success: true, isRefine: false, available: false };
        }
        const revisions = this.taskCodeSnapshotService.listRevisions(snapshotSession);
        const findTaggedPair = () => ({
            baseline: revisions.find((r) => r.stage === 'refine-baseline' && r.refineSessionId === rawId),
            candidate: revisions.find((r) => r.stage === 'refine-candidate' && r.refineSessionId === rawId),
        });
        let { baseline, candidate } = findTaggedPair();
        if (!baseline || !candidate) {
            const baselines = revisions
                .filter((r) => r.stage === 'refine-baseline')
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const candidates = revisions
                .filter((r) => r.stage === 'refine-candidate')
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            baseline = baselines[0];
            candidate = candidates[0];
        }
        if (!baseline || !candidate) {
            return { success: true, isRefine: true, available: false, sourceSessionId: snapshotSession };
        }
        const changes = this.taskCodeSnapshotService.computeRefineDiff(snapshotSession, baseline.revision, candidate.revision);
        return {
            success: true,
            isRefine: true,
            available: true,
            sourceSessionId: snapshotSession,
            refineSessionId: rawId,
            baselineRevision: baseline.revision,
            candidateRevision: candidate.revision,
            baselineCreatedAt: baseline.createdAt,
            candidateCreatedAt: candidate.createdAt,
            changes,
        };
    }
    getCodeSnapshotManifest(rawId, revision, userId) {
        const sessionId = this.resolveSnapshotSessionId(rawId, userId);
        this.assertSnapshotAccessible(sessionId, userId, revision);
        return {
            success: true,
            manifest: this.taskCodeSnapshotService.getManifest(sessionId, revision),
        };
    }
    getCodeSnapshotFile(rawId, revision, path, preview, exists, userId, res) {
        const sessionId = this.resolveSnapshotSessionId(rawId, userId);
        if (!path)
            throw new common_1.HttpException('缺少文件路径', common_1.HttpStatus.BAD_REQUEST);
        const isPreview = preview === '1';
        if (exists === '1') {
            res.setHeader('Cache-Control', 'private, no-store');
            try {
                this.assertSnapshotAccessible(sessionId, userId, revision);
                const probe = isPreview
                    ? this.taskCodeSnapshotService.readPreviewFile(sessionId, revision, path)
                    : this.taskCodeSnapshotService.readFile(sessionId, revision, path);
                return res.json({ exists: !!probe && probe.length > 0 });
            }
            catch {
                return res.json({ exists: false });
            }
        }
        this.assertSnapshotAccessible(sessionId, userId, revision);
        let content;
        try {
            content = isPreview
                ? this.taskCodeSnapshotService.readPreviewFile(sessionId, revision, path)
                : this.taskCodeSnapshotService.readFile(sessionId, revision, path);
        }
        catch (error) {
            const msg = String(error?.message || '');
            if (/快照文件不存在|代码快照不存在|文件不存在/.test(msg)) {
                throw new common_1.HttpException('快照文件不存在', common_1.HttpStatus.NOT_FOUND);
            }
            if (msg.includes('结构无效，且没有可回退的有效版本')) {
                throw new common_1.HttpException(msg, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            throw error;
        }
        const extension = path.toLowerCase().split('.').pop();
        const contentTypes = {
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
    editCodeSnapshotFile(sessionId, revision, body, userId) {
        const task = this.tasksService.getTask(sessionId);
        if (!task) {
            throw new common_1.HttpException('任务不存在或已重启丢失，无法写回快照', common_1.HttpStatus.NOT_FOUND);
        }
        if (task.userId && task.userId !== userId) {
            throw new common_1.HttpException('无权编辑此任务快照', common_1.HttpStatus.FORBIDDEN);
        }
        if (!body?.path || typeof body.content !== 'string') {
            throw new common_1.HttpException('缺少文件路径或文件内容', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const manifest = this.taskCodeSnapshotService.createEditedCandidate(sessionId, revision, body.path, body.content, body.source || 'playground');
            return { success: true, manifest };
        }
        catch (error) {
            const message = String(error?.message || '快照写回失败');
            const status = /不可编辑|只能编辑|快照文件不存在|代码快照不存在|路径非法|路径越界/.test(message)
                ? common_1.HttpStatus.CONFLICT
                : common_1.HttpStatus.BAD_REQUEST;
            throw new common_1.HttpException(message, status);
        }
    }
    async validateCodeSnapshot(sessionId, revision, userId) {
        const task = this.tasksService.getTask(sessionId);
        if (task && task.userId && task.userId !== userId) {
            throw new common_1.HttpException('无权校验此任务快照', common_1.HttpStatus.FORBIDDEN);
        }
        if (!task && !this.taskCodeSnapshotService.hasManifest(sessionId, revision)) {
            throw new common_1.HttpException('任务或代码快照不存在', common_1.HttpStatus.NOT_FOUND);
        }
        try {
            return await this.snapshotQualityService.validateRevision(sessionId, revision);
        }
        catch (error) {
            const message = String(error?.message || '快照质量校验失败');
            const status = /不存在|格式非法|不匹配/.test(message)
                ? common_1.HttpStatus.NOT_FOUND
                : common_1.HttpStatus.BAD_REQUEST;
            throw new common_1.HttpException(message, status);
        }
    }
    listCodeSnapshotRevisions(rawId, userId) {
        const sessionId = this.resolveSnapshotSessionId(rawId, userId);
        const access = this.tasksService.getTaskStatus(sessionId, userId);
        if (!access.success) {
            if (access.error === '无权访问此任务') {
                throw new common_1.HttpException(access.error, common_1.HttpStatus.FORBIDDEN);
            }
            const diskSnapshot = this.taskCodeSnapshotService.getLatestManifest(sessionId) ||
                this.taskCodeSnapshotService.getPartialManifest(sessionId);
            if (!diskSnapshot) {
                throw new common_1.HttpException(access.error || '任务不存在或无权访问', common_1.HttpStatus.NOT_FOUND);
            }
        }
        return {
            success: true,
            revisions: this.taskCodeSnapshotService.listRevisions(sessionId),
            current: {
                candidate: this.taskCodeSnapshotService.getCandidateManifest(sessionId)?.revision || null,
                lastGood: this.taskCodeSnapshotService.getLastGoodManifest(sessionId)?.revision || null,
                partial: this.taskCodeSnapshotService.getPartialManifest(sessionId)?.revision || null,
            },
        };
    }
    rollbackCodeSnapshot(sessionId, revision, userId) {
        const task = this.tasksService.getTask(sessionId);
        if (task && task.userId && task.userId !== userId) {
            throw new common_1.HttpException('无权回滚此任务快照', common_1.HttpStatus.FORBIDDEN);
        }
        if (!task && !this.taskCodeSnapshotService.hasManifest(sessionId, revision)) {
            throw new common_1.HttpException('任务或代码快照不存在', common_1.HttpStatus.NOT_FOUND);
        }
        try {
            const manifest = this.taskCodeSnapshotService.rollbackToRevision(sessionId, revision);
            return { success: true, manifest };
        }
        catch (error) {
            const message = String(error?.message || '回滚失败');
            const status = /不存在|格式非法|不匹配/.test(message)
                ? common_1.HttpStatus.NOT_FOUND
                : /不可回滚|不完整|已拒绝/.test(message)
                    ? common_1.HttpStatus.CONFLICT
                    : common_1.HttpStatus.BAD_REQUEST;
            throw new common_1.HttpException(message, status);
        }
    }
    assertSnapshotAccessible(sessionId, userId, revision) {
        const access = this.tasksService.getTaskStatus(sessionId, userId);
        if (access.success)
            return;
        if (access.error === '无权访问此任务') {
            throw new common_1.HttpException(access.error, common_1.HttpStatus.FORBIDDEN);
        }
        if (!this.taskCodeSnapshotService.hasManifest(sessionId, revision)) {
            throw new common_1.HttpException(access.error || '任务不存在或无权访问', common_1.HttpStatus.NOT_FOUND);
        }
    }
    getTaskTree(sessionId, userId) {
        const tree = this.tasksService.getTaskTree(sessionId, userId);
        if (!tree) {
            return { success: false, error: '任务不存在' };
        }
        return { success: true, tree };
    }
    getQueueSnapshot(userId) {
        return {
            success: true,
            queue: this.queueService.getQueueSnapshot(),
            stats: this.queueService.getQueueStats(),
            userId,
        };
    }
    getQueueStats() {
        return {
            success: true,
            stats: this.queueService.getQueueStats(),
        };
    }
    getTaskQueueStatus(sessionId) {
        return {
            success: true,
            sessionId,
            status: this.queueService.getQueueStatus(sessionId),
        };
    }
    async cancelQueuedTask(sessionId, userId) {
        const result = this.queueService.cancelQueuedTask(sessionId, userId);
        if (result.success) {
            this.tasksService.updateTask(sessionId, { status: 'cancelled' });
            this.queueService.unregisterExecuteFn(sessionId);
        }
        return result;
    }
    async startQueuedTask(sessionId, userId) {
        return await this.queueService.startQueuedTask(sessionId, userId);
    }
    async dispatchQueue(userId) {
        const result = await this.queueService.scheduleNextWaiting();
        return {
            success: true,
            dispatched: result?.dispatched ?? 0,
            remaining: result?.remaining ?? 0,
            operator: userId,
        };
    }
    async removeTasksBatch(sessionIds, userId) {
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
    async removeTask(sessionId, userId) {
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
    async cleanupOrphans(userId) {
        const result = await this.tasksService.cleanupOrphans(userId);
        return {
            success: true,
            message: `已清理孤儿组件 ${result.orphanComponents} 个、孤儿任务 ${result.orphanTasks} 个`,
            ...result,
        };
    }
    async cancelTask(sessionId, userId) {
        return await this.tasksService.cancelTask(sessionId, userId);
    }
    async pauseTask(sessionId, userId) {
        return await this.tasksService.pauseTask(sessionId, userId);
    }
    resumeTask(sessionId, userId) {
        return this.tasksService.resumeTask(sessionId, userId);
    }
    removeExpiredTasks(userId) {
        const { removed, remaining } = this.tasksService.removeExpiredTasks(userId);
        return {
            success: true,
            message: `已废弃 ${removed} 个过期任务，剩余 ${remaining} 个任务`,
            removed,
            remaining,
        };
    }
    getRetryMetadata(sessionId, userId) {
        const meta = this.tasksService.getRetryMetadata(sessionId, userId);
        if (!meta) {
            return { success: false, error: '任务不存在或无权访问' };
        }
        if ('error' in meta) {
            return { success: false, error: meta.error };
        }
        return { success: true, meta };
    }
    async retryTask(sessionId, body, userId) {
        return this.tasksService.retryWithResume(sessionId, userId, body.config);
    }
    async downloadTaskCode(sessionId, userId, res) {
        try {
            const { buffer, filename } = await this.tasksService.packageTaskCode(sessionId, userId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.HttpException(message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async recoverTask(sessionId, userId) {
        return this.tasksService.recoverTask(sessionId, userId);
    }
    async publishToWorkspace(sessionId, userId) {
        return this.tasksService.publishToWorkspace(sessionId, userId);
    }
    async speedPassTask(sessionId, userId) {
        return this.tasksService.speedPassTask(sessionId, userId);
    }
    async lockTask(sessionId, body, userId) {
        return this.tasksService.lockTask(sessionId, userId, body?.revision);
    }
    submitHumanReview(sessionId, body, userId) {
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
    revokeHumanReview(sessionId, body, userId) {
        return this.tasksService.revokeHumanReview({ sessionId, userId, reviewerName: body?.reviewerName });
    }
    getReviewableTasks(userId) {
        const tasks = this.tasksService.getReviewableTasks(userId);
        return { success: true, tasks, count: tasks.length };
    }
    _figmaNodeCacheDir() {
        return (0, path_1.join)(backend_root_js_1.dataDir, 'figma-node-cache');
    }
    _normNodeId(n) {
        return String(n || '').replace(/:/g, '-');
    }
    _listFigmaNodeCache(fileKey, nodeId) {
        const dir = this._figmaNodeCacheDir();
        if (!(0, fs_1.existsSync)(dir))
            return [];
        const entries = [];
        for (const name of (0, fs_1.readdirSync)(dir)) {
            if (!name.endsWith('.json'))
                continue;
            const p = (0, path_1.join)(dir, name);
            let meta = {};
            try {
                meta = JSON.parse((0, fs_1.readFileSync)(p, 'utf8'));
            }
            catch {
            }
            if (fileKey && meta.fileKey !== fileKey)
                continue;
            if (nodeId && this._normNodeId(String(meta.nodeId ?? '')) !== this._normNodeId(nodeId))
                continue;
            let sizeBytes = 0;
            try {
                sizeBytes = (0, fs_1.statSync)(p).size;
            }
            catch {
            }
            entries.push({
                name,
                fileKey: meta.fileKey || null,
                nodeId: meta.nodeId || null,
                savedAt: meta.savedAt || null,
                ageMinutes: meta.savedAt ? Math.round((Date.now() - meta.savedAt) / 60000) : null,
                sizeBytes,
            });
        }
        entries.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
        return entries;
    }
    listFigmaNodeCache(fileKey, nodeId) {
        const entries = this._listFigmaNodeCache(fileKey || undefined, nodeId || undefined);
        return { success: true, entries, count: entries.length };
    }
    deleteFigmaNodeCache(fileKey, nodeId) {
        const entries = this._listFigmaNodeCache(fileKey || undefined, nodeId || undefined);
        const dir = this._figmaNodeCacheDir();
        const deleted = [];
        const failed = [];
        for (const e of entries) {
            const name = String(e.name);
            try {
                (0, fs_1.unlinkSync)((0, path_1.join)(dir, name));
                deleted.push(name);
            }
            catch (err) {
                failed.push({ name, error: err?.message || String(err) });
            }
        }
        return {
            success: failed.length === 0,
            deleted,
            deletedCount: deleted.length,
            failed,
            scope: fileKey ? (nodeId ? `${fileKey}/${nodeId}` : fileKey) : 'all',
        };
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('full')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getAllTasks", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskSummary", null);
__decorate([
    (0, common_1.Get)('recent'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getRecentTasks", null);
__decorate([
    (0, common_1.Get)('status/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskStatus", null);
__decorate([
    (0, common_1.Get)('resolve-session'),
    __param(0, (0, common_1.Query)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "resolveSessionByComponentId", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-snapshots/latest'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getLatestCodeSnapshot", null);
__decorate([
    (0, common_1.Get)(':sessionId/refine-diff'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Query)('source')),
    __param(2, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getRefineDiff", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-snapshots/:revision/manifest'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('revision')),
    __param(2, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getCodeSnapshotManifest", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-snapshots/:revision/file'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('revision')),
    __param(2, (0, common_1.Query)('path')),
    __param(3, (0, common_1.Query)('preview')),
    __param(4, (0, common_1.Query)('exists')),
    __param(5, (0, current_user_decorator_1.OptionalUser)()),
    __param(6, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getCodeSnapshotFile", null);
__decorate([
    (0, common_1.Post)(':sessionId/code-snapshots/:revision/edit'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('revision')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "editCodeSnapshotFile", null);
__decorate([
    (0, common_1.Post)(':sessionId/code-snapshots/:revision/validate'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('revision')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "validateCodeSnapshot", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-snapshots/revisions'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "listCodeSnapshotRevisions", null);
__decorate([
    (0, common_1.Post)(':sessionId/code-snapshots/:revision/rollback'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('revision')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "rollbackCodeSnapshot", null);
__decorate([
    (0, common_1.Get)('tree/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskTree", null);
__decorate([
    (0, common_1.Get)('queue'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getQueueSnapshot", null);
__decorate([
    (0, common_1.Get)('queue/stats'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getQueueStats", null);
__decorate([
    (0, common_1.Get)('queue/status/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskQueueStatus", null);
__decorate([
    (0, common_1.Post)('queue/cancel/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "cancelQueuedTask", null);
__decorate([
    (0, common_1.Post)('queue/start/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "startQueuedTask", null);
__decorate([
    (0, common_1.Post)('queue/dispatch'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "dispatchQueue", null);
__decorate([
    (0, common_1.Post)('batch-delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)('sessionIds')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeTasksBatch", null);
__decorate([
    (0, common_1.Post)(':sessionId/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeTask", null);
__decorate([
    (0, common_1.Post)('cleanup-orphans'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "cleanupOrphans", null);
__decorate([
    (0, common_1.Post)('cancel/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "cancelTask", null);
__decorate([
    (0, common_1.Post)('pause/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "pauseTask", null);
__decorate([
    (0, common_1.Post)('resume/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "resumeTask", null);
__decorate([
    (0, common_1.Post)('delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "removeExpiredTasks", null);
__decorate([
    (0, common_1.Get)('retry-meta/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getRetryMetadata", null);
__decorate([
    (0, common_1.Post)('retry/:sessionId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "retryTask", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-download'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "downloadTaskCode", null);
__decorate([
    (0, common_1.Post)(':sessionId/recover'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "recoverTask", null);
__decorate([
    (0, common_1.Post)(':sessionId/publish-to-workspace'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "publishToWorkspace", null);
__decorate([
    (0, common_1.Post)(':sessionId/speed-pass'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "speedPassTask", null);
__decorate([
    (0, common_1.Post)(':sessionId/lock'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "lockTask", null);
__decorate([
    (0, common_1.Post)(':sessionId/human-review'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "submitHumanReview", null);
__decorate([
    (0, common_1.Post)(':sessionId/human-review/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "revokeHumanReview", null);
__decorate([
    (0, common_1.Get)('reviewable'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getReviewableTasks", null);
__decorate([
    (0, common_1.Get)('figma-node-cache'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)('fileKey')),
    __param(1, (0, common_1.Query)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "listFigmaNodeCache", null);
__decorate([
    (0, common_1.Delete)('figma-node-cache'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)('fileKey')),
    __param(1, (0, common_1.Query)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "deleteFigmaNodeCache", null);
exports.TasksController = TasksController = __decorate([
    (0, common_1.Controller)('tasks'),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        task_queue_service_1.TaskQueueService,
        task_code_snapshot_service_1.TaskCodeSnapshotService,
        snapshot_quality_service_1.SnapshotQualityService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map