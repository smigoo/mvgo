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
var DemoController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoController = void 0;
const common_1 = require("@nestjs/common");
const demo_service_1 = require("./demo.service");
const session_guard_1 = require("../auth/session.guard");
let DemoController = DemoController_1 = class DemoController {
    demoService;
    logger = new common_1.Logger(DemoController_1.name);
    constructor(demoService) {
        this.demoService = demoService;
    }
    async aiChat(body) {
        if (!body.message || !body.componentId) {
            throw new common_1.HttpException('message 和 componentId 为必填', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const result = await this.demoService.aiChat(body);
            return result;
        }
        catch (error) {
            this.logger.error(`AI 对话失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`AI 对话失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    aiFixRenderError(body) {
        if (!body.componentId || !body.errorMessage) {
            throw new common_1.HttpException('componentId 和 errorMessage 为必填', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            return this.demoService.startAiFixRenderError(body);
        }
        catch (error) {
            this.logger.error(`AI 修复渲染错误受理失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`AI 修复渲染错误受理失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    aiFixRenderErrorStatus(fixId) {
        if (!fixId) {
            throw new common_1.HttpException('fixId 为必填', common_1.HttpStatus.BAD_REQUEST);
        }
        return this.demoService.getAiFixStatus(fixId);
    }
    async aiChatStream(body, res) {
        if (!body.message || !body.componentId) {
            throw new common_1.HttpException('message 和 componentId 为必填', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.demoService.aiChatStream(body, res);
    }
    async initialize(componentId) {
        try {
            const result = await this.demoService.initializeSnapshot(componentId);
            return result;
        }
        catch (error) {
            this.logger.error(`初始快照失败: ${error.message}`);
            throw new common_1.HttpException(`初始快照失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async undo(componentId) {
        try {
            const result = await this.demoService.undoModification(componentId);
            return result;
        }
        catch (error) {
            this.logger.error(`后退失败: ${error.message}`);
            throw new common_1.HttpException(`后退失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async restore(componentId) {
        try {
            const result = await this.demoService.restoreInitial(componentId);
            return result;
        }
        catch (error) {
            this.logger.error(`恢复失败: ${error.message}`);
            throw new common_1.HttpException(`恢复失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getModifications(componentId) {
        try {
            const result = await this.demoService.getModifications(componentId);
            return result;
        }
        catch (error) {
            this.logger.error(`获取历史失败: ${error.message}`);
            throw new common_1.HttpException(`获取历史失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async download(componentId, req, res) {
        try {
            const userId = req.session?.userId;
            if (!userId) {
                throw new common_1.HttpException('未登录', common_1.HttpStatus.UNAUTHORIZED);
            }
            await this.demoService.downloadComponent(componentId, userId, res);
        }
        catch (error) {
            if (!res.headersSent) {
                const status = error instanceof common_1.HttpException
                    ? error.getStatus()
                    : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
                res.status(status).json({
                    success: false,
                    message: `下载失败: ${error.message}`,
                });
            }
        }
    }
};
exports.DemoController = DemoController;
__decorate([
    (0, common_1.Post)('ai-chat'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "aiChat", null);
__decorate([
    (0, common_1.Post)('ai-fix-render-error'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DemoController.prototype, "aiFixRenderError", null);
__decorate([
    (0, common_1.Get)('ai-fix-render-error-status/:fixId'),
    __param(0, (0, common_1.Param)('fixId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DemoController.prototype, "aiFixRenderErrorStatus", null);
__decorate([
    (0, common_1.Post)('ai-chat/stream'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "aiChatStream", null);
__decorate([
    (0, common_1.Post)('initialize/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "initialize", null);
__decorate([
    (0, common_1.Post)('undo/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "undo", null);
__decorate([
    (0, common_1.Post)('restore/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "restore", null);
__decorate([
    (0, common_1.Get)('modifications/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "getModifications", null);
__decorate([
    (0, common_1.Get)('download/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], DemoController.prototype, "download", null);
exports.DemoController = DemoController = DemoController_1 = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('demo'),
    __metadata("design:paramtypes", [demo_service_1.DemoService])
], DemoController);
//# sourceMappingURL=demo.controller.js.map