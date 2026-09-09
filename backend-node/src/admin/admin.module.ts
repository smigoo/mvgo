import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminService } from './admin.service';
import { ComponentModule } from '../component/component.module';
import { AiConfigModule } from '../config/config.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { User, UserSchema } from '../schemas/user.schema';
import { Component, ComponentSchema } from '../schemas/component.schema';

/**
 * 管理后台模块（只读 + 用户删除）。
 *
 * - AdminController：用户/配置/组件管理列表（SessionGuard + admin），
 *   2026-09 曾随「Java 迁移」移除注册；本地开发 /api 直连 Node 时仍需要，
 *   故重新注册（生产 nginx 将 /api 转发 Java，不会触达 Node 的 admin 路由）。
 * - AdminStatsController：内部 user-stats（key 鉴权），供 Java 跨服务聚合生成统计。
 */
@Module({
  imports: [
    ComponentModule,
    AiConfigModule,
    OperationLogModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: 'Group', schema: require('../schemas/group.schema').GroupSchema },
      { name: 'GroupMember', schema: require('../schemas/group-member.schema').GroupMemberSchema },
      { name: 'JoinRequest', schema: require('../schemas/join-request.schema').JoinRequestSchema },
      { name: 'AiGitCredential', schema: require('../ai-workspace/schemas/ai-git-credential.schema').AiGitCredentialSchema },
      { name: 'AiDocument', schema: require('../ai-workspace/schemas/ai-document.schema').AiDocumentSchema },
      { name: 'AiSession', schema: require('../ai-workspace/schemas/ai-session.schema').AiSessionSchema },
      { name: 'AiProject', schema: require('../ai-workspace/schemas/ai-project.schema').AiProjectSchema },
      { name: 'AiSkill', schema: require('../ai-workspace/schemas/ai-skill.schema').AiSkillSchema },
      { name: 'Document', schema: require('../document/schemas/document.schema').DocumentSchema },
      { name: Component.name, schema: ComponentSchema },
    ]),
  ],
  controllers: [AdminController, AdminStatsController],
  providers: [AdminService],
})
export class AdminModule {}
