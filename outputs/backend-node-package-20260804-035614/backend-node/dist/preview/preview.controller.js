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
exports.PreviewController = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
let PreviewController = class PreviewController {
    async serveComponentFile(groupId, componentId, filePath, exists, res) {
        if (filePath) {
            filePath = filePath.replace(/,/g, '/');
        }
        const basePath = (0, path_1.join)(process.cwd(), 'workspace', 'custom-components');
        let componentDir = null;
        try {
            const dirs = await (0, promises_1.readdir)(basePath);
            const matchedDir = dirs.find((dir) => dir === componentId) ||
                dirs.find((dir) => dir.startsWith(`${componentId}-`));
            if (matchedDir) {
                componentDir = (0, path_1.join)(basePath, matchedDir);
            }
        }
        catch (error) {
        }
        if (!componentDir) {
            const groupPath = (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId);
            try {
                const compDirs = await (0, promises_1.readdir)(groupPath);
                const matchedDir = compDirs.find((dir) => dir === componentId) ||
                    compDirs.find((dir) => dir.startsWith(`${componentId}-`));
                if (matchedDir) {
                    componentDir = (0, path_1.join)(groupPath, matchedDir);
                }
            }
            catch {
            }
        }
        if (!componentDir || !(0, fs_1.existsSync)(componentDir)) {
            throw new common_1.NotFoundException('组件不存在');
        }
        const resolvedComponentDir = (0, path_1.resolve)(componentDir);
        const fullPath = (0, path_1.resolve)(resolvedComponentDir, filePath || 'index.html');
        if (fullPath !== resolvedComponentDir &&
            !fullPath.startsWith(`${resolvedComponentDir}${path_1.sep}`)) {
            throw new common_1.ForbiddenException('非法的文件路径');
        }
        const isExistsCheck = exists === '1';
        const fileExists = (0, fs_1.existsSync)(fullPath);
        if (isExistsCheck) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(200).json({ exists: fileExists });
        }
        if (!fileExists) {
            throw new common_1.NotFoundException('文件不存在');
        }
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' blob:",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'none'",
        ].join('; '));
        res.sendFile(fullPath);
    }
};
exports.PreviewController = PreviewController;
__decorate([
    (0, common_1.Get)(':groupId/:componentId/*path'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('componentId')),
    __param(2, (0, common_1.Param)('path')),
    __param(3, (0, common_1.Query)('exists')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PreviewController.prototype, "serveComponentFile", null);
exports.PreviewController = PreviewController = __decorate([
    (0, common_1.Controller)('preview')
], PreviewController);
//# sourceMappingURL=preview.controller.js.map