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
const component_resolver_js_1 = require("../ai-engine/utils/component-resolver.js");
const promises_1 = require("fs/promises");
const backend_root_1 = require("../config/backend-root");
function collectComponentRoots() {
    const roots = [
        backend_root_1.customComponentsDir,
        (0, path_1.join)((0, backend_root_1.resolveFrontendWorkspacePath)(), 'custom-components'),
    ];
    return [...new Set(roots)];
}
function collectPageRoots() {
    const roots = [
        (0, path_1.join)(backend_root_1.workspaceRoot, 'vue3-pages'),
        (0, path_1.join)((0, backend_root_1.resolveFrontendWorkspacePath)(), 'vue3-pages'),
    ];
    return [...new Set(roots)];
}
let PreviewController = class PreviewController {
    async servePageFile(groupId, pageId, filePath, exists, res) {
        if (filePath) {
            filePath = filePath.replace(/,/g, '/');
        }
        const pageRoots = collectPageRoots();
        let pageDir = null;
        for (const root of pageRoots) {
            const candidate = (0, path_1.join)(root, groupId, pageId);
            if ((0, fs_1.existsSync)(candidate)) {
                pageDir = candidate;
                break;
            }
        }
        if (!pageDir || !(0, fs_1.existsSync)(pageDir)) {
            throw new common_1.NotFoundException('页面不存在');
        }
        const resolvedPageDir = (0, path_1.resolve)(pageDir);
        const fullPath = (0, path_1.resolve)(resolvedPageDir, filePath || 'index.vue');
        if (fullPath !== resolvedPageDir &&
            !fullPath.startsWith(`${resolvedPageDir}${path_1.sep}`)) {
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
        setPreviewCsp(res);
        res.sendFile(fullPath);
    }
    async serveComponentFile(groupId, componentId, filePath, exists, res) {
        if (filePath) {
            filePath = filePath.replace(/,/g, '/');
        }
        const basePaths = collectComponentRoots();
        let componentDir = null;
        const strictDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
        if (strictDir && (0, fs_1.existsSync)((0, path_1.join)(strictDir, filePath || ''))) {
            componentDir = strictDir;
        }
        if (!componentDir) {
            for (const basePath of basePaths) {
                try {
                    const dirs = await (0, promises_1.readdir)(basePath);
                    const matchedDir = dirs.find((dir) => dir === componentId) ||
                        dirs.find((dir) => dir.startsWith(`${componentId}-`));
                    if (matchedDir) {
                        componentDir = (0, path_1.join)(basePath, matchedDir);
                        break;
                    }
                }
                catch (error) {
                }
            }
        }
        if (!componentDir) {
            const vue3Roots = [
                backend_root_1.vue3ComponentsDir,
                (0, path_1.join)((0, backend_root_1.resolveFrontendWorkspacePath)(), 'vue3-components'),
            ];
            for (const root of [...new Set(vue3Roots)]) {
                const groupPath = (0, path_1.join)(root, groupId);
                try {
                    const compDirs = await (0, promises_1.readdir)(groupPath);
                    const matchedDir = compDirs.find((dir) => dir === componentId) ||
                        compDirs.find((dir) => dir.startsWith(`${componentId}-`));
                    if (matchedDir) {
                        componentDir = (0, path_1.join)(groupPath, matchedDir);
                        break;
                    }
                }
                catch {
                }
                if (!componentDir) {
                    try {
                        const groupDirs = await (0, promises_1.readdir)(root);
                        for (const g of groupDirs) {
                            if (g === groupId)
                                continue;
                            const candidate = (0, path_1.join)(root, g);
                            let st;
                            try {
                                st = await (0, promises_1.stat)(candidate);
                            }
                            catch {
                                continue;
                            }
                            if (!st.isDirectory())
                                continue;
                            const compDirs = await (0, promises_1.readdir)(candidate);
                            const matchedDir = compDirs.find((dir) => dir === componentId) ||
                                compDirs.find((dir) => dir.startsWith(`${componentId}-`));
                            if (matchedDir) {
                                componentDir = (0, path_1.join)(candidate, matchedDir);
                                break;
                            }
                        }
                        if (componentDir)
                            break;
                    }
                    catch {
                    }
                }
            }
        }
        if (!componentDir) {
            for (const root of [backend_root_1.tempComponentsDir]) {
                const groupPath = (0, path_1.join)(root, groupId);
                try {
                    const compDirs = await (0, promises_1.readdir)(groupPath);
                    const matchedDir = compDirs.find((dir) => dir === componentId) ||
                        compDirs.find((dir) => dir.startsWith(`${componentId}-`));
                    if (matchedDir) {
                        componentDir = (0, path_1.join)(groupPath, matchedDir);
                        break;
                    }
                }
                catch {
                }
                try {
                    const groupDirs = await (0, promises_1.readdir)(root);
                    for (const g of groupDirs) {
                        if (g === groupId)
                            continue;
                        const candidate = (0, path_1.join)(root, g);
                        let st;
                        try {
                            st = await (0, promises_1.stat)(candidate);
                        }
                        catch {
                            continue;
                        }
                        if (!st.isDirectory())
                            continue;
                        const compDirs = await (0, promises_1.readdir)(candidate);
                        const matchedDir = compDirs.find((dir) => dir === componentId) ||
                            compDirs.find((dir) => dir.startsWith(`${componentId}-`));
                        if (matchedDir) {
                            componentDir = (0, path_1.join)(candidate, matchedDir);
                            break;
                        }
                    }
                    if (componentDir)
                        break;
                }
                catch {
                }
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
        setPreviewCsp(res);
        res.sendFile(fullPath);
    }
};
exports.PreviewController = PreviewController;
__decorate([
    (0, common_1.Get)('page/:groupId/:pageId/*path'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('pageId')),
    __param(2, (0, common_1.Param)('path')),
    __param(3, (0, common_1.Query)('exists')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PreviewController.prototype, "servePageFile", null);
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
function setPreviewCsp(res) {
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
}
//# sourceMappingURL=preview.controller.js.map