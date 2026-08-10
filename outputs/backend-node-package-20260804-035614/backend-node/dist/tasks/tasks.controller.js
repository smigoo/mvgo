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
const tasks_service_1 = require("./tasks.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let TasksController = class TasksController {
    tasksService;
    constructor(tasksService) {
        this.tasksService = tasksService;
    }
    getAllTasks(userId) {
        const tasks = this.tasksService.getAllTasks(userId);
        return {
            success: true,
            tasks,
            count: tasks.length,
        };
    }
    getTaskStatus(sessionId, userId) {
        return this.tasksService.getTaskStatus(sessionId, userId);
    }
    getTaskTree(sessionId, userId) {
        const tree = this.tasksService.getTaskTree(sessionId, userId);
        if (!tree) {
            return { success: false, error: '任务不存在' };
        }
        return { success: true, tree };
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
    cancelTask(sessionId, userId) {
        return this.tasksService.cancelTask(sessionId, userId);
    }
    pauseTask(sessionId, userId) {
        return this.tasksService.pauseTask(sessionId, userId);
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
    retryTask(sessionId, body, userId) {
        const meta = this.tasksService.getRetryMetadata(sessionId, userId);
        if (!meta) {
            return { success: false, error: '任务不存在或无权访问' };
        }
        if ('error' in meta) {
            return { success: false, error: meta.error };
        }
        if (body.config) {
            if (body.config.apiKey)
                process.env.MC_GEN_TEXT_API_KEY = body.config.apiKey;
            if (body.config.endpoint)
                process.env.MC_GEN_TEXT_ENDPOINT = body.config.endpoint;
            if (body.config.model)
                process.env.MC_GEN_TEXT_MODEL = body.config.model;
        }
        return {
            success: true,
            meta,
            configUpdated: !!body.config,
            message: '配置已更新，请使用返回的元数据重新发起生成（将自动跳过已完成阶段）',
        };
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
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getAllTasks", null);
__decorate([
    (0, common_1.Get)('status/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskStatus", null);
__decorate([
    (0, common_1.Get)('tree/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getTaskTree", null);
__decorate([
    (0, common_1.Delete)(':sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeTask", null);
__decorate([
    (0, common_1.Post)('cleanup-orphans'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "cleanupOrphans", null);
__decorate([
    (0, common_1.Post)('cancel/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "cancelTask", null);
__decorate([
    (0, common_1.Post)('pause/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "pauseTask", null);
__decorate([
    (0, common_1.Post)('resume/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "resumeTask", null);
__decorate([
    (0, common_1.Delete)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "removeExpiredTasks", null);
__decorate([
    (0, common_1.Get)('retry-meta/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getRetryMetadata", null);
__decorate([
    (0, common_1.Post)('retry/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "retryTask", null);
__decorate([
    (0, common_1.Get)(':sessionId/code-download'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "downloadTaskCode", null);
__decorate([
    (0, common_1.Post)(':sessionId/recover'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "recoverTask", null);
__decorate([
    (0, common_1.Post)(':sessionId/human-review'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "submitHumanReview", null);
__decorate([
    (0, common_1.Delete)(':sessionId/human-review'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "revokeHumanReview", null);
__decorate([
    (0, common_1.Get)('reviewable'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getReviewableTasks", null);
exports.TasksController = TasksController = __decorate([
    (0, common_1.Controller)('tasks'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map