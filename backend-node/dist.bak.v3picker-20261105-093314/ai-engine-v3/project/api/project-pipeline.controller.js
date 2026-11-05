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
var ProjectPipelineController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectPipelineController = void 0;
const common_1 = require("@nestjs/common");
const optional_session_guard_1 = require("../../../auth/optional-session.guard");
const project_dev_only_guard_1 = require("./project-dev-only.guard");
const project_pipeline_dto_1 = require("./dto/project-pipeline.dto");
const project_pipeline_service_1 = require("../project-pipeline.service");
let ProjectPipelineController = ProjectPipelineController_1 = class ProjectPipelineController {
    service;
    logger = new common_1.Logger(ProjectPipelineController_1.name);
    constructor(service) {
        this.service = service;
    }
    health() {
        try {
            return { success: true, ...this.service.health() };
        }
        catch (e) {
            throw new common_1.HttpException({ code: 'HEALTH_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    inspect(dto) {
        return { success: true, inspect: this.service.inspect(dto.projectDir) };
    }
    async scan(dto) {
        try {
            return { success: true, ...(await this.service.scan(dto.projectDir, dto.note)) };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S0_SCAN_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    runs() {
        return { success: true, ...this.service.listRuns() };
    }
    run(runId) {
        return { success: true, run: this.service.inspectRun(runId) };
    }
    artifact(runId, name) {
        return { success: true, artifact: this.service.readArtifact(runId, name) };
    }
    decisions(dto) {
        return {
            success: true,
            ...this.service.saveDecisions(dto.runId, dto.entries ?? []),
        };
    }
    freeze(dto) {
        try {
            return { success: true, freeze: this.service.freeze(dto.runId) };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S2_FREEZE_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ProjectPipelineController = ProjectPipelineController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('inspect'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.InspectProjectDto]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "inspect", null);
__decorate([
    (0, common_1.Post)('scan'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.ScanProjectDto]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "scan", null);
__decorate([
    (0, common_1.Get)('runs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('runs/:runId'),
    __param(0, (0, common_1.Param)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('runs/:runId/artifact'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Query)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "artifact", null);
__decorate([
    (0, common_1.Post)('decisions'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.SaveDecisionsDto]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "decisions", null);
__decorate([
    (0, common_1.Post)('freeze'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.FreezeProjectDto]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "freeze", null);
exports.ProjectPipelineController = ProjectPipelineController = ProjectPipelineController_1 = __decorate([
    (0, common_1.Controller)('v3/project'),
    (0, common_1.UseGuards)(project_dev_only_guard_1.ProjectDevOnlyGuard, optional_session_guard_1.OptionalSessionGuard),
    __metadata("design:paramtypes", [project_pipeline_service_1.ProjectPipelineService])
], ProjectPipelineController);
//# sourceMappingURL=project-pipeline.controller.js.map