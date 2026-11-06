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
import { TaskStatsModule } from './task-stats/task-stats.module';
import { OperationLogModule } from './operation-log/operation-log.module';
import { OperationLogInterceptor } from './operation-log/operation-log.interceptor';
import { QuotaModule } from './quota/quota.module';
import { QueueModule } from './queue/queue.module';
import { LiteModule } from './lite/lite.module';
import { V2PipelineModule } from './ai-engine-v2/api/v2-pipeline.module';
import { RecipesModule } from './recipes/recipes.module';
import { McSpecModule } from './mc-spec/mc-spec.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { WorkbenchModule } from './workbench/workbench.module';
import { isV2Exposed } from './ai-engine-v2/api/dev-only.guard';
import { LiteLabModule } from './lite-lab/api/lite-lab.module';
import { isLiteLabExposed } from './lite-lab/api/lite-lab-dev-only.guard';
import { ProjectPipelineModule } from './ai-engine-v3/project/api/project-pipeline.module';
import { isV3ProjectExposed } from './ai-engine-v3/project/api/project-dev-only.guard';
import { MeetingAsrModule } from './meeting-asr/meeting-asr.module';
import { MeetingModule } from './meeting/meeting.module';
import { isMeetingExposed } from './meeting/meeting-dev-only.guard';
import { FeedbackModule } from './feedback/feedback.module';
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
    TaskStatsModule, // 任务统计（管理员视角：任务日志 + 模型效果对比）
    OperationLogModule, // 操作日志（全局拦截器写入 + admin 只读查询）
    QuotaModule, // 组件生成配额限制（全局模块）
    LiteModule, // 轻量组件生成（截图/Figma → Vue3/微码 Lite/Max）
    RecipesModule, // 场景配方库（内置 + 另存为模板）
    McSpecModule, // 微码组件规范检查（调用 skills/frontend-mc-check 的 mc-check.cjs）
    AnnouncementModule, // 系统公告（管理员发布，用户端通知铃铛）
    WorkbenchModule, // 工作台模式（对话式交互）
    // 会议录音转写（ASR）：2026-11-06 源文件丢失后由 dist 产物机械重建后补注册。
    // 控制器挂类级 SessionGuard（写入端点有副作用，必须归属）；密钥仍为全局配置
    // （用户 2026-11-06 裁决「保持全局」，不改成 per-user）。
    MeetingAsrModule,
    // 任务反馈（详情页「💬 反馈」→ 管理端处置台）：2026-11-06 源文件丢失后由 dist
    // 产物机械重建，此处补回注册。用户端 POST /tasks/:sid/feedback 挂 SessionGuard，
    // 管理端 /admin/feedbacks 全量 assertAdmin，路由不存在时前端报 Cannot POST。
    FeedbackModule,
    // v2 可配管线（规范 × 档位 × 模型），dev 专用：
    // 生产环境整个模块不注册，连路由都不存在；控制器上的 DevOnlyGuard 是第二道保险。
    ...(isV2Exposed() ? [V2PipelineModule] : []),
    // v3 项目级管线（M1：S0 扫描 + S2 契约冻结），dev 专用：
    // 开关与控制器上的 ProjectDevOnlyGuard **同一个函数**（isV3ProjectExposed），
    // 避免「模块注册了但守卫 404」的静默失效。
    ...(isV3ProjectExposed() ? [ProjectPipelineModule] : []),
    // lite-lab 真值回填实验管线（lite 布局 + Figma node 真值匹配回填），dev 专用：
    // 开关与控制器守卫同一个函数（isLiteLabExposed），Stage A 复用 LiteModule，
    // 摘掉本模块对既有生成链路零影响。
    ...(isLiteLabExposed() ? [LiteLabModule] : []),
    // 会议纪要管线（契约 E-01~E-18，含 ownerId 用户级归属），dev 专用：
    // 契约 BACKEND_DEPENDENCIES 五项（D-01/T-013/SEC-05/SEC-01/Q-04）全部 ready:false 且「阻塞」
    // ⇒ 依赖就绪前不得对外暴露。开关与控制器上的 MeetingDevOnlyGuard 同一个函数
    // （isMeetingExposed），避免「模块注册了但守卫 404」的静默失效。
    ...(isMeetingExposed() ? [MeetingModule] : []),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局操作日志拦截器：每次 HTTP 请求完成后写入 OperationLog（fire-and-forget）
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
  ],
})
export class AppModule {}
