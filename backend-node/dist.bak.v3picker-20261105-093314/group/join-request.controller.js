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
exports.JoinRequestController = void 0;
const common_1 = require("@nestjs/common");
const join_request_service_1 = require("./join-request.service");
const session_guard_1 = require("../auth/session.guard");
let JoinRequestController = class JoinRequestController {
    joinRequestService;
    constructor(joinRequestService) {
        this.joinRequestService = joinRequestService;
    }
    async applyToJoin(groupId, body, session) {
        const request = await this.joinRequestService.applyToJoin(groupId, session.userId, body.message || '');
        return {
            success: true,
            message: '申请已提交',
            request: {
                id: request._id,
                status: request.status,
                createdAt: request.createdAt,
            },
        };
    }
    async getPendingRequests(groupId, session) {
        const requests = await this.joinRequestService.getPendingRequests(groupId, session.userId);
        return {
            success: true,
            requests,
        };
    }
    async approveRequest(groupId, requestId, session) {
        await this.joinRequestService.approveRequest(groupId, requestId, session.userId);
        return {
            success: true,
            message: '已批准加入申请',
        };
    }
    async rejectRequest(groupId, requestId, session) {
        await this.joinRequestService.rejectRequest(groupId, requestId, session.userId);
        return {
            success: true,
            message: '已拒绝加入申请',
        };
    }
};
exports.JoinRequestController = JoinRequestController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], JoinRequestController.prototype, "applyToJoin", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], JoinRequestController.prototype, "getPendingRequests", null);
__decorate([
    (0, common_1.Post)(':requestId/approve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('requestId')),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], JoinRequestController.prototype, "approveRequest", null);
__decorate([
    (0, common_1.Post)(':requestId/reject'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('requestId')),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], JoinRequestController.prototype, "rejectRequest", null);
exports.JoinRequestController = JoinRequestController = __decorate([
    (0, common_1.Controller)('group/:groupId/join-requests'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [join_request_service_1.JoinRequestService])
], JoinRequestController);
//# sourceMappingURL=join-request.controller.js.map