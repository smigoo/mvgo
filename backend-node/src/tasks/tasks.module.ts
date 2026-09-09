import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskCodeSnapshotService } from './task-code-snapshot.service';
import { SnapshotQualityService } from './snapshot-quality.service';
import { Component, ComponentSchema } from '../schemas/component.schema';

@Global() // 全局模块，其他模块可以直接注入TasksService
@Module({
  imports: [MongooseModule.forFeature([{ name: Component.name, schema: ComponentSchema }])],
  controllers: [TasksController],
  providers: [TasksService, TaskCodeSnapshotService, SnapshotQualityService],
  // 导出供生成管线发布候选快照；SnapshotQualityService 供其它模块复用同一套离线门禁
  exports: [TasksService, TaskCodeSnapshotService, SnapshotQualityService],
})
export class TasksModule {}
