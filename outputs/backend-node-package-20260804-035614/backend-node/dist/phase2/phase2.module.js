"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2Module = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const phase2_controller_1 = require("./phase2.controller");
const phase2_service_1 = require("./phase2.service");
const doc_analyzer_service_js_1 = require("./doc/doc-analyzer.service.js");
const ui_cache_service_js_1 = require("./ui-cache.service.js");
const tasks_module_1 = require("../tasks/tasks.module");
const progress_module_1 = require("../progress/progress.module");
const component_module_1 = require("../component/component.module");
const group_member_schema_1 = require("../schemas/group-member.schema");
const config_module_1 = require("../config/config.module");
let Phase2Module = class Phase2Module {
};
exports.Phase2Module = Phase2Module;
exports.Phase2Module = Phase2Module = __decorate([
    (0, common_1.Module)({
        imports: [
            tasks_module_1.TasksModule,
            progress_module_1.ProgressModule,
            (0, common_1.forwardRef)(() => component_module_1.ComponentModule),
            config_module_1.AiConfigModule,
            mongoose_1.MongooseModule.forFeature([
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
            ]),
        ],
        controllers: [phase2_controller_1.Phase2Controller],
        providers: [phase2_service_1.Phase2Service, doc_analyzer_service_js_1.DocAnalyzerService, ui_cache_service_js_1.UiCacheService],
        exports: [phase2_service_1.Phase2Service, doc_analyzer_service_js_1.DocAnalyzerService, ui_cache_service_js_1.UiCacheService],
    })
], Phase2Module);
//# sourceMappingURL=phase2.module.js.map