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
const session_guard_1 = require("../../../auth/session.guard");
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
    async pickDir(dto) {
        return { success: true, ...(await this.service.pickDirectory(dto?.projectDir)) };
    }
    browseDir(dirPath) {
        return { success: true, browse: this.service.browseDirectory(dirPath) };
    }
    inspect(dto) {
        return { success: true, inspect: this.service.inspect(dto.projectDir) };
    }
    async scan(dto, req) {
        try {
            return {
                success: true,
                ...(await this.service.scan(dto.projectDir, dto.note, req?.session?.userId ?? undefined, {
                    vision: dto.vision === true,
                    enrich: dto.enrich === 'sync' ? 'sync' : 'defer',
                })),
            };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S0_SCAN_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    runs(req) {
        return { success: true, ...this.service.listRuns(req?.session?.userId ?? undefined) };
    }
    async run(runId, req) {
        return {
            success: true,
            run: await this.service.inspectRun(runId, req?.session?.userId ?? undefined),
        };
    }
    async units(runId, refresh, req) {
        try {
            return {
                success: true,
                units: await this.service.getUnits(runId, req?.session?.userId ?? undefined, {
                    refresh: refresh === 'true' || refresh === '1',
                }),
            };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'UNITS_BUILD_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async artifact(runId, name, req) {
        return {
            success: true,
            artifact: await this.service.readArtifact(runId, name, req?.session?.userId ?? undefined),
        };
    }
    generatedFiles(runId, req) {
        return {
            success: true,
            files: this.service.listGeneratedFiles(runId, req?.session?.userId ?? undefined),
        };
    }
    deleteRun(runId, req) {
        try {
            return { success: true, ...this.service.deleteRun(runId, req?.session?.userId ?? undefined) };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'RUN_DELETE_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    decisions(dto, req) {
        return {
            success: true,
            ...this.service.saveDecisions(dto.runId, dto.entries ?? [], req?.session?.userId ?? undefined),
        };
    }
    async freeze(dto, req) {
        try {
            return {
                success: true,
                freeze: await this.service.freeze(dto.runId, req?.session?.userId ?? undefined),
            };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S2_FREEZE_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async generate(dto, req) {
        try {
            return {
                success: true,
                generate: await this.service.generate(dto.runId, req?.session?.userId ?? undefined),
            };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S3_GENERATE_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async generateVue(dto, req) {
        try {
            return {
                success: true,
                generateVue: await this.service.generateVue(dto.runId, req?.session?.userId ?? undefined),
            };
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S4_GENERATE_VUE_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    getBinding(runId, req) {
        try {
            return this.service.getBinding(runId, req?.session?.userId ?? undefined);
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S4_GET_BINDING_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    setBinding(runId, dto, req) {
        try {
            return this.service.setBinding(runId, dto, req?.session?.userId ?? undefined);
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S4_SET_BINDING_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    getEmbeds(runId, req) {
        try {
            return this.service.getEmbeds(runId, req?.session?.userId ?? undefined);
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S4_GET_EMBEDS_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    setEmbeds(runId, dto, req) {
        try {
            return this.service.setEmbeds(runId, dto, req?.session?.userId ?? undefined);
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S4_SET_EMBEDS_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async generatedZip(runId, req) {
        try {
            const { buffer, filename } = await this.service.generateZip(runId, req?.session?.userId ?? undefined);
            return new common_1.StreamableFile(buffer, {
                type: 'application/zip',
                disposition: `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            });
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            throw new common_1.HttpException({ code: 'S3_ZIP_FAILED', message: e.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
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
    (0, common_1.Post)('pick-dir'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.PickProjectDto]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "pickDir", null);
__decorate([
    (0, common_1.Get)('browse-dir'),
    __param(0, (0, common_1.Query)('path')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "browseDir", null);
__decorate([
    (0, common_1.Post)('inspect'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.InspectProjectDto]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "inspect", null);
__decorate([
    (0, common_1.Post)('scan'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.ScanProjectDto, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "scan", null);
__decorate([
    (0, common_1.Get)('runs'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('runs/:runId'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('runs/:runId/units'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Query)('refresh')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "units", null);
__decorate([
    (0, common_1.Get)('runs/:runId/artifact'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Query)('name')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "artifact", null);
__decorate([
    (0, common_1.Get)('runs/:runId/generated-files'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "generatedFiles", null);
__decorate([
    (0, common_1.Delete)('runs/:runId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "deleteRun", null);
__decorate([
    (0, common_1.Post)('decisions'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.SaveDecisionsDto, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "decisions", null);
__decorate([
    (0, common_1.Post)('freeze'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.FreezeProjectDto, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "freeze", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.GenerateProjectDto, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('generate-vue'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_pipeline_dto_1.GenerateProjectDto, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "generateVue", null);
__decorate([
    (0, common_1.Get)('runs/:runId/binding'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "getBinding", null);
__decorate([
    (0, common_1.Post)('runs/:runId/binding'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "setBinding", null);
__decorate([
    (0, common_1.Get)('runs/:runId/embeds'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "getEmbeds", null);
__decorate([
    (0, common_1.Post)('runs/:runId/embeds'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectPipelineController.prototype, "setEmbeds", null);
__decorate([
    (0, common_1.Get)('runs/:runId/generated-zip'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ProjectPipelineController.prototype, "generatedZip", null);
exports.ProjectPipelineController = ProjectPipelineController = ProjectPipelineController_1 = __decorate([
    (0, common_1.Controller)('v3/project'),
    (0, common_1.UseGuards)(project_dev_only_guard_1.ProjectDevOnlyGuard, optional_session_guard_1.OptionalSessionGuard),
    __metadata("design:paramtypes", [project_pipeline_service_1.ProjectPipelineService])
], ProjectPipelineController);
//# sourceMappingURL=project-pipeline.controller.js.map