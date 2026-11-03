"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStatsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const token_usage_schema_1 = require("../schemas/token-usage.schema");
const user_schema_1 = require("../schemas/user.schema");
const admin_module_1 = require("../admin/admin.module");
const task_stats_controller_1 = require("./task-stats.controller");
const task_stats_service_1 = require("./task-stats.service");
const self_healing_service_1 = require("./self-healing.service");
let TaskStatsModule = class TaskStatsModule {
};
exports.TaskStatsModule = TaskStatsModule;
exports.TaskStatsModule = TaskStatsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => admin_module_1.AdminModule),
            mongoose_1.MongooseModule.forFeature([
                { name: token_usage_schema_1.TokenUsage.name, schema: token_usage_schema_1.TokenUsageSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
            ]),
        ],
        controllers: [task_stats_controller_1.TaskStatsController],
        providers: [task_stats_service_1.TaskStatsService, self_healing_service_1.SelfHealingService],
        exports: [task_stats_service_1.TaskStatsService, self_healing_service_1.SelfHealingService],
    })
], TaskStatsModule);
//# sourceMappingURL=task-stats.module.js.map