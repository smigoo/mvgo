"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UiCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UiCacheService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
let UiCacheService = UiCacheService_1 = class UiCacheService {
    logger = new common_1.Logger(UiCacheService_1.name);
    loadFigmaRoot(data) {
        if (!data)
            return null;
        return data.document || data;
    }
    check(componentDir, expected) {
        const figmaCachePath = (0, path_1.join)(componentDir, '.mc-gen', 'cache', 'figma-node-data.json');
        const previewPath = (0, path_1.join)(componentDir, '.mc-gen', 'config', 'preview-analysis.json');
        if (!(0, fs_1.existsSync)(figmaCachePath)) {
            return { hit: false, source: 'none', staleReason: 'figma 缓存不存在' };
        }
        try {
            const figmaRaw = JSON.parse((0, fs_1.readFileSync)(figmaCachePath, 'utf-8'));
            const figmaNodeData = this.loadFigmaRoot(figmaRaw);
            if (expected?.fileKey && figmaRaw.fileKey && figmaRaw.fileKey !== expected.fileKey) {
                return { hit: false, source: 'none', staleReason: `fileKey 不匹配（缓存 ${figmaRaw.fileKey} ≠ 期望 ${expected.fileKey}）` };
            }
            if (expected?.nodeId && figmaRaw.nodeId && figmaRaw.nodeId !== expected.nodeId) {
                return { hit: false, source: 'none', staleReason: `nodeId 不匹配（缓存 ${figmaRaw.nodeId} ≠ 期望 ${expected.nodeId}）` };
            }
            const previewAnalysis = (0, fs_1.existsSync)(previewPath)
                ? JSON.parse((0, fs_1.readFileSync)(previewPath, 'utf-8'))
                : null;
            const domMappingPath = (0, path_1.join)(componentDir, '.mc-gen', 'resource-dom-mapping.json');
            const resourceDomMapping = (0, fs_1.existsSync)(domMappingPath)
                ? JSON.parse((0, fs_1.readFileSync)(domMappingPath, 'utf-8'))
                : null;
            this.logger.log(`🗃️ UI 缓存命中: ${componentDir.split('/').pop()}（figma ✓${previewAnalysis ? ' preview ✓' : ' preview ✗'}${resourceDomMapping ? ' mapping ✓' : ''}）`);
            return {
                hit: true,
                figmaNodeData,
                previewAnalysis,
                resourceDomMapping,
                source: 'cache',
            };
        }
        catch (e) {
            this.logger.warn(`🗃️ UI 缓存读取失败: ${e.message}`);
            return { hit: false, source: 'none', staleReason: `缓存损坏: ${e.message}` };
        }
    }
    save(componentDir, input) {
        try {
            const cacheDir = (0, path_1.join)(componentDir, '.mc-gen', 'cache');
            const configDir = (0, path_1.join)(componentDir, '.mc-gen', 'config');
            (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
            (0, fs_1.mkdirSync)(configDir, { recursive: true });
            (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, 'figma-node-data.json'), JSON.stringify({
                fileKey: input.fileKey || null,
                nodeId: input.nodeId || null,
                cachedAt: new Date().toISOString(),
                document: input.figmaNodeData,
            }, null, 2), 'utf-8');
            if (input.previewAnalysis) {
                (0, fs_1.writeFileSync)((0, path_1.join)(configDir, 'preview-analysis.json'), JSON.stringify(input.previewAnalysis, null, 2), 'utf-8');
            }
            if (input.resourceDomMapping) {
                (0, fs_1.writeFileSync)((0, path_1.join)(componentDir, '.mc-gen', 'resource-dom-mapping.json'), JSON.stringify(input.resourceDomMapping, null, 2), 'utf-8');
            }
            this.logger.log(`🗃️ UI 缓存已写入: ${componentDir.split('/').pop()}`);
        }
        catch (e) {
            this.logger.warn(`🗃️ UI 缓存写入失败（非阻塞）: ${e.message}`);
        }
    }
};
exports.UiCacheService = UiCacheService;
exports.UiCacheService = UiCacheService = UiCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], UiCacheService);
//# sourceMappingURL=ui-cache.service.js.map