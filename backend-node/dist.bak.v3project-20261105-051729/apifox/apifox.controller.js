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
exports.ApifoxController = void 0;
const common_1 = require("@nestjs/common");
const apifox_service_1 = require("./apifox.service");
const apifox_generator_service_1 = require("./apifox-generator.service");
const record_apifox_dto_1 = require("./dto/record-apifox.dto");
const generate_apifox_dto_1 = require("./dto/generate-apifox.dto");
const generate_full_apifox_dto_1 = require("./dto/generate-full-apifox.dto");
const list_apifox_paths_dto_1 = require("./dto/list-apifox-paths.dto");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ApifoxController = class ApifoxController {
    apifoxService;
    generatorService;
    constructor(apifoxService, generatorService) {
        this.apifoxService = apifoxService;
        this.generatorService = generatorService;
    }
    async generate(dto, userId) {
        try {
            const result = await this.generatorService.generate({ ...dto, ownerId: userId });
            return result;
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`生成失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async listPaths(dto) {
        try {
            const result = await this.generatorService.listPaths(dto);
            return result;
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`探测失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async generateFull(dto, userId) {
        try {
            const result = await this.generatorService.generateFull({ ...dto, ownerId: userId });
            return result;
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`全量生成失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    getCatalog(catalogId) {
        try {
            return this.apifoxService.getCatalog(catalogId);
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`获取目录失败: ${error.message}`, common_1.HttpStatus.NOT_FOUND);
        }
    }
    listCatalogs(userId) {
        return {
            success: true,
            items: this.apifoxService.listCatalogs(userId),
        };
    }
    record(dto) {
        const task = this.apifoxService.recordTask(dto);
        return {
            success: true,
            taskId: task.taskId,
            downloadUrl: task.downloadUrl,
        };
    }
    mine(userId) {
        return {
            success: true,
            items: this.apifoxService.listMine(userId),
        };
    }
    deleteTask(taskId, userId) {
        try {
            this.apifoxService.deleteTask(taskId, userId);
            return { success: true };
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`删除失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async download(taskId, res) {
        if (!taskId) {
            throw new common_1.HttpException('缺少 taskId', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const zipPath = this.apifoxService.getZipPath(taskId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${taskId}.zip"`);
            res.sendFile(zipPath);
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException(`下载失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ApifoxController = ApifoxController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_apifox_dto_1.GenerateApifoxDto, String]),
    __metadata("design:returntype", Promise)
], ApifoxController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('list-paths'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_apifox_paths_dto_1.ListApifoxPathsDto]),
    __metadata("design:returntype", Promise)
], ApifoxController.prototype, "listPaths", null);
__decorate([
    (0, common_1.Post)('generate-full'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_full_apifox_dto_1.GenerateFullApifoxDto, String]),
    __metadata("design:returntype", Promise)
], ApifoxController.prototype, "generateFull", null);
__decorate([
    (0, common_1.Get)('catalog/:catalogId'),
    __param(0, (0, common_1.Param)('catalogId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApifoxController.prototype, "getCatalog", null);
__decorate([
    (0, common_1.Get)('catalogs'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApifoxController.prototype, "listCatalogs", null);
__decorate([
    (0, common_1.Post)('record'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [record_apifox_dto_1.RecordApifoxDto]),
    __metadata("design:returntype", void 0)
], ApifoxController.prototype, "record", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApifoxController.prototype, "mine", null);
__decorate([
    (0, common_1.Post)('tasks/:taskId/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ApifoxController.prototype, "deleteTask", null);
__decorate([
    (0, common_1.Get)('download'),
    __param(0, (0, common_1.Query)('taskId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApifoxController.prototype, "download", null);
exports.ApifoxController = ApifoxController = __decorate([
    (0, common_1.Controller)('apifox'),
    __metadata("design:paramtypes", [apifox_service_1.ApifoxService,
        apifox_generator_service_1.ApifoxGeneratorService])
], ApifoxController);
//# sourceMappingURL=apifox.controller.js.map