"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const lite_controller_1 = require("./lite.controller");
const lite_service_1 = require("./lite.service");
const html_split_service_1 = require("./html-split.service");
const batch_controller_1 = require("./batch.controller");
const batch_service_1 = require("./batch.service");
const tasks_module_1 = require("../tasks/tasks.module");
const progress_module_1 = require("../progress/progress.module");
const config_module_1 = require("../config/config.module");
const quota_module_1 = require("../quota/quota.module");
const queue_module_1 = require("../queue/queue.module");
const token_usage_module_1 = require("../token-usage/token-usage.module");
const component_module_1 = require("../component/component.module");
const group_member_schema_1 = require("../schemas/group-member.schema");
const phase2_module_1 = require("../phase2/phase2.module");
let LiteModule = class LiteModule {
};
exports.LiteModule = LiteModule;
exports.LiteModule = LiteModule = __decorate([
    (0, common_1.Module)({
        imports: [
            tasks_module_1.TasksModule,
            progress_module_1.ProgressModule,
            config_module_1.AiConfigModule,
            quota_module_1.QuotaModule,
            queue_module_1.QueueModule,
            token_usage_module_1.TokenUsageModule,
            component_module_1.ComponentModule,
            phase2_module_1.Phase2Module,
            mongoose_1.MongooseModule.forFeature([
                { name: group_member_schema_1.GroupMember.name, schema: group_member_schema_1.GroupMemberSchema },
            ]),
        ],
        controllers: [lite_controller_1.LiteController, batch_controller_1.BatchController],
        providers: [lite_service_1.LiteService, html_split_service_1.HtmlSplitService, batch_service_1.BatchService],
        exports: [batch_service_1.BatchService, html_split_service_1.HtmlSplitService, lite_service_1.LiteService],
    })
], LiteModule);
//# sourceMappingURL=lite.module.js.map