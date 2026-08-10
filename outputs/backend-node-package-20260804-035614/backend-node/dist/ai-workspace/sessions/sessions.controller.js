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
exports.AiSessionsController = void 0;
const common_1 = require("@nestjs/common");
const sessions_service_1 = require("./sessions.service");
const chat_dto_1 = require("../chat/dto/chat.dto");
const session_guard_1 = require("../../auth/session.guard");
const current_user_decorator_1 = require("../../auth/current-user.decorator");
let AiSessionsController = class AiSessionsController {
    sessionsService;
    constructor(sessionsService) {
        this.sessionsService = sessionsService;
    }
    async findByUser(userId, projectId) {
        const sessions = await this.sessionsService.findByUser(userId, projectId);
        return { data: sessions };
    }
    async findOne(id, userId) {
        const session = await this.sessionsService.findById(id, userId);
        if (!session)
            throw new common_1.HttpException('会话不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: session };
    }
    async create(dto, userId) {
        const session = await this.sessionsService.create(dto, userId);
        return { data: session };
    }
    async updateTitle(id, dto, userId) {
        const session = await this.sessionsService.updateTitle(id, dto, userId);
        if (!session)
            throw new common_1.HttpException('会话不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: session };
    }
    async delete(id, userId) {
        await this.sessionsService.delete(id, userId);
        return { success: true };
    }
};
exports.AiSessionsController = AiSessionsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiSessionsController.prototype, "findByUser", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiSessionsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chat_dto_1.CreateSessionDto, String]),
    __metadata("design:returntype", Promise)
], AiSessionsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, chat_dto_1.UpdateSessionDto, String]),
    __metadata("design:returntype", Promise)
], AiSessionsController.prototype, "updateTitle", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiSessionsController.prototype, "delete", null);
exports.AiSessionsController = AiSessionsController = __decorate([
    (0, common_1.Controller)('sessions'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [sessions_service_1.AiSessionsService])
], AiSessionsController);
//# sourceMappingURL=sessions.controller.js.map