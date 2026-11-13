"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const path = __importStar(require("node:path"));
const database_module_1 = require("./database/database.module");
const auth_module_1 = require("./auth/auth.module");
const group_module_1 = require("./group/group.module");
const component_module_1 = require("./component/component.module");
const workflow_module_1 = require("./workflow/workflow.module");
const models_module_1 = require("./models/models.module");
const tasks_module_1 = require("./tasks/tasks.module");
const phase2_module_1 = require("./phase2/phase2.module");
const vue3_module_1 = require("./vue3/vue3.module");
const progress_module_1 = require("./progress/progress.module");
const preview_module_1 = require("./preview/preview.module");
const document_module_1 = require("./document/document.module");
const page_generator_module_1 = require("./page-generator/page-generator.module");
const microcode_doc_module_1 = require("./microcode-doc/microcode-doc.module");
const ai_workspace_module_1 = require("./ai-workspace/ai-workspace.module");
const token_usage_module_1 = require("./token-usage/token-usage.module");
const apifox_module_1 = require("./apifox/apifox.module");
const screen_layout_module_1 = require("./screen-layout/screen-layout.module");
const page_skeleton_module_1 = require("./page-skeleton/page-skeleton.module");
const demo_module_1 = require("./demo/demo.module");
const config_module_1 = require("./config/config.module");
const admin_module_1 = require("./admin/admin.module");
const task_stats_module_1 = require("./task-stats/task-stats.module");
const operation_log_module_1 = require("./operation-log/operation-log.module");
const operation_log_interceptor_1 = require("./operation-log/operation-log.interceptor");
const quota_module_1 = require("./quota/quota.module");
const lite_module_1 = require("./lite/lite.module");
const v2_pipeline_module_1 = require("./ai-engine-v2/api/v2-pipeline.module");
const recipes_module_1 = require("./recipes/recipes.module");
const mc_spec_module_1 = require("./mc-spec/mc-spec.module");
const announcement_module_1 = require("./announcement/announcement.module");
const workbench_module_1 = require("./workbench/workbench.module");
const dev_only_guard_1 = require("./ai-engine-v2/api/dev-only.guard");
const lite_lab_module_1 = require("./lite-lab/api/lite-lab.module");
const lite_lab_dev_only_guard_1 = require("./lite-lab/api/lite-lab-dev-only.guard");
const project_pipeline_module_1 = require("./ai-engine-v3/project/api/project-pipeline.module");
const project_dev_only_guard_1 = require("./ai-engine-v3/project/api/project-dev-only.guard");
const meeting_asr_module_1 = require("./meeting-asr/meeting-asr.module");
const meeting_module_1 = require("./meeting/meeting.module");
const meeting_dev_only_guard_1 = require("./meeting/meeting-dev-only.guard");
const feedback_module_1 = require("./feedback/feedback.module");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: [
                    path.resolve(__dirname, '../../.env'),
                    path.resolve(__dirname, `../../.env.${process.env.NODE_ENV || 'development'}`),
                ],
            }),
            database_module_1.DatabaseModule,
            tasks_module_1.TasksModule,
            progress_module_1.ProgressModule,
            auth_module_1.AuthModule,
            group_module_1.GroupModule,
            component_module_1.ComponentModule,
            workflow_module_1.WorkflowModule,
            models_module_1.ModelsModule,
            phase2_module_1.Phase2Module,
            vue3_module_1.Vue3Module,
            preview_module_1.PreviewModule,
            document_module_1.DocumentModule,
            page_generator_module_1.PageGeneratorModule,
            microcode_doc_module_1.MicrocodeDocModule,
            ai_workspace_module_1.AiWorkspaceModule,
            token_usage_module_1.TokenUsageModule,
            apifox_module_1.ApifoxModule,
            screen_layout_module_1.ScreenLayoutModule,
            page_skeleton_module_1.PageSkeletonModule,
            demo_module_1.DemoModule,
            config_module_1.AiConfigModule,
            admin_module_1.AdminModule,
            task_stats_module_1.TaskStatsModule,
            operation_log_module_1.OperationLogModule,
            quota_module_1.QuotaModule,
            lite_module_1.LiteModule,
            recipes_module_1.RecipesModule,
            mc_spec_module_1.McSpecModule,
            announcement_module_1.AnnouncementModule,
            workbench_module_1.WorkbenchModule,
            meeting_asr_module_1.MeetingAsrModule,
            feedback_module_1.FeedbackModule,
            ...((0, dev_only_guard_1.isV2Exposed)() ? [v2_pipeline_module_1.V2PipelineModule] : []),
            ...((0, project_dev_only_guard_1.isV3ProjectExposed)() ? [project_pipeline_module_1.ProjectPipelineModule] : []),
            ...((0, lite_lab_dev_only_guard_1.isLiteLabExposed)() ? [lite_lab_module_1.LiteLabModule] : []),
            ...((0, meeting_dev_only_guard_1.isMeetingExposed)() ? [meeting_module_1.MeetingModule] : []),
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            { provide: core_1.APP_INTERCEPTOR, useClass: operation_log_interceptor_1.OperationLogInterceptor },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map