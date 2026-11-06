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
exports.TaskStatsController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const task_stats_service_1 = require("./task-stats.service");
const self_healing_service_1 = require("./self-healing.service");
let TaskStatsController = class TaskStatsController {
    taskStatsService;
    selfHealingService;
    constructor(taskStatsService, selfHealingService) {
        this.taskStatsService = taskStatsService;
        this.selfHealingService = selfHealingService;
    }
    async listAllTasks(userId, preset, from, to) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.listAllTasks({ preset, from, to });
        return {
            success: true,
            list: res.list,
            count: res.count,
            windowLabel: res.windowLabel,
        };
    }
    async modelCompare(userId, preset, from, to) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.modelCompare({ preset, from, to });
        return {
            success: true,
            list: res.list,
            count: res.count,
            windowLabel: res.windowLabel,
        };
    }
    async backfillTokenBaseURLs(userId) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.backfillTokenBaseURLs();
        return {
            success: true,
            ...res,
        };
    }
    async trends(userId, preset, from, to, metric, granularity) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.trends({ preset, from, to }, metric || 'successRate', granularity || 'day');
        return {
            success: true,
            ...res,
        };
    }
    async dashboard(userId, preset, from, to) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.dashboard({ preset, from, to });
        return {
            success: true,
            data: res,
        };
    }
    async myDashboard(userId, preset, from, to) {
        const res = await this.taskStatsService.myDashboard(userId, { preset, from, to });
        return {
            success: true,
            data: res,
        };
    }
    async failureAnalysis(userId, sessionId) {
        await this.taskStatsService.assertAdmin(userId);
        if (!sessionId) {
            return { success: false, message: '缺少 sessionId 参数' };
        }
        const analysis = this.selfHealingService.analyzeFailure(sessionId);
        return {
            success: true,
            data: analysis,
        };
    }
};
exports.TaskStatsController = TaskStatsController;
__decorate([
    (0, common_1.Get)('tasks'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "listAllTasks", null);
__decorate([
    (0, common_1.Get)('model-compare'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "modelCompare", null);
__decorate([
    (0, common_1.Post)('backfill-token-baseurls'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "backfillTokenBaseURLs", null);
__decorate([
    (0, common_1.Get)('trends'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('metric')),
    __param(5, (0, common_1.Query)('granularity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "trends", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('my-dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "myDashboard", null);
__decorate([
    (0, common_1.Get)('failure-analysis'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TaskStatsController.prototype, "failureAnalysis", null);
exports.TaskStatsController = TaskStatsController = __decorate([
    (0, common_1.Controller)('task-stats'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [task_stats_service_1.TaskStatsService,
        self_healing_service_1.SelfHealingService])
], TaskStatsController);
//# sourceMappingURL=task-stats.controller.js.map