"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const component_controller_1 = require("./component.controller");
const component_service_1 = require("./component.service");
const component_analysis_service_1 = require("./component-analysis.service");
const component_schema_1 = require("../schemas/component.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const auth_module_1 = require("../auth/auth.module");
const phase2_module_1 = require("../phase2/phase2.module");
const tasks_module_1 = require("../tasks/tasks.module");
const config_module_1 = require("../config/config.module");
let ComponentModule = class ComponentModule {
};
exports.ComponentModule = ComponentModule;
exports.ComponentModule = ComponentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: component_schema_1.Component.name, schema: component_schema_1.ComponentSchema },
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
            ]),
            auth_module_1.AuthModule,
            tasks_module_1.TasksModule,
            config_module_1.AiConfigModule,
            (0, common_1.forwardRef)(() => phase2_module_1.Phase2Module),
        ],
        controllers: [component_controller_1.ComponentController],
        providers: [component_service_1.ComponentService, component_analysis_service_1.ComponentAnalysisService],
        exports: [component_service_1.ComponentService],
    })
], ComponentModule);
//# sourceMappingURL=component.module.js.map