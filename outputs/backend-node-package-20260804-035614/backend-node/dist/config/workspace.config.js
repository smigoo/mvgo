"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFrontendWorkspace = resolveFrontendWorkspace;
exports.isFrontendWorkspaceAvailable = isFrontendWorkspaceAvailable;
const path_1 = require("path");
const fs_1 = require("fs");
function resolveFrontendWorkspace() {
    const envPath = process.env.FRONTEND_WORKSPACE?.trim();
    if (envPath) {
        return envPath.startsWith('/')
            ? envPath
            : (0, path_1.join)(process.cwd(), envPath);
    }
    const devDefault = (0, path_1.join)(process.cwd(), '..', 'frontend', 'workspace');
    return devDefault;
}
function isFrontendWorkspaceAvailable() {
    try {
        return (0, fs_1.existsSync)(resolveFrontendWorkspace());
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=workspace.config.js.map