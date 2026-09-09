import { Controller, Get, Post, Body, Session, UseGuards } from '@nestjs/common';
import { AiConfigService } from './config.service';
import { ConfigTestService } from './config-test.service';
import { UserAiConfigService } from './user-ai-config.service';
import { TasksService } from '../tasks/tasks.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';

/**
 * 服务端 AI 配置接口（接口保存）。
 * GET  /api/config/ai  → 返回已保存配置
 * POST /api/config/ai  → 保存配置（来自前端设置面板）
 *
 * 测试接口：
 * POST /api/config/test-text    → 测试文本模型连通性
 * POST /api/config/test-vision  → 测试视觉模型能力
 * POST /api/config/test-figma   → 测试 Figma Token
 * POST /api/config/test-apifox  → 测试 Apifox Token
 */
@Controller('config')
export class AiConfigController {
  constructor(
    private readonly svc: AiConfigService,
    private readonly testSvc: ConfigTestService,
    private readonly userAiConfigService: UserAiConfigService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('ai')
  @UseGuards(SessionGuard)
  async getAi(@CurrentUser() userId: string) {
    // 🆕 读写对称：面板打开读当前用户的合并配置（全局 + 每用户），与保存 saveUserConfig 对应
    const config = await this.svc.getUserMergedConfig(userId);
    return { success: true, config };
  }

  @Post('ai')
  @UseGuards(SessionGuard)
  async saveAi(
    @Body() body: Record<string, any>,
    @Session() session: Record<string, any>,
    @CurrentUser() userId: string,
  ) {
    const action = body?.action || 'save-current';
    let result: Record<string, any>;
    switch (action) {
      // 🆕 方案 B（2026-09-04）：apply/create/update/delete 操作的是「全局模型模板」
      // （模型库 + 方案），影响所有人 → 仅管理员可执行（口径同 Java AdminInterceptor：isAdmin=true）。
      case 'apply':
        await this.svc.assertProfileAdmin(userId);
        result = this.svc.applyProfile(body.activeProfileId, userId);
        break;
      case 'create':
        await this.svc.assertProfileAdmin(userId);
        result = this.svc.createProfile(body.name, body.config, userId);
        break;
      case 'update':
        await this.svc.assertProfileAdmin(userId);
        result = this.svc.updateProfile(body.profileId, body.name, body.config, userId);
        break;
      case 'delete':
        await this.svc.assertProfileAdmin(userId);
        result = this.svc.deleteProfile(body.profileId, userId);
        break;
      case 'save-current':
      default:
        // 🆕 方案 B：面板保存仅写用户级（下方 saveUserConfig），不再刷全局模板。
        // 旧实现这里调 saveCurrentProfile 把个人保存 last-writer-wins 进全局文件，
        // 导致未配置用户「跟随管理员最后一次保存」——与「每个人都不同」语义冲突，废止。
        result = { config: await this.svc.getUserMergedConfig(userId) };
        break;
    }
    // 用户级存储（仅全局方案 MVP：仍存扁平，剥离方案元字段避免 strict schema 拒绝）
    if (userId) {
      const userBody = { ...(body || {}) };
      delete userBody.action;
      delete userBody.profiles;
      delete userBody.activeProfileId;
      delete userBody.name;
      delete userBody.profileId;
      delete userBody.config;
      await this.userAiConfigService.saveUserConfig(userId, userBody);
    }
    // 🆕 生效语义：配置修改不热切换正在运行的任务（生成执行启动时已冻结 vision/text 配置），
    // 从「下次生成 / 重试 / 续跑 / 精修」重新进入 executeGeneration 时生效。
    // appliesTo 恒为 'next-run'；hasRunningTasks 供前端条件提示「有进行中任务，改动下次生效」。
    const hasRunningTasks = this.tasksService.countActiveTasks(userId) > 0;
    return { success: true, appliesTo: 'next-run', hasRunningTasks, ...result };
  }

  @Post('test-text')
  async testText(@Body() body: Record<string, any>) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const result = await this.testSvc.testTextLLM({ apiKey, baseURL, model, temperature, providerType });
    // 显式包裹 { data } 层：ResponseEnvelopeInterceptor 检测到 data 字段后
    // 不会剥离业务字段为扁平信封，前端 `data?.data?.success` 才能读到完整结构。
    return { success: true, data: result };
  }

  @Post('test-vision')
  async testVision(@Body() body: Record<string, any>) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const result = await this.testSvc.testVisionLLM({ apiKey, baseURL, model, temperature, providerType });
    return { success: true, data: result };
  }

  /**
   * 检测模型综合能力：文本 + 视觉 + 推理（三维）
   * 返回：{ text, vision, reasoning } 各维度 TestResult，供前端自动识别能力回填 capability
   */
  @Post('test-model-capability')
  async testModelCapability(@Body() body: Record<string, any>) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const result = await this.testSvc.testModelCapability({ apiKey, baseURL, model, temperature, providerType });
    return { success: true, data: result };
  }

  /**
   * 测试供应商池中某个 provider 的文本 + 识图能力
   * 返回：{ text: TestResult, vision: TestResult }
   */
  @Post('test-provider')
  async testProvider(@Body() body: Record<string, any>) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const [textResult, visionResult] = await Promise.all([
      this.testSvc.testTextLLM({ apiKey, baseURL, model, temperature, providerType }),
      this.testSvc.testVisionLLM({ apiKey, baseURL, model, temperature, providerType }),
    ]);
    return {
      success: textResult.success || visionResult.success,
      text: textResult,
      vision: visionResult,
    };
  }

  @Post('test-figma')
  async testFigma(@Body() body: Record<string, any>) {
    const { token } = body || {};
    if (!token) {
      return {
        success: false,
        error: '请填写 Figma Token',
      };
    }
    return this.testSvc.testFigmaToken({ token });
  }

  @Post('test-apifox')
  async testApifox(@Body() body: Record<string, any>) {
    const { token } = body || {};
    if (!token) {
      return {
        success: false,
        error: '请填写 Apifox Token',
      };
    }
    return this.testSvc.testApifoxToken({ token });
  }

  @Post('test-gitlab')
  async testGitlab(@Body() body: Record<string, any>) {
    const { token } = body || {};
    if (!token) {
      return {
        success: false,
        error: '请填写 GitLab Token',
      };
    }
    return this.testSvc.testGitlabToken({ token });
  }
}
