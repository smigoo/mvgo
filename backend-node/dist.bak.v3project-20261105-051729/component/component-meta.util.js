"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveComponentMeta = saveComponentMeta;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
const workspace_config_1 = require("../config/workspace.config");
async function saveComponentMeta(groupId, componentId, componentType, requirementDoc, docAnalysis, quality, patchHitReport) {
    const isMicrocode = componentType === 'microcode';
    const targets = isMicrocode
        ? [
            (0, path_1.join)(backend_root_1.customComponentsDir, componentId),
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId),
        ]
        : [
            (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, componentId),
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, componentId),
        ];
    for (const targetPath of targets) {
        if (!(0, fs_1.existsSync)(targetPath)) {
            await (0, promises_1.mkdir)(targetPath, { recursive: true });
        }
        const metaPath = (0, path_1.join)(targetPath, 'component-meta.json');
        let prev = {};
        try {
            if ((0, fs_1.existsSync)(metaPath)) {
                prev = JSON.parse(await (0, promises_1.readFile)(metaPath, 'utf-8')) || {};
            }
        }
        catch {
            prev = {};
        }
        const metaContent = JSON.stringify({
            ...prev,
            requirementDoc: requirementDoc || '',
            docAnalysis: docAnalysis || null,
            generatedAt: new Date().toISOString(),
            quality: quality || null,
            ...(patchHitReport !== undefined ? { patchHitReport } : {}),
        }, null, 2);
        await (0, promises_1.writeFile)(metaPath, metaContent);
    }
}
//# sourceMappingURL=component-meta.util.js.map