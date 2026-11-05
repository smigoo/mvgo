"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProjectsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const ai_project_schema_1 = require("../schemas/ai-project.schema");
const projects_service_1 = require("./projects.service");
const auth_module_1 = require("../../auth/auth.module");
let AiProjectsModule = class AiProjectsModule {
};
exports.AiProjectsModule = AiProjectsModule;
exports.AiProjectsModule = AiProjectsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: ai_project_schema_1.AiProject.name, schema: ai_project_schema_1.AiProjectSchema }]),
            auth_module_1.AuthModule,
        ],
        controllers: [],
        providers: [projects_service_1.AiProjectsService],
        exports: [projects_service_1.AiProjectsService],
    })
], AiProjectsModule);
//# sourceMappingURL=projects.module.js.map