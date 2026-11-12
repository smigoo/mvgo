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
exports.FeedbackAdminController = exports.FeedbackController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const node_fs_1 = require("node:fs");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const admin_service_1 = require("../admin/admin.service");
const feedback_service_1 = require("./feedback.service");
let FeedbackController = class FeedbackController {
    feedbackService;
    constructor(feedbackService) {
        this.feedbackService = feedbackService;
    }
    async submitFeedback(sessionId, body, file, userId, req) {
        const result = await this.feedbackService.create({
            sessionId,
            userId,
            username: req?.session?.username,
            category: body?.category,
            description: body?.description,
            includes: body?.includes,
            logsText: body?.logsText,
            pageUrl: body?.pageUrl,
            userAgent: req?.headers?.['user-agent'],
            file,
        });
        return result;
    }
};
exports.FeedbackController = FeedbackController;
__decorate([
    (0, common_1.Post)(':sessionId/feedback'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: feedback_service_1.FEEDBACK_MAX_FILE_BYTES }, })),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "submitFeedback", null);
exports.FeedbackController = FeedbackController = __decorate([
    (0, common_1.Controller)('tasks'),
    __metadata("design:paramtypes", [feedback_service_1.FeedbackService])
], FeedbackController);
let FeedbackAdminController = class FeedbackAdminController {
    feedbackService;
    adminService;
    constructor(feedbackService, adminService) {
        this.feedbackService = feedbackService;
        this.adminService = adminService;
    }
    async list(userId, page, pageSize, status, category, sessionId, keyword) {
        await this.adminService.assertAdmin(userId);
        const data = await this.feedbackService.list({
            page: page ? parseInt(page, 10) : 1,
            pageSize: pageSize ? parseInt(pageSize, 10) : 20,
            status,
            category,
            sessionId,
            keyword,
        });
        return { success: true, ...data };
    }
    async detail(userId, id) {
        await this.adminService.assertAdmin(userId);
        const feedback = await this.feedbackService.detail(id);
        return { success: true, feedback };
    }
    async updateStatus(userId, id, body, req) {
        await this.adminService.assertAdmin(userId);
        if (!body?.status) {
            return { success: false, message: '缺少 status' };
        }
        const feedback = await this.feedbackService.updateStatus(id, {
            status: body.status,
            adminNote: body.adminNote,
            adminId: userId,
            adminName: req?.session?.username,
        });
        return { success: true, feedback };
    }
    async remove(userId, id) {
        await this.adminService.assertAdmin(userId);
        return this.feedbackService.remove(id);
    }
    async download(userId, id, res) {
        await this.adminService.assertAdmin(userId);
        const { absPath, filename, mimeType } = await this.feedbackService.resolveAttachment(id);
        const encoded = encodeURIComponent(filename);
        res.set({
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="feedback-attachment"; filename*=UTF-8''${encoded}`,
        });
        return new common_1.StreamableFile((0, node_fs_1.createReadStream)(absPath));
    }
};
exports.FeedbackAdminController = FeedbackAdminController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __param(3, (0, common_1.Query)('status')),
    __param(4, (0, common_1.Query)('category')),
    __param(5, (0, common_1.Query)('sessionId')),
    __param(6, (0, common_1.Query)('keyword')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], FeedbackAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FeedbackAdminController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(':id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], FeedbackAdminController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FeedbackAdminController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/attachment'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], FeedbackAdminController.prototype, "download", null);
exports.FeedbackAdminController = FeedbackAdminController = __decorate([
    (0, common_1.Controller)('admin/feedbacks'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [feedback_service_1.FeedbackService,
        admin_service_1.AdminService])
], FeedbackAdminController);
//# sourceMappingURL=feedback.controller.js.map