"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFrontendWorkspace = resolveFrontendWorkspace;
exports.isFrontendWorkspaceAvailable = isFrontendWorkspaceAvailable;
const fs_1 = require("fs");
const backend_root_1 = require("./backend-root");
function resolveFrontendWorkspace() {
    return (0, backend_root_1.resolveFrontendWorkspacePath)();
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