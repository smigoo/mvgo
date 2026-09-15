import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskCodeSnapshotService } from './task-code-snapshot.service';
import { SnapshotQualityService } from './snapshot-quality.service';
import { PipelineMetricsService } from './pipeline-metrics.service';
import { Component, ComponentSchema } from '../schemas/component.schema';
import { GenerationMetric, GenerationMetricSchema } from '../schemas/generation-metric.schema';
import { User, UserSchema } from '../schemas/user.schema';

@Global() // 全局模块，其他模块可以直接注入TasksService
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Component.name, schema: ComponentSchema },
      // P0-2：生成管线指标宽表（终态一条）+ users（用于部门快照）
      { name: GenerationMetric.name, schema: GenerationMetricSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskCodeSnapshotService,
    SnapshotQualityService,
    PipelineMetricsService,
  ],
  // 导出供生成管线发布候选快照；SnapshotQualityService 供其它模块复用同一套离线门禁；
  // PipelineMetricsService 供管理端监控接口读取/聚合（P0-4）
  exports: [
    TasksService,
    TaskCodeSnapshotService,
    SnapshotQualityService,
    PipelineMetricsService,
  ],
})
export class TasksModule {}
