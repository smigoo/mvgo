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
exports.PageSkeletonController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const path_1 = require("path");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const session_guard_1 = require("../auth/session.guard");
const page_skeleton_service_1 = require("./page-skeleton.service");
let PageSkeletonController = class PageSkeletonController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    async create(userId, file, body) {
        if (!body.groupId) {
            return { success: false, code: 400, message: '缺少 groupId', data: null, source: 'page-skeleton' };
        }
        return this.svc.create(userId, { groupId: body.groupId, name: body.name, figmaUrl: body.figmaUrl }, file);
    }
    async list(userId, groupId) {
        return this.svc.list(userId, groupId);
    }
    async getOne(userId, groupId, id) {
        return this.svc.getOne(userId, id, groupId);
    }
    async update(userId, groupId, id, body) {
        return this.svc.update(userId, id, groupId, body);
    }
    async download(userId, groupId, id, res) {
        try {
            const buf = await this.svc.downloadZip(userId, id, groupId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${id}.zip"`);
            res.send(buf);
        }
        catch (e) {
            res.status(400).json({ success: false, code: 400, message: e.message || '下载失败', data: null });
        }
    }
    async remove(userId, groupId, id) {
        return this.svc.remove(userId, id, groupId);
    }
    async retry(userId, groupId, id) {
        return this.svc.retry(userId, id, groupId);
    }
    async files(userId, groupId, id) {
        return this.svc.listPageFiles(groupId, id);
    }
    async readFile(groupId, id, filePath, raw, res) {
        if (!filePath) {
            return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
        }
        const info = await this.svc.readPageFile(groupId, id, filePath);
        if (raw === '1' && info.isBinary) {
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
            return res.sendFile(info.absPath);
        }
        return res.json({ success: true, content: info.content });
    }
    async writeFile(userId, groupId, id, body) {
        if (!body?.path) {
            return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
        }
        return this.svc.writePageFile(groupId, id, body.path, body.content ?? '');
    }
    async createFolder(userId, groupId, id, body) {
        if (!body?.path) {
            return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
        }
        return this.svc.createPageFolder(groupId, id, body.path);
    }
    async renameFile(userId, groupId, id, body) {
        if (!body?.oldPath || !body?.newPath) {
            return { success: false, code: 400, message: '缺少 oldPath/newPath', data: null, source: 'page-skeleton' };
        }
        return this.svc.renamePageFile(groupId, id, body.oldPath, body.newPath);
    }
    async deleteFile(userId, groupId, id, filePath) {
        if (!filePath) {
            return { success: false, code: 400, message: '缺少 path', data: null, source: 'page-skeleton' };
        }
        return this.svc.deletePageFile(groupId, id, filePath);
    }
};
exports.PageSkeletonController = PageSkeletonController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':groupId/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':groupId/:id/download'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "download", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/retry'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "retry", null);
__decorate([
    (0, common_1.Get)(':groupId/:id/files'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "files", null);
__decorate([
    (0, common_1.Get)(':groupId/:id/file'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('path')),
    __param(3, (0, common_1.Query)('raw')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "readFile", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/file'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "writeFile", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/folder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "createFolder", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/rename'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "renameFile", null);
__decorate([
    (0, common_1.Post)(':groupId/:id/file/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Query)('path')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], PageSkeletonController.prototype, "deleteFile", null);
exports.PageSkeletonController = PageSkeletonController = __decorate([
    (0, common_1.Controller)('page-skeleton'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [page_skeleton_service_1.PageSkeletonService])
], PageSkeletonController);
//# sourceMappingURL=page-skeleton.controller.js.map