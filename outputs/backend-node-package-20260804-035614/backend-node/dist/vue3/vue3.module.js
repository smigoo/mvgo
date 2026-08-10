"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vue3Module = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const vue3_controller_1 = require("./vue3.controller");
const vue3_service_1 = require("./vue3.service");
const slot_analyzer_service_1 = require("./slot-analyzer.service");
const doc_analyzer_service_1 = require("./doc-analyzer.service");
const api_binding_service_1 = require("./api-binding.service");
const api_binding_preflight_service_1 = require("./api-binding-preflight.service");
const workspace_transaction_service_1 = require("./workspace-transaction.service");
const incremental_file_cleanup_service_1 = require("./incremental-file-cleanup.service");
const tasks_module_1 = require("../tasks/tasks.module");
const progress_module_1 = require("../progress/progress.module");
const component_module_1 = require("../component/component.module");
const apifox_module_1 = require("../apifox/apifox.module");
const group_member_schema_1 = require("../schemas/group-member.schema");
const config_module_1 = require("../config/config.module");
let Vue3Module = class Vue3Module {
};
exports.Vue3Module = Vue3Module;
exports.Vue3Module = Vue3Module = __decorate([
    (0, common_1.Module)({
        imports: [
            tasks_module_1.TasksModule,
            progress_module_1.ProgressModule,
            (0, common_1.forwardRef)(() => component_module_1.ComponentModule),
            apifox_module_1.ApifoxModule,
            config_module_1.AiConfigModule,
            mongoose_1.MongooseModule.forFeature([
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
            ]),
        ],
        controllers: [vue3_controller_1.Vue3Controller],
        providers: [
            vue3_service_1.Vue3Service,
            slot_analyzer_service_1.SlotAnalyzerService,
            doc_analyzer_service_1.DocAnalyzerService,
            api_binding_service_1.ApiBindingService,
            api_binding_preflight_service_1.ApiBindingPreflightService,
            incremental_file_cleanup_service_1.IncrementalFileCleanupService,
            workspace_transaction_service_1.WorkspaceTransactionService,
        ],
        exports: [vue3_service_1.Vue3Service, slot_analyzer_service_1.SlotAnalyzerService, doc_analyzer_service_1.DocAnalyzerService, api_binding_service_1.ApiBindingService],
    })
], Vue3Module);
//# sourceMappingURL=vue3.module.js.map