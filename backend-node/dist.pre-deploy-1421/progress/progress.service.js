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
var ProgressService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressService = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const redact_1 = require("../common/utils/redact");
const session_model_js_1 = require("../ai-engine/utils/session-model.js");
let ProgressService = ProgressService_1 = class ProgressService {
    tasksService;
    logger = new common_1.Logger(ProgressService_1.name);
    sessions = new Map();
    heartbeatIntervals = new Map();
    eventSequences = new Map();
    eventHistory = new Map();
    maxHistoryPerSession = 120;
    queueService;
    constructor(tasksService, queueService) {
        this.tasksService = tasksService;
        this.logger.log('[SSE] ProgressService 已加载多连接广播模式 (v2)');
        if (queueService) {
            this.queueService = queueService;
            this.logger.log('[SSE] 队列服务已注入，任务完成时将自动调度等待任务');
        }
    }
    setQueueService(queueService) {
        this.queueService = queueService;
        this.logger.log('[SSE] 队列服务已注入，任务完成时将自动调度等待任务');
    }
    register(sessionId, res, lastEventId) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        const existingTask = this.tasksService.getTask(sessionId);
        const isReconnect = !!existingTask;
        const parsedLastEventId = Number.parseInt(String(lastEventId || ''), 10);
        const history = this.eventHistory.get(sessionId) || [];
        const oldestSeq = history[0]?.seq;
        const latestSeq = history.at(-1)?.seq;
        const hasEventGap = Number.isFinite(parsedLastEventId)
            && parsedLastEventId > 0
            && (oldestSeq === undefined
                || parsedLastEventId < oldestSeq - 1
                || (latestSeq !== undefined && parsedLastEventId > latestSeq));
        this.sendEvent(res, {
            type: 'connected',
            sessionId,
            isReconnect,
            timestamp: Date.now(),
        });
        if (hasEventGap) {
            this.sendEvent(res, {
                type: 'snapshot-resync',
                reason: 'event-gap',
                lastEventId: parsedLastEventId,
                oldestAvailableSeq: oldestSeq,
                timestamp: Date.now(),
            });
        }
        else if (Number.isFinite(parsedLastEventId)) {
            for (const event of history) {
                if (event.seq > parsedLastEventId)
                    this.sendEvent(res, event.data, event.seq);
            }
        }
        if (isReconnect) {
            this.sendEvent(res, {
                type: 'task-status',
                status: existingTask.status,
                progressCount: existingTask.progressCount,
                timestamp: Date.now(),
            });
            if (existingTask.status === 'completed' && existingTask.result) {
                this.sendEvent(res, {
                    type: 'complete',
                    ...this.sanitizeResultForBroadcast(existingTask.result, sessionId),
                    timestamp: Date.now(),
                });
                res.end();
                return res;
            }
            else if (existingTask.status === 'failed') {
                this.sendEvent(res, {
                    type: 'error',
                    message: existingTask.error || '任务失败',
                    timestamp: Date.now(),
                });
                res.end();
                return res;
            }
            else if (existingTask.status === 'cancelled') {
                this.sendEvent(res, {
                    type: 'progress',
                    stage: 'cancelled',
                    status: 'cancelled',
                    message: '🛑 任务已被用户终止',
                    timestamp: Date.now(),
                });
                res.end();
                return res;
            }
            const bufferedProgress = this.tasksService.clearBuffer(sessionId);
            for (const progress of bufferedProgress) {
                if (progress?.type === 'code-snapshot' && Number.isFinite(parsedLastEventId)) {
                    continue;
                }
                this.sendEvent(res, {
                    type: 'progress',
                    ...progress,
                });
            }
        }
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new Set());
        }
        this.sessions.get(sessionId).add(res);
        if (!this.heartbeatIntervals.has(sessionId)) {
            const heartbeatInterval = setInterval(() => {
                const conns = this.sessions.get(sessionId);
                if (conns && conns.size > 0) {
                    for (const activeRes of conns) {
                        this.sendEvent(activeRes, {
                            type: 'keep-alive',
                            timestamp: Date.now(),
                        });
                    }
                }
            }, 5000);
            this.heartbeatIntervals.set(sessionId, heartbeatInterval);
        }
        res.on('close', () => {
            const conns = this.sessions.get(sessionId);
            if (conns) {
                conns.delete(res);
                if (conns.size === 0) {
                    this.sessions.delete(sessionId);
                    const interval = this.heartbeatIntervals.get(sessionId);
                    if (interval) {
                        clearInterval(interval);
                        this.heartbeatIntervals.delete(sessionId);
                    }
                }
            }
            this.logger.debug(`SSE connection closed for session: ${sessionId}`);
        });
        return res;
    }
    recordEvent(sessionId, data) {
        const seq = (this.eventSequences.get(sessionId) || 0) + 1;
        this.eventSequences.set(sessionId, seq);
        const event = { seq, data: { ...data, seq } };
        const history = this.eventHistory.get(sessionId) || [];
        history.push(event);
        if (history.length > this.maxHistoryPerSession)
            history.splice(0, history.length - this.maxHistoryPerSession);
        this.eventHistory.set(sessionId, history);
        return event;
    }
    sanitizeResultForBroadcast(result, sessionId) {
        try {
            return (0, redact_1.redactSecrets)(result);
        }
        catch (err) {
            this.logger.warn(`完成消息脱敏失败，降级为最小载荷广播（不回退原文）: ${err?.message || String(err)}`, { sessionId });
            return {
                sessionId,
                redacted: true,
                degraded: { reason: 'redact-failed', message: err?.message || String(err) },
            };
        }
    }
    sendEvent(res, data, seq) {
        try {
            const eventId = seq ?? data?.seq;
            const message = `${eventId !== undefined ? `id: ${eventId}\n` : ''}data: ${(0, redact_1.safeJsonStringify)(data)}\n\n`;
            if (typeof res.write !== 'function') {
                this.logger.error(`[sendEvent] res.write 不是函数！res 类型: ${typeof res}, constructor: ${res?.constructor?.name}, data.type: ${data.type}`);
                return;
            }
            res.write(message);
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }
        catch (err) {
            this.logger.warn(`[sendEvent] SSE 写入失败: ${err.message}`, { dataType: data.type });
        }
    }
    sendProgress(sessionId, progressData) {
        if (progressData && progressData.level === 'log') {
            this.sendLog(sessionId, progressData.logLevel || 'info', progressData.message || '', {
                stage: progressData.stage,
                context: progressData.context ?? progressData.stage,
                elapsedSec: progressData.elapsedSec,
                source: 'gateway-heartbeat',
            });
            return;
        }
        const _progressTimestamp = progressData?.timestamp ?? Date.now();
        this.tasksService.addProgress(sessionId, {
            type: 'progress',
            ...progressData,
            timestamp: _progressTimestamp,
        });
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'progress',
                    ...progressData,
                    timestamp: _progressTimestamp,
                });
            }
        }
    }
    sendCodeSnapshot(sessionId, snapshotData) {
        const safeData = {
            type: 'code-snapshot',
            revision: snapshotData.revision,
            status: snapshotData.status,
            stage: snapshotData.stage,
            fileCount: snapshotData.fileCount,
            changedFiles: Array.isArray(snapshotData.changedFiles)
                ? snapshotData.changedFiles.slice(0, 50)
                : [],
            lastGoodRevision: snapshotData.lastGoodRevision,
            timestamp: Date.now(),
        };
        const event = this.recordEvent(sessionId, safeData);
        this.tasksService.addProgress(sessionId, event.data);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns)
                this.sendEvent(res, event.data, event.seq);
        }
    }
    sendFileLifecycle(sessionId, lifecycleData) {
        const conns = this.sessions.get(sessionId);
        if (!conns || conns.size === 0)
            return;
        const files = Array.isArray(lifecycleData?.files)
            ? lifecycleData.files
                .filter((f) => f && typeof f.path === 'string')
                .map((f) => ({ path: f.path, state: f.state || 'working' }))
                .slice(0, 200)
            : [];
        const safeData = {
            type: 'file-lifecycle',
            phase: typeof lifecycleData?.phase === 'string' ? lifecycleData.phase : 'working',
            summary: typeof lifecycleData?.summary === 'string' ? lifecycleData.summary : '',
            files,
            timestamp: Date.now(),
        };
        for (const res of conns) {
            this.sendEvent(res, safeData);
        }
    }
    sendLog(sessionId, level, message, meta = {}) {
        const data = {
            type: 'log',
            level,
            message,
            meta,
            timestamp: Date.now(),
        };
        if (!data.meta || typeof data.meta !== 'object')
            data.meta = {};
        if (!data.meta.model) {
            const LLM_LOGGER_RE = /(microcode-engineer|vue3-engineer|vision-agent|layout-reviewer|style-mapper|ai-request-gateway|llm-timeout|refine|validator|decomposer|planner)/i;
            const loggerName = String(data.meta.logger || '');
            if (LLM_LOGGER_RE.test(loggerName) || data.meta.stage || data.meta.context) {
                const m = (0, session_model_js_1.getSessionModel)(sessionId);
                if (m)
                    data.meta = { ...data.meta, model: m };
            }
        }
        const event = this.recordEvent(sessionId, data);
        this.tasksService.addProgress(sessionId, event.data);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, event.data, event.seq);
            }
        }
    }
    async sendComplete(sessionId, result) {
        this.tasksService.completeTask(sessionId, result);
        const safeResult = this.sanitizeResultForBroadcast(result, sessionId);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'complete',
                    ...safeResult,
                    timestamp: Date.now(),
                });
                res.end();
            }
            this.sessions.delete(sessionId);
            const interval = this.heartbeatIntervals.get(sessionId);
            if (interval) {
                clearInterval(interval);
                this.heartbeatIntervals.delete(sessionId);
            }
        }
        if (this.queueService) {
            try {
                await this.queueService.markTaskCompleted(sessionId);
            }
            catch (err) {
                this.logger.warn(`释放队列槽位失败: ${err.message}`);
            }
        }
    }
    async sendError(sessionId, error) {
        this.tasksService.failTask(sessionId, error);
        const errStack = (error && typeof error === 'object' && error.stack) || undefined;
        this.logger.error(`[SSE] sendError for session ${sessionId}: ${error?.message || error}`, errStack);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'error',
                    message: error?.friendlyMessage || error?.message || error,
                    stack: errStack,
                    timestamp: Date.now(),
                });
                res.end();
            }
            this.sessions.delete(sessionId);
            const interval = this.heartbeatIntervals.get(sessionId);
            if (interval) {
                clearInterval(interval);
                this.heartbeatIntervals.delete(sessionId);
            }
        }
        if (this.queueService) {
            try {
                await this.queueService.markTaskFailed(sessionId);
            }
            catch (err) {
                this.logger.warn(`[ProgressService] 通知队列任务失败失败: ${err.message}`);
            }
        }
    }
    close(sessionId) {
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                res.end();
            }
            this.sessions.delete(sessionId);
            const interval = this.heartbeatIntervals.get(sessionId);
            if (interval) {
                clearInterval(interval);
                this.heartbeatIntervals.delete(sessionId);
            }
        }
    }
};
exports.ProgressService = ProgressService;
exports.ProgressService = ProgressService = ProgressService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => task_queue_service_1.TaskQueueService))),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        task_queue_service_1.TaskQueueService])
], ProgressService);
//# sourceMappingURL=progress.service.js.map