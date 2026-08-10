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
var ProgressService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressService = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const SECRET_KEY_REGEX = /(token|apikey|secret|password|authorization|accesstoken)/i;
let ProgressService = ProgressService_1 = class ProgressService {
    tasksService;
    logger = new common_1.Logger(ProgressService_1.name);
    sessions = new Map();
    heartbeatIntervals = new Map();
    constructor(tasksService) {
        this.tasksService = tasksService;
        this.logger.log('[SSE] ProgressService 已加载多连接广播模式 (v2)');
    }
    register(sessionId, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        const existingTask = this.tasksService.getTask(sessionId);
        const isReconnect = !!existingTask;
        this.sendEvent(res, {
            type: 'connected',
            sessionId,
            isReconnect,
            timestamp: Date.now(),
        });
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
                    ...existingTask.result,
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
    sendEvent(res, data) {
        try {
            const message = `data: ${JSON.stringify(data)}\n\n`;
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
        this.tasksService.addProgress(sessionId, progressData);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'progress',
                    ...progressData,
                    timestamp: Date.now(),
                });
            }
        }
    }
    sendLog(sessionId, level, message, meta = {}) {
        const conns = this.sessions.get(sessionId);
        if (conns) {
            const metaKeys = Object.keys(meta);
            if (metaKeys.length === 1 && metaKeys[0] === 'logger') {
                return;
            }
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'log',
                    level,
                    message,
                    meta,
                    timestamp: Date.now(),
                });
            }
        }
    }
    stripSecrets(obj) {
        if (obj === null || obj === undefined || typeof obj !== 'object')
            return obj;
        if (Array.isArray(obj))
            return obj.map((v) => this.stripSecrets(v));
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (SECRET_KEY_REGEX.test(k)) {
                out[k] = '[REDACTED]';
            }
            else {
                out[k] = this.stripSecrets(v);
            }
        }
        return out;
    }
    sendComplete(sessionId, result) {
        this.tasksService.completeTask(sessionId, result);
        const safeResult = this.stripSecrets(result);
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
    }
    sendError(sessionId, error) {
        this.tasksService.failTask(sessionId, error);
        const errStack = (error && typeof error === 'object' && error.stack) || undefined;
        this.logger.error(`[SSE] sendError for session ${sessionId}: ${error?.message || error}`, errStack);
        const conns = this.sessions.get(sessionId);
        if (conns) {
            for (const res of conns) {
                this.sendEvent(res, {
                    type: 'error',
                    message: error.message || error,
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
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], ProgressService);
//# sourceMappingURL=progress.service.js.map