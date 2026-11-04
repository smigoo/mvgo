"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiWorkspaceModule = void 0;
const common_1 = require("@nestjs/common");
const skills_module_1 = require("./skills/skills.module");
const projects_module_1 = require("./projects/projects.module");
const sessions_module_1 = require("./sessions/sessions.module");
const documents_module_1 = require("./documents/documents.module");
const chat_module_1 = require("./chat/chat.module");
const user_git_module_1 = require("./user-git/user-git.module");
let AiWorkspaceModule = class AiWorkspaceModule {
};
exports.AiWorkspaceModule = AiWorkspaceModule;
exports.AiWorkspaceModule = AiWorkspaceModule = __decorate([
    (0, common_1.Module)({
        imports: [
            skills_module_1.AiSkillsModule,
            projects_module_1.AiProjectsModule,
            sessions_module_1.AiSessionsModule,
            documents_module_1.AiDocumentsModule,
            chat_module_1.AiChatModule,
            user_git_module_1.AiUserGitModule,
        ],
    })
], AiWorkspaceModule);
//# sourceMappingURL=ai-workspace.module.js.map