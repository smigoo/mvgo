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
var ComponentController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentController = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const component_service_1 = require("./component.service");
const gitlab_push_service_1 = require("./gitlab-push.service");
const component_analysis_service_1 = require("./component-analysis.service");
const phase2_service_1 = require("../phase2/phase2.service");
const session_guard_1 = require("../auth/session.guard");
const permissions_guard_1 = require("../auth/permissions.guard");
const permissions_decorator_1 = require("../auth/permissions.decorator");
const permission_constants_1 = require("../auth/permission.constants");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const list_components_dto_1 = require("./dto/list-components.dto");
let ComponentController = ComponentController_1 = class ComponentController {
    componentService;
    componentAnalysisService;
    phase2Service;
    gitlabPushService;
    logger = new common_1.Logger(ComponentController_1.name);
    constructor(componentService, componentAnalysisService, phase2Service, gitlabPushService) {
        this.componentService = componentService;
        this.componentAnalysisService = componentAnalysisService;
        this.phase2Service = phase2Service;
        this.gitlabPushService = gitlabPushService;
    }
    async createComponent(body, session) {
        const component = await this.componentService.createComponent(body.name, body.description || '', body.groupId, session.userId, body.metadata || {});
        return {
            success: true,
            message: '组件创建成功',
            component,
        };
    }
    async listComponents(query, userId) {
        const result = await this.componentService.listComponents(query, userId);
        return {
            success: true,
            data: result,
        };
    }
    async getGroupComponents(groupId, userId) {
        const components = await this.componentService.getGroupComponents(groupId, userId);
        return {
            success: true,
            components,
        };
    }
    async getComponentBySessionId(sessionId, userId) {
        const component = await this.componentService.getComponentBySessionId(sessionId, userId);
        return {
            success: true,
            component,
        };
    }
    async listGitLabProjects(body) {
        try {
            const projects = await this.gitlabPushService.listProjects(body.accessToken);
            return { success: true, data: projects };
        }
        catch (err) {
            return { success: false, message: err?.message || '加载项目失败', data: null };
        }
    }
    async listGitLabBranches(body) {
        try {
            const branches = await this.gitlabPushService.listBranches(body.accessToken, body.repoUrl);
            return { success: true, data: branches };
        }
        catch (err) {
            return { success: false, message: err?.message || '加载分支失败', data: null };
        }
    }
    async proxyGitLabProjects(body) {
        return this.gitlabPushService.proxyGitLabGet(body.accessToken, body.endpoint);
    }
    async pushComponentToGitLab(body, userId) {
        return this.gitlabPushService.pushComponent({
            identifier: body.componentId,
            userId,
            repoUrl: body.repoUrl,
            branch: body.branch,
            accessToken: body.accessToken,
            commitMessage: body.commitMessage,
            commit: body.commit,
        });
    }
    async getComponentById(componentId, userId) {
        const component = await this.componentService.getComponentById(componentId, userId);
        return {
            success: true,
            component,
        };
    }
    async updateComponent(componentId, body, session) {
        const component = await this.componentService.updateComponent(componentId, body.name, body.description || '', body.metadata || {}, session.userId);
        return {
            success: true,
            message: '组件更新成功',
            component,
        };
    }
    async deleteComponent(componentId, session) {
        await this.componentService.deleteComponent(componentId, session.userId);
        return {
            success: true,
            message: '组件已删除',
        };
    }
    async publishComponent(componentId, session) {
        const component = await this.componentService.publishComponent(componentId, session.userId);
        return {
            success: true,
            message: '已发布到公共组件池',
            data: {
                _id: component._id?.toString?.() || component._id,
                visibility: component.visibility,
                sharedAt: component.sharedAt,
            },
        };
    }
    async unpublishComponent(componentId, session) {
        const component = await this.componentService.unpublishComponent(componentId, session.userId);
        return {
            success: true,
            message: '已从公共组件池下架',
            data: {
                _id: component._id?.toString?.() || component._id,
                visibility: component.visibility,
            },
        };
    }
    async batchDeleteComponents(body, session) {
        if (!body.componentIds || !Array.isArray(body.componentIds) || body.componentIds.length === 0) {
            throw new common_1.HttpException('请提供要删除的组件 ID 列表', common_1.HttpStatus.BAD_REQUEST);
        }
        const result = await this.componentService.batchDeleteComponents(body.componentIds, session.userId);
        return {
            success: true,
            message: `成功删除 ${result.deleted} 个组件` + (result.failed > 0 ? `，${result.failed} 个失败` : ''),
            ...result,
        };
    }
    async getComponentFiles(componentId, userId) {
        try {
            const files = await this.componentService.getComponentFiles(componentId, userId);
            return {
                success: true,
                files,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async getComponentDeclare(componentId, userId) {
        try {
            const declare = await this.componentService.getComponentDeclare(componentId, userId);
            return {
                success: true,
                declare,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async analyzeComponentVisual(componentId, userId, body) {
        return this.componentAnalysisService.analyzeComponent(componentId, userId, body || {});
    }
    async getFileContent(componentId, filePath, raw, session, res) {
        try {
            const userId = session?.userId;
            if (raw === '1') {
                const fullPath = await this.componentService.resolveComponentFilePath(componentId, filePath, userId);
                const ext = (0, path_1.extname)(filePath).toLowerCase();
                const mimeMap = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml; charset=utf-8',
                    '.webp': 'image/webp',
                    '.bmp': 'image/bmp',
                    '.ico': 'image/x-icon',
                };
                res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
                res.setHeader('Cache-Control', 'private, max-age=60');
                return res.sendFile(fullPath, { dotfiles: 'allow' });
            }
            const content = await this.componentService.getFileContent(componentId, filePath, userId);
            return res.json({
                success: true,
                content,
            });
        }
        catch (error) {
            return res.json({
                success: false,
                error: error.message,
            });
        }
    }
    async saveFileContent(componentId, filePath, content, userId) {
        try {
            await this.componentService.saveFileContent(componentId, filePath, content, userId);
            return {
                success: true,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async deleteComponentFile(componentId, filePath, userId) {
        try {
            await this.componentService.deleteComponentPath(componentId, filePath, userId);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async renameComponentFile(componentId, oldPath, newPath, userId) {
        try {
            await this.componentService.renameComponentPath(componentId, oldPath, newPath, userId);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async createComponentFolder(componentId, folderPath, userId) {
        try {
            await this.componentService.createComponentFolder(componentId, folderPath, userId);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async downloadComponent(componentId, userId, res) {
        try {
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
exports.ComponentController = ComponentController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_CREATE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "createComponent", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_components_dto_1.ListComponentsDto, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "listComponents", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)('groupId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getGroupComponents", null);
__decorate([
    (0, common_1.Get)('by-session/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getComponentBySessionId", null);
__decorate([
    (0, common_1.Post)('gitlab-projects'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "listGitLabProjects", null);
__decorate([
    (0, common_1.Post)('gitlab-branches'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "listGitLabBranches", null);
__decorate([
    (0, common_1.Post)('gitlab-projects-proxy'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "proxyGitLabProjects", null);
__decorate([
    (0, common_1.Post)('push-to-gitlab'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "pushComponentToGitLab", null);
__decorate([
    (0, common_1.Get)(':componentId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getComponentById", null);
__decorate([
    (0, common_1.Post)(':componentId'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_UPDATE),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "updateComponent", null);
__decorate([
    (0, common_1.Post)(':componentId/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_DELETE),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "deleteComponent", null);
__decorate([
    (0, common_1.Post)(':componentId/publish'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_UPDATE),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "publishComponent", null);
__decorate([
    (0, common_1.Post)(':componentId/unpublish'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_UPDATE),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "unpublishComponent", null);
__decorate([
    (0, common_1.Post)('batch-delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.COMPONENT_DELETE),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "batchDeleteComponents", null);
__decorate([
    (0, common_1.Get)(':componentId/files'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getComponentFiles", null);
__decorate([
    (0, common_1.Get)(':componentId/declare'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getComponentDeclare", null);
__decorate([
    (0, common_1.Post)(':componentId/analyze-visual'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "analyzeComponentVisual", null);
__decorate([
    (0, common_1.Get)(':componentId/file'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Query)('path')),
    __param(2, (0, common_1.Query)('raw')),
    __param(3, (0, common_1.Session)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "getFileContent", null);
__decorate([
    (0, common_1.Post)(':componentId/file'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Query)('path')),
    __param(2, (0, common_1.Body)('content')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "saveFileContent", null);
__decorate([
    (0, common_1.Post)(':componentId/file/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Query)('path')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "deleteComponentFile", null);
__decorate([
    (0, common_1.Post)(':componentId/rename'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Body)('oldPath')),
    __param(2, (0, common_1.Body)('newPath')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "renameComponentFile", null);
__decorate([
    (0, common_1.Post)(':componentId/folder'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Body)('path')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "createComponentFolder", null);
__decorate([
    (0, common_1.Get)('download/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.OptionalUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ComponentController.prototype, "downloadComponent", null);
exports.ComponentController = ComponentController = ComponentController_1 = __decorate([
    (0, common_1.Controller)('component'),
    __metadata("design:paramtypes", [component_service_1.ComponentService,
        component_analysis_service_1.ComponentAnalysisService,
        phase2_service_1.Phase2Service,
        gitlab_push_service_1.GitlabPushService])
], ComponentController);
//# sourceMappingURL=component.controller.js.map