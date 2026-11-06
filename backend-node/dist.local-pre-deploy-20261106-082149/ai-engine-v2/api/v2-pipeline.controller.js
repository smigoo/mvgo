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
var V2PipelineController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2PipelineController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const optional_session_guard_1 = require("../../auth/optional-session.guard");
const session_guard_1 = require("../../auth/session.guard");
const progress_service_1 = require("../../progress/progress.service");
const tasks_service_1 = require("../../tasks/tasks.service");
const dev_only_guard_1 = require("./dev-only.guard");
const v2_pipeline_dto_1 = require("./dto/v2-pipeline.dto");
const v2_pipeline_service_1 = require("./v2-pipeline.service");
let V2PipelineController = V2PipelineController_1 = class V2PipelineController {
    service;
    tasksService;
    progressService;
    logger = new common_1.Logger(V2PipelineController_1.name);
    constructor(service, tasksService, progressService) {
        this.service = service;
        this.tasksService = tasksService;
        this.progressService = progressService;
    }
    async catalog() {
        try {
            return { success: true, ...(await this.service.getCatalog()) };
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'CATALOG_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async health(req) {
        try {
            return { success: true, ...(await this.service.health(req.session?.userId)) };
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'HEALTH_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async preview(dto, req) {
        try {
            return { success: true, preview: await this.service.preview(dto, req.session?.userId) };
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'INVALID_PIPELINE_CONFIG', message: e.message }, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async generate(dto, req) {
        const userId = req.session?.userId;
        const groupId = await this.service.resolveGroupId(dto.groupId, userId);
        const sourceType = dto.sourceType || 'screenshot';
        let preview;
        try {
            preview = await this.service.preview(dto, userId);
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'INVALID_PIPELINE_CONFIG', message: e.message }, common_1.HttpStatus.BAD_REQUEST);
        }
        if (!preview.credentialsOk) {
            const hints = preview.missingCredentials
                .map((m) => `${m.channel}.${m.field}（${m.hint}）`)
                .join('；');
            throw new common_1.HttpException({ code: 'MISSING_CREDENTIALS', message: `凭证缺失，无法生成：${hints}` }, common_1.HttpStatus.BAD_REQUEST);
        }
        const specTag = (dto.spec || 'microcode').replace(/[^a-z0-9]+/gi, '').slice(0, 8) || 'spec';
        const sessionId = `v2-${specTag}-${dto.tier || 'lite'}-${Date.now()}-${(0, crypto_1.randomBytes)(3).toString('hex')}`;
        this.tasksService.createTask(sessionId, this.service.buildTaskMetadata(sessionId, dto, groupId, userId), 'running');
        this.service
            .runGeneration(sessionId, dto, groupId, userId)
            .catch((e) => this.logger.error(`[v2] 任务 ${sessionId} 结束于异常: ${e.message}`));
        return {
            success: true,
            sessionId,
            spec: preview.spec,
            tier: preview.tier,
            sourceType,
            llmCallCount: preview.llmCallCount,
            steps: preview.steps,
            progressUrl: `/api/progress/${sessionId}`,
            message: 'v2 可配管线任务已启动',
        };
    }
    async uploadSpec(specDef) {
        try {
            const result = await this.service.uploadSpec(specDef);
            return { success: true, ...result, message: `自定义规范 "${result.id}" 已上传` };
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'SPEC_UPLOAD_FAILED', message: e.message }, common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.V2PipelineController = V2PipelineController;
__decorate([
    (0, common_1.Get)('catalog'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], V2PipelineController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('health'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], V2PipelineController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('preview'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [v2_pipeline_dto_1.PreviewV2Dto, Object]),
    __metadata("design:returntype", Promise)
], V2PipelineController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [v2_pipeline_dto_1.GenerateV2Dto, Object]),
    __metadata("design:returntype", Promise)
], V2PipelineController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('specs/upload'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], V2PipelineController.prototype, "uploadSpec", null);
exports.V2PipelineController = V2PipelineController = V2PipelineController_1 = __decorate([
    (0, common_1.Controller)('v2/pipeline'),
    (0, common_1.UseGuards)(dev_only_guard_1.DevOnlyGuard, optional_session_guard_1.OptionalSessionGuard),
    __metadata("design:paramtypes", [v2_pipeline_service_1.V2PipelineService,
        tasks_service_1.TasksService,
        progress_service_1.ProgressService])
], V2PipelineController);
//# sourceMappingURL=v2-pipeline.controller.js.map