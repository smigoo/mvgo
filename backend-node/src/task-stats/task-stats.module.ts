import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenUsage,
  TokenUsageSchema,
} from '../schemas/token-usage.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { AdminModule } from '../admin/admin.module';
import { TaskStatsController } from './task-stats.controller';
import { TaskStatsService } from './task-stats.service';
import { SelfHealingService } from './self-healing.service';

/**
 * 任务统计模块（管理员视角）：任务日志 + 模型效果对比。
 * - AdminModule 提供 AdminService.assertAdmin（统一管理员判定）
 * - TasksModule 为 @Global，TasksService / TaskCodeSnapshotService 可直接注入
 * - TokenUsage 在此注册 MongooseModel 供聚合查询
 * - User 用于 userId -> username 映射（任务日志展示用户名）
 * - SelfHealingService 提供任务失败原因分析（自愈提示）
 */
@Module({
  imports: [
    forwardRef(() => AdminModule),
    MongooseModule.forFeature([
      { name: TokenUsage.name, schema: TokenUsageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TaskStatsController],
  providers: [TaskStatsService, SelfHealingService],
  exports: [TaskStatsService, SelfHealingService],
})
export class TaskStatsModule {}
