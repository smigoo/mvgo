"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2PipelineModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const auth_module_1 = require("../../auth/auth.module");
const config_module_1 = require("../../config/config.module");
const progress_module_1 = require("../../progress/progress.module");
const tasks_module_1 = require("../../tasks/tasks.module");
const group_member_schema_1 = require("../../schemas/group-member.schema");
const v2_pipeline_controller_1 = require("./v2-pipeline.controller");
const v2_pipeline_service_1 = require("./v2-pipeline.service");
let V2PipelineModule = class V2PipelineModule {
};
exports.V2PipelineModule = V2PipelineModule;
exports.V2PipelineModule = V2PipelineModule = __decorate([
    (0, common_1.Module)({
        imports: [
            tasks_module_1.TasksModule,
            progress_module_1.ProgressModule,
            config_module_1.AiConfigModule,
            auth_module_1.AuthModule,
            mongoose_1.MongooseModule.forFeature([{ name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema }]),
        ],
        controllers: [v2_pipeline_controller_1.V2PipelineController],
        providers: [v2_pipeline_service_1.V2PipelineService],
        exports: [v2_pipeline_service_1.V2PipelineService],
    })
], V2PipelineModule);
//# sourceMappingURL=v2-pipeline.module.js.map