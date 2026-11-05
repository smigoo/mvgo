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
exports.AdminStatsController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const task_stats_service_1 = require("../task-stats/task-stats.service");
let AdminStatsController = class AdminStatsController {
    adminService;
    taskStatsService;
    logger = console;
    constructor(adminService, taskStatsService) {
        this.adminService = adminService;
        this.taskStatsService = taskStatsService;
    }
    async userStats(userId, preset, from, to) {
        await this.taskStatsService.assertAdmin(userId);
        const res = await this.taskStatsService.userStats({ preset, from, to });
        let extraMap = {};
        try {
            const extra = await this.adminService.listUserStats();
            extraMap = extra;
        }
        catch (err) {
            this.logger.warn(`[user-stats] listUserStats 合并失败: ${err.message}`);
        }
        const mergedList = res.list.map((item) => {
            const uid = item.userId;
            const extra = extraMap[uid] || {};
            return {
                ...item,
                componentCount: extra.componentCount ?? 0,
                apiTaskCount: extra.apiTaskCount ?? 0,
                apiCount: extra.apiCount ?? 0,
            };
        });
        return {
            success: true,
            list: mergedList,
            count: res.count,
            windowLabel: res.windowLabel,
        };
    }
    async listUserStats(key) {
        const expect = process.env.ADMIN_STATS_KEY || '';
        if (!expect) {
            throw new common_1.ServiceUnavailableException('服务端未配置 ADMIN_STATS_KEY，user-stats 不可用');
        }
        if (!key || key !== expect) {
            throw new common_1.ForbiddenException('内部调用 key 无效');
        }
        const data = await this.adminService.listUserStats();
        return { success: true, data };
    }
    async usageExport(key, preset, from, to, dept, format) {
        const expect = process.env.ADMIN_STATS_KEY || '';
        if (!expect) {
            throw new common_1.ServiceUnavailableException('服务端未配置 ADMIN_STATS_KEY，usage-export 不可用');
        }
        if (!key || key !== expect) {
            throw new common_1.ForbiddenException('内部调用 key 无效');
        }
        const file = await this.adminService.buildUsageExport({ preset, from, to, dept, format });
        return { success: true, ...file };
    }
};
exports.AdminStatsController = AdminStatsController;
__decorate([
    (0, common_1.Get)('user-stats'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminStatsController.prototype, "userStats", null);
__decorate([
    (0, common_1.Get)('internal/user-stats'),
    __param(0, (0, common_1.Headers)('x-admin-stats-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminStatsController.prototype, "listUserStats", null);
__decorate([
    (0, common_1.Get)('internal/usage-export'),
    __param(0, (0, common_1.Headers)('x-admin-stats-key')),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('dept')),
    __param(5, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminStatsController.prototype, "usageExport", null);
exports.AdminStatsController = AdminStatsController = __decorate([
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        task_stats_service_1.TaskStatsService])
], AdminStatsController);
//# sourceMappingURL=admin-stats.controller.js.map