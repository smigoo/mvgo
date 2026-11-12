"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiUserGitModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const ai_git_credential_schema_1 = require("../schemas/ai-git-credential.schema");
const user_git_controller_1 = require("./user-git.controller");
const user_git_service_1 = require("./user-git.service");
let AiUserGitModule = class AiUserGitModule {
};
exports.AiUserGitModule = AiUserGitModule;
exports.AiUserGitModule = AiUserGitModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: ai_git_credential_schema_1.AiGitCredential.name, schema: ai_git_credential_schema_1.AiGitCredentialSchema }]),
        ],
        controllers: [user_git_controller_1.AiUserGitController],
        providers: [user_git_service_1.AiUserGitService],
        exports: [user_git_service_1.AiUserGitService],
    })
], AiUserGitModule);
//# sourceMappingURL=user-git.module.js.map