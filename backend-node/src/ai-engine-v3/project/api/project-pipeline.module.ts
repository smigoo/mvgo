import { Module } from '@nestjs/common';
import { AuthModule } from '../../../auth/auth.module';
import { AiConfigModule } from '../../../config/config.module';
import { ProjectPipelineController } from './project-pipeline.controller';
import { ProjectPipelineService } from '../project-pipeline.service';

/**
 * 项目级管线模块（ai-engine-v3/project · M1 · dev 专用）
 *
 * 只依赖 AuthModule（OptionalSessionGuard 需要 AuthService 解析身份）。
 * 刻意**不**依赖 TasksModule / ProgressModule —— M1 是同步接口，
 * 不建任务、不推 SSE，与组件级链路零耦合，摘掉本模块无任何影响。
 */
@Module({
  imports: [AuthModule, AiConfigModule],
  controllers: [ProjectPipelineController],
  providers: [ProjectPipelineService],
  exports: [ProjectPipelineService],
})
export class ProjectPipelineModule {}
