"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const admin_controller_1 = require("./admin.controller");
const admin_stats_controller_1 = require("./admin-stats.controller");
const admin_service_1 = require("./admin.service");
const component_module_1 = require("../component/component.module");
const config_module_1 = require("../config/config.module");
const operation_log_module_1 = require("../operation-log/operation-log.module");
const task_stats_module_1 = require("../task-stats/task-stats.module");
const user_schema_1 = require("../schemas/user.schema");
const component_schema_1 = require("../schemas/component.schema");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        imports: [
            component_module_1.ComponentModule,
            config_module_1.AiConfigModule,
            operation_log_module_1.OperationLogModule,
            (0, common_1.forwardRef)(() => task_stats_module_1.TaskStatsModule),
            mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: 'Group', schema: require('../schemas/group.schema').GroupSchema },
                { name: 'GroupMember', schema: require('../schemas/group-member.schema').GroupMemberSchema },
                { name: 'JoinRequest', schema: require('../schemas/join-request.schema').JoinRequestSchema },
                { name: 'AiGitCredential', schema: require('../ai-workspace/schemas/ai-git-credential.schema').AiGitCredentialSchema },
                { name: 'AiDocument', schema: require('../ai-workspace/schemas/ai-document.schema').AiDocumentSchema },
                { name: 'AiSession', schema: require('../ai-workspace/schemas/ai-session.schema').AiSessionSchema },
                { name: 'AiProject', schema: require('../ai-workspace/schemas/ai-project.schema').AiProjectSchema },
                { name: 'AiSkill', schema: require('../ai-workspace/schemas/ai-skill.schema').AiSkillSchema },
                { name: 'Document', schema: require('../document/schemas/document.schema').DocumentSchema },
                { name: component_schema_1.Component.name, schema: component_schema_1.ComponentSchema },
            ]),
        ],
        controllers: [admin_controller_1.AdminController, admin_stats_controller_1.AdminStatsController],
        providers: [admin_service_1.AdminService],
        exports: [admin_service_1.AdminService],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map