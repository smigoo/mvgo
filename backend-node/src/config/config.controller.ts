import { Controller, Get, Post, Body, Session, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AiConfigService } from './config.service';
import { ConfigTestService } from './config-test.service';
import { UserAiConfigService } from './user-ai-config.service';
import { TasksService } from '../tasks/tasks.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import {
  resolveVisionCapability,
  markModelCapabilityIdentified,
} from '../ai-engine/utils/model-config.js';

/**
 * 模型绑定指纹：sha256(baseURL|apiKey|model)。
 * 保存闸门据此在 verifiedModels 中查找「该模型当前凭据」的实测结论，
 * 换 Key / 换地址 / 换模型名都会得到新指纹 → 旧实测结论自然失效，必须重测。
 */
function modelBindKey(apiKey: string, baseURL: string, model: string): string {
  return createHash('sha256')
    .update(`${baseURL}|${apiKey}|${model}`)
    .digest('hex');
}

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
    const userBody = { ...(body || {}) };
    delete userBody.action;
    delete userBody.profiles;
    delete userBody.activeProfileId;
    delete userBody.name;
    delete userBody.profileId;
    delete userBody.config;
    // 🧹 按 modelMode 规范化槽位绑定，防止切模式后旧槽位数据残留导致误判。
    // 例如 separate 模式下 unified 池若残留旧数据，会被错误当成视觉槽位引用。
    userBody.binding = this.normalizeBinding(userBody.modelMode, userBody.binding);
    // 🔒 保存闸门（2026-09-10 最终口径）：默认什么都不支持；模型填写完整后必须
    // 至少执行过一次「自动识别能力」服务端实测（无论识别出 text/vision/both 还是都没有），
    // 才能保存。没有识别出任何能力的模型不会进入槽位/池候选（由前端 slotCandidates 过滤）。
    // 挂到当前模式真实视觉槽位（vision 或 unified）的模型，还须实测支持视觉。
    // 凭据脱敏回传值（含连续 *）跳过校验，沿用既往实测事实。
    if (userId) {
      const gate = await this.enforceModelVerification(userBody, userId);
      if (gate) {
        return { success: false, error: gate.error, details: gate.details };
      }
    }
    // 🔍 保存时「先检测」：视觉能力结论必须来自实测，不依赖任何模型名白名单。
    // 口径（2026-09-10 用户明确）：**保存本身不因能力问题被拦截**——配置是用户资产，
    // 不支持视觉的模型照样可以存（它仍可用于纯文本任务）。但保存这一刻要对承担
    // 视觉角色的模型做一次实测并把结论落盘，作为后续「生成闸门」的唯一事实源。
    // 真正的限制在生成侧：视觉模型无视觉能力 → 不允许生成。
    let visionCheck: Array<{ model: string; slot: string; vision: boolean | null; message: string }> = [];
    if (userId) {
      visionCheck = await this.detectVisionCapabilityOnSave(userBody);
      await this.userAiConfigService.saveUserConfig(userId, userBody);
    }
    // 🆕 生效语义：配置修改不热切换正在运行的任务（生成执行启动时已冻结 vision/text 配置），
    // 从「下次生成 / 重试 / 续跑 / 精修」重新进入 executeGeneration 时生效。
    // appliesTo 恒为 'next-run'；hasRunningTasks 供前端条件提示「有进行中任务，改动下次生效」。
    const hasRunningTasks = this.tasksService.countActiveTasks(userId) > 0;
    return {
      success: true,
      appliesTo: 'next-run',
      hasRunningTasks,
      ...(visionCheck.length ? { visionCheck } : {}),
      ...(visionCheck.some((v) => v.vision !== true)
        ? {
            visionWarnings: visionCheck
              .filter((v) => v.vision !== true)
              .map((v) => v.message),
          }
        : {}),
      ...result,
    };
  }

  /**
   * 🧹 按 modelMode 规范化 binding：非当前模式槽位清空，避免旧模式残留数据误导
   * 后续视觉检测 / 保存闸门 / 生成链路。
   */
  private normalizeBinding(
    mode: string | undefined,
    binding: Record<string, any> | undefined,
  ): Record<string, any> {
    const emptySlot = () => ({ primaryId: '', poolIds: [] as string[] });
    const b = { ...(binding || {}) };
    if (mode === 'unified') {
      return {
        unified: {
          primaryId: String(b?.unified?.primaryId || ''),
          poolIds: Array.isArray(b?.unified?.poolIds) ? [...b.unified.poolIds] : [],
        },
        text: emptySlot(),
        vision: emptySlot(),
      };
    }
    // 默认 separate / vision / 其它都按 separate 处理
    return {
      text: {
        primaryId: String(b?.text?.primaryId || ''),
        poolIds: Array.isArray(b?.text?.poolIds) ? [...b.text.poolIds] : [],
      },
      vision: {
        primaryId: String(b?.vision?.primaryId || ''),
        poolIds: Array.isArray(b?.vision?.poolIds) ? [...b.vision.poolIds] : [],
      },
      unified: emptySlot(),
    };
  }

  /**
   * 🔒 保存闸门：校验模型库中每个填写完整的模型都执行过「自动识别能力」服务端实测。
   * 无论实测识别出 text/vision/both 还是没有识别出任何能力，只要已检测即可保存；
   * 挂到当前模式真实视觉槽位（vision 或 unified）的模型，还须实测支持视觉。
   * 通过 → 返回 null；被拦 → 返回 { error, details }（saveAi 以 success:false 返回前端）。
   */
  private async enforceModelVerification(
    cfg: Record<string, any>,
    userId: string,
  ): Promise<{ error: string; details: string[] } | null> {
    const models = Array.isArray(cfg?.models) ? cfg.models : [];
    if (!models.length) return null;

    const verified = await this.userAiConfigService.getModelVerifications(userId);
    const mode = String(cfg?.modelMode || 'separate');
    const binding = cfg?.binding || {};
    // 视觉槽位只在当前模式下有意义；binding 已被 normalizeBinding 清理过，此处防御性再取一次
    const visionSlotIds = new Set<string>(
      mode === 'unified'
        ? [
            ...(binding?.unified?.primaryId ? [String(binding.unified.primaryId)] : []),
            ...((Array.isArray(binding?.unified?.poolIds) ? binding.unified.poolIds : []) as string[]).map(String),
          ]
        : [
            ...(binding?.vision?.primaryId ? [String(binding.vision.primaryId)] : []),
            ...((Array.isArray(binding?.vision?.poolIds) ? binding.vision.poolIds : []) as string[]).map(String),
          ],
    );

    const details: string[] = [];
    for (const m of models) {
      const apiKey = String(m?.apiKey || '').trim();
      const baseURL = String(m?.baseURL || '').trim();
      const model = String(m?.model || '').trim();
      // 脱敏回传 Key（连续 *）= 用户未改动凭据，沿用既往实测事实，跳过校验
      if (/\*{3,}/.test(apiKey)) continue;
      const label = String(m?.name || '').trim() || model;
      // 完全空白的模型卡片（四个标识字段都空）跳过；只要有一项有内容就视为用户意图保存的模型，
      // 必须走服务端实测校验——否则仅填了 name+apiKey+model 而漏 baseURL 的垃圾模型会漏过校验入库。
      if (!apiKey && !baseURL && !model && !label) continue;
      const rec = verified[modelBindKey(apiKey, baseURL, model)];
      // 必须已执行过检测（rec 存在且至少一个维度有结论）
      if (!rec || (typeof rec.text !== 'boolean' && typeof rec.vision !== 'boolean')) {
        details.push(
          `「${label}」（${model}）尚未执行「自动识别能力」检测，请点击模型卡片内该按钮完成检测后再保存`,
        );
        continue;
      }
      if (visionSlotIds.has(String(m?.id || '')) && rec.vision !== true) {
        details.push(
          `「${label}」（${model}）实测不支持视觉输入，不能挂到视觉/统一槽位；请更换支持视觉的模型，或把它改挂到「仅文本」槽位`,
        );
      }
    }

    if (!details.length) return null;
    return {
      error: `保存被拦截：${details[0]}`,
      details,
    };
  }

  /**
   * 收集配置中承担「视觉角色」的模型。
   * 新版：binding.vision / binding.unified 的 primaryId 从 models[] 取条目；
   * legacy：按 modelMode 取 unifiedModel / visionModel 扁平字段。
   */
  private collectVisionRoleModels(
    cfg: Record<string, any>,
  ): Array<{ name: string; slot: string; entry: Record<string, any> }> {
    const models = Array.isArray(cfg?.models) ? cfg.models : [];
    const byId = new Map<string, any>(models.map((m: any) => [String(m?.id || ''), m]));
    const out: Array<{ name: string; slot: string; entry: Record<string, any> }> = [];

    const push = (id: any, slot: string) => {
      const entry = byId.get(String(id || ''));
      const name = String(entry?.model || '').trim();
      if (name) out.push({ name, slot, entry: entry || {} });
    };

    const binding = cfg?.binding || {};
    const mode = String(cfg?.modelMode || 'separate');
    // 只在当前模式下取视觉槽位引用，避免 normalizeBinding 之前或旧数据残留导致误判
    if (mode === 'unified') {
      if (binding?.unified?.primaryId) push(binding.unified.primaryId, 'unified');
    } else {
      if (binding?.vision?.primaryId) push(binding.vision.primaryId, 'vision');
    }

    // legacy 扁平字段（老配置无 models[] / binding）
    if (mode === 'unified' && cfg?.unifiedModel) {
      out.push({
        name: String(cfg.unifiedModel).trim(),
        slot: 'unified',
        entry: {
          apiKey: cfg.unifiedApiKey,
          baseURL: cfg.unifiedBaseURL,
          providerType: cfg.unifiedProviderType,
        },
      });
    }
    if (mode !== 'unified' && cfg?.visionModel) {
      out.push({
        name: String(cfg.visionModel).trim(),
        slot: 'vision',
        entry: {
          apiKey: cfg.visionApiKey,
          baseURL: cfg.visionBaseURL,
          providerType: cfg.visionProviderType,
        },
      });
    }

    const seen = new Set<string>();
    return out.filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)));
  }

  /**
   * 🔍 保存时视觉能力「先检测」（**不阻断保存**）。
   *
   * 口径（2026-09-10 用户明确）：保存永远允许——配置是用户资产，不支持视觉的模型
   * 照样能存（仍可用于纯文本任务）。但保存这一刻必须把承担视觉角色的模型实测一遍
   * 并把结论落盘，因为生成侧是 fail-closed 的：没有结论 = 不能生成。
   *
   * - 已有实测结论（true/false）→ 复用，不重复打 API（避免每次保存都变慢）
   * - 未检测 + 有可用密钥 → 实测一次并 markModelCapabilityIdentified 落盘
   * - 未检测 + 密钥缺失/脱敏（前端回传 sk-***）/ 调用异常 → vision=null（未知），
   *   只提示不阻断；生成闸门会拒「未知」，用户重测后即可用
   */
  private async detectVisionCapabilityOnSave(
    cfg: Record<string, any>,
  ): Promise<Array<{ model: string; slot: string; vision: boolean | null; message: string }>> {
    const targets = this.collectVisionRoleModels(cfg);
    if (!targets.length) return [];

    return Promise.all(
      targets.map(async (t) => {
        const cap = resolveVisionCapability(t.name);
        if (cap.vision === true) {
          return {
            model: t.name,
            slot: t.slot,
            vision: true as boolean | null,
            message: `模型「${t.name}」视觉能力已检测：支持`,
          };
        }
        if (cap.vision === false) {
          return {
            model: t.name,
            slot: t.slot,
            vision: false as boolean | null,
            message:
              `模型「${t.name}」（${t.slot} 槽位）实测不支持视觉，配置已保存，但不能用它进行组件生成。` +
              `该模型仍可用于纯文本任务；若要生成组件，请更换为支持视觉的模型，或把它改挂到「仅文本」槽位。`,
          };
        }

        const apiKey = String(t.entry?.apiKey || '');
        // 脱敏值（含连续 *）无法用于真实调用，跳过检测
        if (!apiKey || /\*{3,}/.test(apiKey)) {
          return {
            model: t.name,
            slot: t.slot,
            vision: null,
            message:
              `模型「${t.name}」视觉能力未检测（无可用密钥，可能是脱敏回传值），暂时不能用于组件生成。` +
              `请到「设置 - 模型配置」点击「检测」完成识别。`,
          };
        }

        try {
          const r = await this.testSvc.testVisionLLM({
            apiKey,
            baseURL: String(t.entry?.baseURL || ''),
            model: t.name,
            providerType: t.entry?.providerType,
            timeoutMs: 20000,
          });
          // 落盘实测结论，供生成闸门复用（唯一事实源）
          markModelCapabilityIdentified(t.name, {
            source: 'save-gate',
            vision: !!r?.success,
          });
          if (r?.success) {
            return {
              model: t.name,
              slot: t.slot,
              vision: true as boolean | null,
              message: `模型「${t.name}」视觉能力检测通过：支持`,
            };
          }
          return {
            model: t.name,
            slot: t.slot,
            vision: false as boolean | null,
            message:
              `模型「${t.name}」（${t.slot} 槽位）不支持视觉输入${r?.error ? `：${r.error}` : ''}。` +
              `配置已保存，但不能用它进行组件生成；请更换为支持视觉的模型，或改挂到「仅文本」槽位。`,
          };
        } catch (e: any) {
          return {
            model: t.name,
            slot: t.slot,
            vision: null,
            message:
              `模型「${t.name}」视觉能力检测未完成（${e?.message || '未知错误'}），暂时不能用于组件生成。` +
              `配置已保存，请稍后到「设置 - 模型配置」点击「检测」重试。`,
          };
        }
      }),
    );
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
   * 🔒 带鉴权：测试通过（文本连通）的结论按「绑定指纹」落库到用户实测记录，
   * 是 POST /api/config/ai 保存闸门的唯一放行依据。
   */
  @Post('test-model-capability')
  @UseGuards(SessionGuard)
  async testModelCapability(
    @Body() body: Record<string, any>,
    @CurrentUser() userId: string,
  ) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const result = await this.testSvc.testModelCapability({ apiKey, baseURL, model, temperature, providerType });
    // 🔒 只要检测接口正常返回（无论识别出与否），都记录「已检测」结论，供保存闸门判断。
    if (userId) {
      await this.userAiConfigService.recordModelVerification(
        userId,
        modelBindKey(String(apiKey), String(baseURL), String(model)),
        { text: !!result?.text?.success, vision: !!result?.vision?.success },
      );
    }
    return { success: true, data: result };
  }

  /**
   * 测试供应商池中某个 provider 的文本 + 识图能力
   * 返回：{ text: TestResult, vision: TestResult }
   * 🔒 带鉴权：测试通过的结论同步落库（与 test-model-capability 同一事实源）
   */
  @Post('test-provider')
  @UseGuards(SessionGuard)
  async testProvider(
    @Body() body: Record<string, any>,
    @CurrentUser() userId: string,
  ) {
    const { apiKey, baseURL, model, temperature, providerType } = body || {};
    if (!apiKey || !baseURL || !model) {
      return { success: false, error: '请填写 API Key、Base URL 和 Model' };
    }
    const [textResult, visionResult] = await Promise.all([
      this.testSvc.testTextLLM({ apiKey, baseURL, model, temperature, providerType }),
      this.testSvc.testVisionLLM({ apiKey, baseURL, model, temperature, providerType }),
    ]);
    // 🔒 只要检测接口正常返回，就记录「已检测」结论（不要求任一维度成功）。
    if (userId) {
      await this.userAiConfigService.recordModelVerification(
        userId,
        modelBindKey(String(apiKey), String(baseURL), String(model)),
        { text: !!textResult?.success, vision: !!visionResult?.success },
      );
    }
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
