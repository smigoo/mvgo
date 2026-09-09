import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LiteController } from './lite.controller';
import { LiteService } from './lite.service';
import { HtmlSplitService } from './html-split.service';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { TasksModule } from '../tasks/tasks.module';
import { ProgressModule } from '../progress/progress.module';
import { AiConfigModule } from '../config/config.module';
import { QuotaModule } from '../quota/quota.module';
import { QueueModule } from '../queue/queue.module';
import { TokenUsageModule } from '../token-usage/token-usage.module';
import { ComponentModule } from '../component/component.module';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { Phase2Module } from '../phase2/phase2.module';

/**
 * 轻量组件生成模块（Phase 0/1 + Phase 7 限流配额 + Phase 7 批量生成 + HTML 大屏拆分）
 * 复用 Tasks / Progress / AiConfig / Quota / Queue / TokenUsage / Component 能力，
 * 不引入 Figma 图谱依赖。
 */
@Module({
  imports: [
    TasksModule,
    ProgressModule,
    AiConfigModule,
    QuotaModule,
    QueueModule,
    TokenUsageModule,
    ComponentModule,
    Phase2Module,
    MongooseModule.forFeature([
      { name: GroupMember.name, schema: GroupMemberSchema },
    ]),
  ],
  controllers: [LiteController, BatchController],
  providers: [LiteService, HtmlSplitService, BatchService],
  exports: [BatchService, HtmlSplitService],
})
export class LiteModule {}
