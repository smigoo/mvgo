"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const os_1 = require("os");
const path_1 = require("path");
const fs_1 = require("fs");
const workspace_config_1 = require("./config/workspace.config");
let AppService = class AppService {
    getHello() {
        return 'Hello World!';
    }
    getWorkspaceInfo() {
        const cwd = process.cwd();
        const frontendWs = (0, workspace_config_1.resolveFrontendWorkspace)();
        const defaultRoot = (0, path_1.join)(frontendWs, 'custom-components');
        return {
            defaultRoot: (0, fs_1.existsSync)(defaultRoot) ? defaultRoot : (0, path_1.join)((0, os_1.homedir)(), 'workspace'),
            projectRoot: cwd,
            homeDir: (0, os_1.homedir)(),
            frontendWorkspace: frontendWs,
        };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)()
], AppService);
//# sourceMappingURL=app.service.js.map