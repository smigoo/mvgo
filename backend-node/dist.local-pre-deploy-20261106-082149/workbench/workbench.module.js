"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbenchModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const workbench_controller_1 = require("./workbench.controller");
const workbench_service_1 = require("./workbench.service");
const conversation_schema_1 = require("./conversation.schema");
const group_schema_1 = require("./group.schema");
const tasks_module_1 = require("../tasks/tasks.module");
const component_module_1 = require("../component/component.module");
const task_stats_module_1 = require("../task-stats/task-stats.module");
const demo_module_1 = require("../demo/demo.module");
const vue3_module_1 = require("../vue3/vue3.module");
const apifox_module_1 = require("../apifox/apifox.module");
const workflow_module_1 = require("../workflow/workflow.module");
const config_module_1 = require("../config/config.module");
const phase2_module_1 = require("../phase2/phase2.module");
const lite_module_1 = require("../lite/lite.module");
const queue_module_1 = require("../queue/queue.module");
const progress_module_1 = require("../progress/progress.module");
let WorkbenchModule = class WorkbenchModule {
};
exports.WorkbenchModule = WorkbenchModule;
exports.WorkbenchModule = WorkbenchModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: conversation_schema_1.Conversation.name, schema: conversation_schema_1.ConversationSchema },
                { name: group_schema_1.WorkbenchGroup.name, schema: group_schema_1.WorkbenchGroupSchema },
            ]),
            tasks_module_1.TasksModule,
            component_module_1.ComponentModule,
            task_stats_module_1.TaskStatsModule,
            demo_module_1.DemoModule,
            vue3_module_1.Vue3Module,
            apifox_module_1.ApifoxModule,
            workflow_module_1.WorkflowModule,
            config_module_1.AiConfigModule,
            phase2_module_1.Phase2Module,
            lite_module_1.LiteModule,
            queue_module_1.QueueModule,
            progress_module_1.ProgressModule,
        ],
        controllers: [workbench_controller_1.WorkbenchController],
        providers: [workbench_service_1.WorkbenchService],
        exports: [workbench_service_1.WorkbenchService],
    })
], WorkbenchModule);
//# sourceMappingURL=workbench.module.js.map