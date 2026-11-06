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
exports.WorkbenchController = void 0;
const common_1 = require("@nestjs/common");
const workbench_service_1 = require("./workbench.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let WorkbenchController = class WorkbenchController {
    workbenchService;
    constructor(workbenchService) {
        this.workbenchService = workbenchService;
    }
    async createConversation(userId, body) {
        try {
            const conversation = await this.workbenchService.createConversation(userId, body.title);
            return {
                success: true,
                data: conversation,
            };
        }
        catch (err) {
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async listConversations(userId, limit) {
        try {
            const conversations = await this.workbenchService.listConversations(userId, limit ? parseInt(limit, 10) : 20);
            return {
                success: true,
                data: conversations,
                count: conversations.length,
            };
        }
        catch (err) {
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getConversation(conversationId, userId) {
        try {
            const conversation = await this.workbenchService.getConversation(conversationId, userId);
            if (!conversation) {
                throw new common_1.HttpException({ success: false, error: '对话不存在' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: conversation,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async sendMessage(conversationId, userId, body) {
        try {
            if (!body.content || body.content.trim().length === 0) {
                throw new common_1.HttpException({ success: false, error: '消息内容不能为空' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const result = await this.workbenchService.sendMessage(conversationId, userId, body.content, body.attachments, body.pendingToolCall);
            return {
                success: true,
                data: {
                    userMessage: result.userMessage,
                    assistantMessage: result.assistantMessage,
                    conversation: {
                        conversationId: result.conversation.conversationId,
                        title: result.conversation.title,
                        messageCount: result.conversation.messageCount,
                        lastActiveAt: result.conversation.lastActiveAt,
                        currentComponentId: result.conversation.currentComponentId,
                    },
                },
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async deleteConversation(conversationId, userId) {
        try {
            const deleted = await this.workbenchService.deleteConversation(conversationId, userId);
            if (!deleted) {
                throw new common_1.HttpException({ success: false, error: '对话不存在或无权删除' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                message: '对话已删除',
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateContext(conversationId, userId, context) {
        try {
            const conversation = await this.workbenchService.updateContext(conversationId, userId, context);
            if (!conversation) {
                throw new common_1.HttpException({ success: false, error: '对话不存在' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: conversation,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchConversations(userId, query, limit) {
        try {
            if (!query || query.trim().length === 0) {
                throw new common_1.HttpException({ success: false, error: '搜索关键词不能为空' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const conversations = await this.workbenchService.searchConversations(userId, query, limit ? parseInt(limit, 10) : 10);
            return {
                success: true,
                data: conversations,
                count: conversations.length,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getStats(userId) {
        try {
            const stats = await this.workbenchService.getConversationStats(userId);
            return {
                success: true,
                data: stats,
            };
        }
        catch (err) {
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async renameConversation(conversationId, userId, body) {
        try {
            if (!body.title || body.title.trim().length === 0) {
                throw new common_1.HttpException({ success: false, error: '标题不能为空' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const conversation = await this.workbenchService.renameConversation(conversationId, userId, body.title.trim());
            if (!conversation) {
                throw new common_1.HttpException({ success: false, error: '对话不存在或无权访问' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: conversation,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async batchDeleteConversations(userId, body) {
        try {
            if (!body.conversationIds || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
                throw new common_1.HttpException({ success: false, error: '请选择要删除的对话' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const result = await this.workbenchService.batchDeleteConversations(body.conversationIds, userId);
            return {
                success: true,
                data: result,
                message: `成功删除 ${result.deletedCount} 个对话`,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async moveToGroup(userId, body) {
        try {
            if (!body.conversationIds || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
                throw new common_1.HttpException({ success: false, error: '请选择要移动的对话' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const result = await this.workbenchService.moveToGroup(body.conversationIds, userId, body.group);
            return {
                success: true,
                data: result,
                message: `成功移动 ${result.modifiedCount} 个对话到分组 "${body.group || '未分组'}"`,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getGroups(userId) {
        try {
            const groups = await this.workbenchService.getGroups(userId);
            return {
                success: true,
                data: groups,
            };
        }
        catch (err) {
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async createGroup(userId, body) {
        try {
            if (!body?.name?.trim()) {
                throw new common_1.HttpException({ success: false, error: '分组名称不能为空' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const group = await this.workbenchService.createGroup(userId, body.name);
            return {
                success: true,
                data: group,
                message: `已创建分组「${group.name}」`,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async renameGroup(userId, name, body) {
        try {
            if (!body?.newName?.trim()) {
                throw new common_1.HttpException({ success: false, error: '分组名称不能为空' }, common_1.HttpStatus.BAD_REQUEST);
            }
            const result = await this.workbenchService.renameGroup(userId, name, body.newName);
            return {
                success: true,
                data: result,
                message: `已重命名为「${body.newName.trim()}」，同步更新 ${result.modifiedCount} 个对话`,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async deleteGroup(userId, name, force) {
        try {
            const result = await this.workbenchService.deleteGroup(userId, name, force === 'true');
            return {
                success: true,
                data: result,
                message: `已删除分组「${name}」`,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getToolCredentials(conversationId, userId) {
        try {
            const credentials = await this.workbenchService.getToolCredentials(conversationId, userId);
            if (!credentials) {
                throw new common_1.HttpException({ success: false, error: '对话不存在或无权访问' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: credentials,
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateToolCredentials(conversationId, userId, body) {
        try {
            const credentials = await this.workbenchService.updateToolCredentials(conversationId, userId, body);
            if (!credentials) {
                throw new common_1.HttpException({ success: false, error: '对话不存在或无权访问' }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                data: credentials,
                message: '工具凭据已更新',
            };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async submitFeedback(userId, body) {
        const result = await this.workbenchService.submitFeedback(body, userId);
        if (!result.success) {
            throw new common_1.HttpException({ success: false, error: result.error }, common_1.HttpStatus.BAD_REQUEST);
        }
        return { success: true, data: result.data, message: '感谢反馈' };
    }
    async clearComponentAnchor(conversationId, userId) {
        const conversation = await this.workbenchService.clearComponentAnchor(conversationId, userId);
        if (!conversation) {
            throw new common_1.HttpException({ success: false, error: '对话不存在或无权访问' }, common_1.HttpStatus.NOT_FOUND);
        }
        return { success: true, message: '已清除当前组件锚点' };
    }
    async getFeedbackStats(userId, months) {
        const stats = await this.workbenchService.getFeedbackStats(userId, months ? parseInt(months, 10) : 1);
        return { success: true, data: stats };
    }
};
exports.WorkbenchController = WorkbenchController;
__decorate([
    (0, common_1.Post)('conversations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "createConversation", null);
__decorate([
    (0, common_1.Get)('conversations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "listConversations", null);
__decorate([
    (0, common_1.Get)('conversations/:conversationId'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/messages'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/delete'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "deleteConversation", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/context'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "updateContext", null);
__decorate([
    (0, common_1.Get)('conversations/search'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "searchConversations", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "getStats", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/rename'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "renameConversation", null);
__decorate([
    (0, common_1.Post)('conversations/batch-delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "batchDeleteConversations", null);
__decorate([
    (0, common_1.Post)('conversations/move-to-group'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "moveToGroup", null);
__decorate([
    (0, common_1.Get)('groups'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "getGroups", null);
__decorate([
    (0, common_1.Post)('groups'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "createGroup", null);
__decorate([
    (0, common_1.Post)('groups/:name/rename'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('name')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "renameGroup", null);
__decorate([
    (0, common_1.Post)('groups/:name/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('name')),
    __param(2, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "deleteGroup", null);
__decorate([
    (0, common_1.Get)('conversations/:conversationId/credentials'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "getToolCredentials", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/credentials'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "updateToolCredentials", null);
__decorate([
    (0, common_1.Post)('feedback'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "submitFeedback", null);
__decorate([
    (0, common_1.Post)('conversations/:conversationId/clear-component'),
    __param(0, (0, common_1.Param)('conversationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "clearComponentAnchor", null);
__decorate([
    (0, common_1.Get)('feedback/stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('months')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkbenchController.prototype, "getFeedbackStats", null);
exports.WorkbenchController = WorkbenchController = __decorate([
    (0, common_1.Controller)('workbench'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [workbench_service_1.WorkbenchService])
], WorkbenchController);
//# sourceMappingURL=workbench.controller.js.map