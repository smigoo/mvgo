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
var AiProjectsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProjectsController = void 0;
const common_1 = require("@nestjs/common");
const projects_service_1 = require("./projects.service");
const project_dto_1 = require("./dto/project.dto");
const session_guard_1 = require("../../auth/session.guard");
const permissions_guard_1 = require("../../auth/permissions.guard");
const permissions_decorator_1 = require("../../auth/permissions.decorator");
const permission_constants_1 = require("../../auth/permission.constants");
const current_user_decorator_1 = require("../../auth/current-user.decorator");
let AiProjectsController = AiProjectsController_1 = class AiProjectsController {
    projectsService;
    logger = new common_1.Logger(AiProjectsController_1.name);
    constructor(projectsService) {
        this.projectsService = projectsService;
    }
    async findAll(userId) {
        const projects = await this.projectsService.findAll(userId);
        return { data: projects };
    }
    async findOne(id, userId) {
        const project = await this.projectsService.findById(id, userId);
        if (!project)
            throw new common_1.HttpException('项目不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: project };
    }
    async create(dto, userId) {
        const project = await this.projectsService.create(dto, userId);
        return { data: project };
    }
    async update(id, dto, userId) {
        const project = await this.projectsService.update(id, dto, userId);
        if (!project)
            throw new common_1.HttpException('项目不存在或无权操作', common_1.HttpStatus.NOT_FOUND);
        return { data: project };
    }
    async archive(id, userId) {
        const result = await this.projectsService.archive(id, userId);
        if (!result)
            throw new common_1.HttpException('项目不存在或无权操作', common_1.HttpStatus.NOT_FOUND);
        return { success: true };
    }
};
exports.AiProjectsController = AiProjectsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiProjectsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiProjectsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.PROJECT_CREATE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [project_dto_1.CreateProjectDto, String]),
    __metadata("design:returntype", Promise)
], AiProjectsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id'),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.PROJECT_UPDATE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, project_dto_1.UpdateProjectDto, String]),
    __metadata("design:returntype", Promise)
], AiProjectsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/delete'),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.PROJECT_DELETE),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiProjectsController.prototype, "archive", null);
exports.AiProjectsController = AiProjectsController = AiProjectsController_1 = __decorate([
    (0, common_1.Controller)('projects'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [projects_service_1.AiProjectsService])
], AiProjectsController);
//# sourceMappingURL=projects.controller.js.map