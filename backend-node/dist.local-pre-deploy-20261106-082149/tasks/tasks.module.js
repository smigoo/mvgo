"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const tasks_controller_1 = require("./tasks.controller");
const tasks_service_1 = require("./tasks.service");
const task_code_snapshot_service_1 = require("./task-code-snapshot.service");
const snapshot_quality_service_1 = require("./snapshot-quality.service");
const pipeline_metrics_service_1 = require("./pipeline-metrics.service");
const component_schema_1 = require("../schemas/component.schema");
const generation_metric_schema_1 = require("../schemas/generation-metric.schema");
const user_schema_1 = require("../schemas/user.schema");
let TasksModule = class TasksModule {
};
exports.TasksModule = TasksModule;
exports.TasksModule = TasksModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: component_schema_1.Component.name, schema: component_schema_1.ComponentSchema },
                { name: generation_metric_schema_1.GenerationMetric.name, schema: generation_metric_schema_1.GenerationMetricSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
            ]),
        ],
        controllers: [tasks_controller_1.TasksController],
        providers: [
            tasks_service_1.TasksService,
            task_code_snapshot_service_1.TaskCodeSnapshotService,
            snapshot_quality_service_1.SnapshotQualityService,
            pipeline_metrics_service_1.PipelineMetricsService,
        ],
        exports: [
            tasks_service_1.TasksService,
            task_code_snapshot_service_1.TaskCodeSnapshotService,
            snapshot_quality_service_1.SnapshotQualityService,
            pipeline_metrics_service_1.PipelineMetricsService,
        ],
    })
], TasksModule);
//# sourceMappingURL=tasks.module.js.map