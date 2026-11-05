import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AiConfigModule } from '../../config/config.module';
import { ProgressModule } from '../../progress/progress.module';
import { TasksModule } from '../../tasks/tasks.module';
import { LiteModule } from '../../lite/lite.module';
import { LiteLabController } from './lite-lab.controller';
import { LiteLabService } from './lite-lab.service';

/**
 * lite-lab 真值回填实验管线模块（dev 专用）
 *
 * 两阶段实验：
 *   Stage A  完整复用 LiteService 跑一条真实 lite 任务（vision 分析 + LLM 单程直出布局）
 *   Stage B  FigmaConnector 拉同一 node 的真值（颜色/字号/几何/图片）
 *   Stage C  truth-matcher 文本锚点确定性匹配，回填颜色/字号/（可选）尺寸
 *   Stage D  报告落盘 + truthBackfill 计数行（0 也打）
 *
 * 唯一外部依赖是 LiteModule（官方导出 LiteService）；不触 Phase2 / max 管线，
 * 摘掉本模块对既有功能零影响。
 */
@Module({
  imports: [TasksModule, ProgressModule, AuthModule, AiConfigModule, LiteModule],
  controllers: [LiteLabController],
  providers: [LiteLabService],
  exports: [LiteLabService],
})
export class LiteLabModule {}
