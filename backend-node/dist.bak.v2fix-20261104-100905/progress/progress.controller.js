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
exports.ProgressController = void 0;
const common_1 = require("@nestjs/common");
const progress_service_1 = require("./progress.service");
const tasks_service_1 = require("../tasks/tasks.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ProgressController = class ProgressController {
    progressService;
    tasksService;
    constructor(progressService, tasksService) {
        this.progressService = progressService;
        this.tasksService = tasksService;
    }
    streamProgress(sessionId, lastEventId, userId, res) {
        const access = this.tasksService.getTaskStatus(sessionId, userId);
        if (!access.success) {
            throw new common_1.HttpException(access.error || '任务不存在或无权访问', common_1.HttpStatus.NOT_FOUND);
        }
        return this.progressService.register(sessionId, res, lastEventId);
    }
};
exports.ProgressController = ProgressController;
__decorate([
    (0, common_1.Get)(':sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Headers)('last-event-id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "streamProgress", null);
exports.ProgressController = ProgressController = __decorate([
    (0, common_1.Controller)('progress'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [progress_service_1.ProgressService,
        tasks_service_1.TasksService])
], ProgressController);
//# sourceMappingURL=progress.controller.js.map