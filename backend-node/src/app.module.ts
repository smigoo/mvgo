import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import * as path from 'node:path';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { GroupModule } from './group/group.module';
import { ComponentModule } from './component/component.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ModelsModule } from './models/models.module';
import { TasksModule } from './tasks/tasks.module';
import { Phase2Module } from './phase2/phase2.module';
import { Vue3Module } from './vue3/vue3.module';
import { ProgressModule } from './progress/progress.module';
import { PreviewModule } from './preview/preview.module';
import { DocumentModule } from './document/document.module';
import { PageGeneratorModule } from './page-generator/page-generator.module';
import { MicrocodeDocModule } from './microcode-doc/microcode-doc.module';
import { AiWorkspaceModule } from './ai-workspace/ai-workspace.module';
import { TokenUsageModule } from './token-usage/token-usage.module';
import { ApifoxModule } from './apifox/apifox.module';
import { ScreenLayoutModule } from './screen-layout/screen-layout.module';
import { PageSkeletonModule } from './page-skeleton/page-skeleton.module';
import { DemoModule } from './demo/demo.module';
import { AiConfigModule } from './config/config.module';
import { AdminModule } from './admin/admin.module';
import { OperationLogModule } from './operation-log/operation-log.module';
import { OperationLogInterceptor } from './operation-log/operation-log.interceptor';
import { QuotaModule } from './quota/quota.module';
import { QueueModule } from './queue/queue.module';
import { LiteModule } from './lite/lite.module';
import { V2PipelineModule } from './ai-engine-v2/api/v2-pipeline.module';
import { RecipesModule } from './recipes/recipes.module';
import { McSpecModule } from './mc-spec/mc-spec.module';
import { isV2Exposed } from './ai-engine-v2/api/dev-only.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // 环境变量配置
    // 加载顺序: .env (基础) → .env.{NODE_ENV} (环境覆盖)
    // 本地开发: .start-server.sh 设 NODE_ENV=development → 加载 .env.development (本地 Mongo)
    // 云端生产: deploy-cloud.sh 设 NODE_ENV=production → 加载 .env.production (阿里云 Mongo)
    // envFilePath 使用基于当前模块位置的绝对路径,无论在哪里启动都能命中项目根目录。
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, `../../.env.${process.env.NODE_ENV || 'development'}`),
      ],
    }),
    // 数据库连接
    DatabaseModule,
    // 业务模块
    TasksModule, // 全局任务管理（必须在其他业务模块之前）
    ProgressModule, // 全局SSE进度管理
    AuthModule,
    GroupModule,
    ComponentModule,
    WorkflowModule,
    ModelsModule,
    Phase2Module,
    Vue3Module,
    PreviewModule,
    DocumentModule,
    PageGeneratorModule,
    MicrocodeDocModule,
    AiWorkspaceModule, // 工作台模块
    TokenUsageModule, // Token 用量追踪与成本控制
    ApifoxModule, // Apifox 接口代码生成（record/download/mine）
    ScreenLayoutModule, // 大屏布局编辑器 — ZIP 下载
    PageSkeletonModule, // 大屏页面骨架生成器（独立模块，不依赖组件生成/任务管理内部逻辑）
    DemoModule, // Playground AI 对话式组件修改器
    AiConfigModule, // 服务端 AI 配置（接口保存，替代前端 localStorage）
    AdminModule, // 管理后台只读接口（admin 跨用户查看配置与组件）
    OperationLogModule, // 操作日志（全局拦截器写入 + admin 只读查询）
    QuotaModule, // 组件生成配额限制（全局模块）
    LiteModule, // 轻量组件生成（截图/Figma → Vue3/微码 Lite/Max）
    RecipesModule, // 场景配方库（内置 + 另存为模板）
    McSpecModule, // 微码组件规范检查（调用 skills/frontend-mc-check 的 mc-check.cjs）
    // v2 可配管线（规范 × 档位 × 模型），dev 专用：
    // 生产环境整个模块不注册，连路由都不存在；控制器上的 DevOnlyGuard 是第二道保险。
    ...(isV2Exposed() ? [V2PipelineModule] : []),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局操作日志拦截器：每次 HTTP 请求完成后写入 OperationLog（fire-and-forget）
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
  ],
})
export class AppModule {}
