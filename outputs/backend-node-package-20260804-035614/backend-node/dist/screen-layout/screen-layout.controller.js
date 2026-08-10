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
var ScreenLayoutController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenLayoutController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const screen_layout_service_1 = require("./screen-layout.service");
const progress_service_1 = require("../progress/progress.service");
let ScreenLayoutController = ScreenLayoutController_1 = class ScreenLayoutController {
    screenLayoutService;
    progressService;
    logger = new common_1.Logger(ScreenLayoutController_1.name);
    constructor(screenLayoutService, progressService) {
        this.screenLayoutService = screenLayoutService;
        this.progressService = progressService;
    }
    async download(body, res) {
        const layout = body.layout;
        if (!layout) {
            return res.status(400).json({ success: false, error: '缺少 layout 参数' });
        }
        try {
            this.logger.log(`下载请求: ${layout.name || layout.id}`);
            const zipBuffer = await this.screenLayoutService.generateZip(layout);
            const safeName = (layout.name || 'screen-layout').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_');
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.zip"`);
            res.setHeader('Content-Length', zipBuffer.length);
            res.send(zipBuffer);
        }
        catch (err) {
            this.logger.error(`下载失败: ${err.message}`, err.stack);
            res.status(500).json({ success: false, error: err.message });
        }
    }
    async analyzeSpatial(body) {
        const layout = body.layout;
        if (!layout) {
            return { success: false, error: '缺少 layout 参数' };
        }
        try {
            this.logger.log(`空间分析请求: ${layout.name || layout.id}`);
            const report = this.screenLayoutService.analyzeSpatial(layout);
            return { success: true, data: report };
        }
        catch (err) {
            this.logger.error(`空间分析失败: ${err.message}`, err.stack);
            return { success: false, error: err.message };
        }
    }
    async analyzeResponsive(body, req) {
        const layout = body.layout;
        if (!layout) {
            return { success: false, error: '缺少 layout 参数' };
        }
        try {
            const sessionId = `lr-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
            const userId = req.session?.userId;
            this.logger.log(`响应式生成请求: ${layout.name || layout.id} → ${sessionId}`);
            this.screenLayoutService.startResponsiveGeneration(sessionId, layout, userId);
            return { success: true, sessionId };
        }
        catch (err) {
            this.logger.error(`响应式生成启动失败: ${err.message}`, err.stack);
            return { success: false, error: err.message };
        }
    }
    streamProgress(sessionId, res, req) {
        try {
            return this.progressService.register(sessionId, res);
        }
        catch (err) {
            this.logger.warn(`SSE 注册失败: ${sessionId}`, err.message);
            res.status(404).json({ success: false, error: 'Session not found' });
        }
    }
    async downloadResponsive(sessionId, res) {
        try {
            this.logger.log(`下载响应式结果: ${sessionId}`);
            const zipBuffer = await this.screenLayoutService.getGeneratedZip(sessionId);
            if (!zipBuffer) {
                return res.status(404).json({ success: false, error: '生成结果不存在或已过期' });
            }
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="responsive-${sessionId}.zip"`);
            res.setHeader('Content-Length', zipBuffer.length);
            res.send(zipBuffer);
        }
        catch (err) {
            this.logger.error(`下载响应式结果失败: ${err.message}`, err.stack);
            res.status(500).json({ success: false, error: err.message });
        }
    }
};
exports.ScreenLayoutController = ScreenLayoutController;
__decorate([
    (0, common_1.Post)('download'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ScreenLayoutController.prototype, "download", null);
__decorate([
    (0, common_1.Post)('analyze-spatial'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScreenLayoutController.prototype, "analyzeSpatial", null);
__decorate([
    (0, common_1.Post)('analyze-responsive'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ScreenLayoutController.prototype, "analyzeResponsive", null);
__decorate([
    (0, common_1.Get)('progress/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ScreenLayoutController.prototype, "streamProgress", null);
__decorate([
    (0, common_1.Get)('download-responsive/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ScreenLayoutController.prototype, "downloadResponsive", null);
exports.ScreenLayoutController = ScreenLayoutController = ScreenLayoutController_1 = __decorate([
    (0, common_1.Controller)('screen-layout'),
    __metadata("design:paramtypes", [screen_layout_service_1.ScreenLayoutService,
        progress_service_1.ProgressService])
], ScreenLayoutController);
//# sourceMappingURL=screen-layout.controller.js.map