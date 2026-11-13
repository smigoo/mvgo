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
var PageGeneratorController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageGeneratorController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const crypto_1 = require("crypto");
const page_generator_service_1 = require("./page-generator.service");
const generate_page_dto_1 = require("./dto/generate-page.dto");
let PageGeneratorController = PageGeneratorController_1 = class PageGeneratorController {
    pageGeneratorService;
    logger = new common_1.Logger(PageGeneratorController_1.name);
    constructor(pageGeneratorService) {
        this.pageGeneratorService = pageGeneratorService;
    }
    async generate(dto, req) {
        const { fileKey, nodeId, groupId, executionMode, concurrency } = dto;
        if (!fileKey || !nodeId) {
            throw new common_1.HttpException('参数不完整: fileKey 和 nodeId 必须提供', common_1.HttpStatus.BAD_REQUEST);
        }
        const sessionId = `page-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const userId = req.session?.userId;
        this.logger.log(`页面生成任务启动: sessionId=${sessionId}, mode=${executionMode || 'parallel'}, concurrency=${concurrency || 2}`);
        this.pageGeneratorService.startPageGeneration(sessionId, dto, groupId, userId);
        return {
            success: true,
            sessionId,
            executionMode: executionMode || 'parallel',
            concurrency: concurrency || 2,
            message: '页面级生成任务已启动',
        };
    }
    async analyze(dto) {
        const { fileKey, nodeId } = dto;
        if (!fileKey || !nodeId) {
            throw new common_1.HttpException('参数不完整: fileKey 和 nodeId 必须提供', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const components = await this.pageGeneratorService.analyzePage(fileKey, nodeId, dto.config);
            return {
                success: true,
                components,
                total: components.length,
            };
        }
        catch (error) {
            const figStatus = error?.figStatus ?? error?.response?.status;
            const figMsg = error?.response?.data?.message ||
                error?.response?.data?.err ||
                error?.message;
            const detail = figStatus
                ? figMsg
                : `页面分析失败：${figMsg}`;
            const httpStatus = figStatus === 401 || figStatus === 403
                ? common_1.HttpStatus.FORBIDDEN
                : figStatus
                    ? common_1.HttpStatus.BAD_REQUEST
                    : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            throw new common_1.HttpException({ success: false, message: detail, figmaStatus: figStatus ?? null }, httpStatus);
        }
    }
    async retryGeneration(sessionId, body, req) {
        if (!sessionId) {
            throw new common_1.HttpException('参数不完整: sessionId 必须提供', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        this.logger.log(`断点续跑请求: originalSessionId=${sessionId}, hasConfig=${!!body.config}`);
        try {
            const result = await this.pageGeneratorService.retryGeneration(sessionId, body.config, userId);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, message: error.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.PageGeneratorController = PageGeneratorController;
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_page_dto_1.GeneratePageDto, Object]),
    __metadata("design:returntype", Promise)
], PageGeneratorController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('analyze'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_page_dto_1.GeneratePageDto]),
    __metadata("design:returntype", Promise)
], PageGeneratorController.prototype, "analyze", null);
__decorate([
    (0, common_1.Post)('retry/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], PageGeneratorController.prototype, "retryGeneration", null);
exports.PageGeneratorController = PageGeneratorController = PageGeneratorController_1 = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('page-generator'),
    __metadata("design:paramtypes", [page_generator_service_1.PageGeneratorService])
], PageGeneratorController);
//# sourceMappingURL=page-generator.controller.js.map