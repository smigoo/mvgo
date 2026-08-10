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
var Vue3Controller_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vue3Controller = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const vue3_service_1 = require("./vue3.service");
const generate_vue3_dto_1 = require("./dto/generate-vue3.dto");
const analyze_slots_dto_1 = require("./dto/analyze-slots.dto");
const analyze_from_doc_dto_1 = require("./dto/analyze-from-doc.dto");
const bind_api_dto_1 = require("./dto/bind-api.dto");
const slot_analyzer_service_1 = require("./slot-analyzer.service");
const doc_analyzer_service_1 = require("./doc-analyzer.service");
const api_binding_service_1 = require("./api-binding.service");
const quota_service_1 = require("../quota/quota.service");
let Vue3Controller = Vue3Controller_1 = class Vue3Controller {
    vue3Service;
    slotAnalyzer;
    docAnalyzer;
    apiBindingService;
    quotaService;
    logger = new common_1.Logger(Vue3Controller_1.name);
    constructor(vue3Service, slotAnalyzer, docAnalyzer, apiBindingService, quotaService) {
        this.vue3Service = vue3Service;
        this.slotAnalyzer = slotAnalyzer;
        this.docAnalyzer = docAnalyzer;
        this.apiBindingService = apiBindingService;
        this.quotaService = quotaService;
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
        const sessionId = `mv-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        if (!dto.componentName) {
            dto.componentName = sessionId;
        }
        this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
        return {
            success: true,
            sessionId,
            message: 'Vue3 生成任务已开始',
        };
    }
    async analyzeSlots(dto) {
        try {
            const result = await this.slotAnalyzer.analyzeSlots(dto.componentId, dto.groupId);
            return { success: true, ...result };
        }
        catch (error) {
            this.logger.error(`[analyzeSlots] ${error.message}`);
            throw new common_1.HttpException({ success: false, error: error.message, slots: [] }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async analyzeFromDoc(dto) {
        try {
            const result = await this.docAnalyzer.analyzeFromDoc(dto);
            return result;
        }
        catch (error) {
            this.logger.error(`[analyzeFromDoc] ${error.message}`);
            throw new common_1.HttpException({
                success: false,
                error: error.message,
                bindings: [],
                summary: `分析失败: ${error.message}`,
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async bindApi(dto) {
        try {
            const result = await this.apiBindingService.bindApi(dto);
            return result;
        }
        catch (error) {
            this.logger.error(`[bindApi] ${error.message}`);
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException({ success: false, error: error.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    getBindings(componentId) {
        if (!componentId) {
            return { success: false, error: '缺少 componentId 参数' };
        }
        const bindings = this.apiBindingService.getBindings(componentId);
        return { success: true, bindings };
    }
    getBinding(bindingId) {
        const binding = this.apiBindingService.getBinding(bindingId);
        if (!binding) {
            return { success: false, error: '绑定记录不存在' };
        }
        return { success: true, binding };
    }
    async unbind(bindingId) {
        try {
            const result = await this.apiBindingService.unbind(bindingId);
            return result;
        }
        catch (error) {
            this.logger.error(`[unbind] ${error.message}`);
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException({ success: false, error: error.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.Vue3Controller = Vue3Controller;
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_vue3_dto_1.GenerateVue3Dto, Object]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('analyze-slots'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [analyze_slots_dto_1.AnalyzeSlotsDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "analyzeSlots", null);
__decorate([
    (0, common_1.Post)('analyze-from-doc'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [analyze_from_doc_dto_1.AnalyzeFromDocDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "analyzeFromDoc", null);
__decorate([
    (0, common_1.Post)('bind-api'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bind_api_dto_1.BindApiDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "bindApi", null);
__decorate([
    (0, common_1.Get)('bindings'),
    __param(0, (0, common_1.Query)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], Vue3Controller.prototype, "getBindings", null);
__decorate([
    (0, common_1.Get)('bindings/:bindingId'),
    __param(0, (0, common_1.Param)('bindingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], Vue3Controller.prototype, "getBinding", null);
__decorate([
    (0, common_1.Delete)('bindings/:bindingId'),
    __param(0, (0, common_1.Param)('bindingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "unbind", null);
exports.Vue3Controller = Vue3Controller = Vue3Controller_1 = __decorate([
    (0, common_1.Controller)('vue3'),
    __metadata("design:paramtypes", [vue3_service_1.Vue3Service,
        slot_analyzer_service_1.SlotAnalyzerService,
        doc_analyzer_service_1.DocAnalyzerService,
        api_binding_service_1.ApiBindingService,
        quota_service_1.QuotaService])
], Vue3Controller);
//# sourceMappingURL=vue3.controller.js.map