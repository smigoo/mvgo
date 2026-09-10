import { Module } from '@nestjs/common';
import { McSpecService } from './mc-spec.service';
import { McSpecController } from './mc-spec.controller';
import { AdminModule } from '../admin/admin.module';

/**
 * 微码组件规范检查（调用外部 skill 的 scripts/mc-check.cjs）
 *
 * - 内置 skill：backend-node/skills/frontend-mc-check（随代码发布）
 * - 自定义 skill：backend-node/data/skills/<id>（管理员上传 zip，P2）
 * - AdminModule：复用 assertAdmin 做「仅管理员可上传/卸载」的把关
 */
@Module({
  imports: [AdminModule],
  controllers: [McSpecController],
  providers: [McSpecService],
  exports: [McSpecService],
})
export class McSpecModule {}
