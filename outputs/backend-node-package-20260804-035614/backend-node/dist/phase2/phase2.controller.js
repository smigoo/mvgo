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
var Phase2Controller_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2Controller = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const phase2_service_1 = require("./phase2.service");
const component_service_1 = require("../component/component.service");
const doc_analyzer_service_js_1 = require("./doc/doc-analyzer.service.js");
const generate_phase2_dto_1 = require("./dto/generate-phase2.dto");
const quota_service_1 = require("../quota/quota.service");
let Phase2Controller = Phase2Controller_1 = class Phase2Controller {
    phase2Service;
    componentService;
    docAnalyzerService;
    quotaService;
    logger = new common_1.Logger(Phase2Controller_1.name);
    constructor(phase2Service, componentService, docAnalyzerService, quotaService) {
        this.phase2Service = phase2Service;
        this.componentService = componentService;
        this.docAnalyzerService = docAnalyzerService;
        this.quotaService = quotaService;
    }
    async analyzeDoc(dto) {
        try {
            return await this.docAnalyzerService.analyzeDocument(dto);
        }
        catch (error) {
            this.logger.error(`文档分析失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`文档分析失败: ${error.message}`, error.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async regenerateWithDoc(dto, req) {
        const { componentId, groupId, requirementDoc, docAnalysis, config, panelType } = dto || {};
        if (!componentId || !groupId || !requirementDoc) {
            throw new common_1.HttpException('参数不完整（componentId/groupId/requirementDoc 必填）', common_1.HttpStatus.BAD_REQUEST);
        }
        const sessionId = `mc-doc-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const userId = req.session?.userId;
        try {
            await this.phase2Service.regenerateWithDoc(sessionId, {
                componentId,
                groupId,
                requirementDoc,
                docAnalysis,
                config: config || {},
                userId,
                panelType,
            });
            return { success: true, sessionId, message: '路径B 文档纠偏再生成已开始' };
        }
        catch (error) {
            this.logger.error(`路径B 发起失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`路径B 发起失败: ${error.message}`, error.status || common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getQuota(req) {
        const userId = req.session?.userId;
        if (!userId) {
            return {
                success: false,
                error: '未登录',
            };
        }
        const quota = await this.quotaService.getQuotaStatus(userId);
        return {
            success: true,
            data: quota,
        };
    }
    async generate(dto, req) {
        const { fileKey, nodeId, groupId } = dto;
        if (!fileKey || !nodeId) {
            throw new common_1.HttpException('参数不完整', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        if (userId) {
            try {
                await this.quotaService.checkQuota(userId);
            }
            catch (error) {
                if (error instanceof common_1.HttpException) {
                    throw error;
                }
                this.logger.error(`配额检查失败: ${error.message}`, error.stack);
                throw new common_1.HttpException('配额检查服务异常', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        const idPrefix = dto.target === 'vue3' ? 'mv' : 'mc';
        const sessionId = `${idPrefix}-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        if (!dto.componentName) {
            dto.componentName = sessionId;
        }
        this.logger.debug(`[DEBUG] Session keys: ${req.session ? Object.keys(req.session).join(', ') : 'NO SESSION'}`);
        this.logger.debug(`[DEBUG] userId from session: ${userId}`);
        this.logger.debug(`[DEBUG] groupId from DTO: ${groupId}`);
        this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
        return {
            success: true,
            sessionId,
            message: 'Phase 2 生成任务已开始',
        };
    }
    async downloadComponent(componentId, req, res) {
        try {
            const userId = req.session?.userId;
            if (!userId) {
                throw new common_1.HttpException('未登录', common_1.HttpStatus.UNAUTHORIZED);
            }
            const authorized = await this.componentService.authorizeWorkspaceComponent(componentId, userId, 'read');
            const zipBuffer = await this.phase2Service.packageComponent(authorized.componentId, authorized.target, authorized.groupId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${authorized.componentId}.zip"`);
            res.send(zipBuffer);
        }
        catch (error) {
            this.logger.error(`下载组件失败: ${error.message}`, error.stack);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException(`下载组件失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.Phase2Controller = Phase2Controller;
__decorate([
    (0, common_1.Post)('analyze-doc'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "analyzeDoc", null);
__decorate([
    (0, common_1.Post)('regenerate-with-doc'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "regenerateWithDoc", null);
__decorate([
    (0, common_1.Get)('quota'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "getQuota", null);
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_phase2_dto_1.GeneratePhase2Dto, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "generate", null);
__decorate([
    (0, common_1.Get)('download/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "downloadComponent", null);
exports.Phase2Controller = Phase2Controller = Phase2Controller_1 = __decorate([
    (0, common_1.Controller)('phase2'),
    __metadata("design:paramtypes", [phase2_service_1.Phase2Service,
        component_service_1.ComponentService,
        doc_analyzer_service_js_1.DocAnalyzerService,
        quota_service_1.QuotaService])
], Phase2Controller);
//# sourceMappingURL=phase2.controller.js.map