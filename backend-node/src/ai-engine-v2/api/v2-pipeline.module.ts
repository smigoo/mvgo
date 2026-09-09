import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module';
import { AiConfigModule } from '../../config/config.module';
import { ProgressModule } from '../../progress/progress.module';
import { TasksModule } from '../../tasks/tasks.module';
import { GroupMember, GroupMemberSchema } from '../../schemas/group-member.schema';
import { V2PipelineController } from './v2-pipeline.controller';
import { V2PipelineService } from './v2-pipeline.service';

/**
 * ai-engine-v2 可配管线模块（dev 专用）
 *
 * 只依赖基础设施模块（任务、进度、配置、鉴权），
 * 不依赖 LiteModule / Phase2Module —— 与旧生成链路零耦合，
 * 摘掉本模块对既有功能没有任何影响。
 */
@Module({
  imports: [
    TasksModule,
    ProgressModule,
    AiConfigModule,
    AuthModule,
    MongooseModule.forFeature([{ name: GroupMember.name, schema: GroupMemberSchema }]),
  ],
  controllers: [V2PipelineController],
  providers: [V2PipelineService],
  exports: [V2PipelineService],
})
export class V2PipelineModule {}
