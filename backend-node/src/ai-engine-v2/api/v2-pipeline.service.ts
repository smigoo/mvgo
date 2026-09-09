import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tempComponentsDir } from '../../config/backend-root';
import { AiConfigService } from '../../config/config.service';
import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import type { GenerateV2Dto, PreviewV2Dto } from './dto/v2-pipeline.dto';
import { validateVueSfc } from '../../ai-engine/utils/sfc-syntax-validation.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GroupMember } from '../../schemas/group-member.schema';
import { resolvePrivateGroupId } from '../../common/group-resolver';

/**
 * v2 可配管线服务 —— NestJS(CJS) 与引擎(ESM .js) 的桥接层
 *
 * 引擎全部以 ESM `.js` 编写、由 nest-cli 原样拷贝到 dist，
 * 因此只能通过动态 import() 加载（与 phase2.service 加载旧 graph 的方式一致）。
 * 模块句柄缓存在实例上，避免每次请求都过一遍 ESM 解析。
 *
 * 职责边界：
 *   本服务只做「请求 → 引擎入参」的翻译和任务/进度接线，
 *   规范解析、档位裁剪、模型路由等决策全在引擎内部，服务层不重复判断。
 */
@Injectable()
export class V2PipelineService implements OnModuleInit {
  private readonly logger = new Logger(V2PipelineService.name);

  private engine: any = null;
  private registryLoaded: {
    specs: string[];
    builtin: string[];
    user: string[];
    warnings: string[];
  } | null = null;

  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly progressService: ProgressService,
    private readonly tasksService: TasksService,
    @InjectModel(GroupMember.name)
    private readonly groupMemberModel: Model<any>,
  ) {}

  /**
   * 启动时就把规范注册表加载好并暴露告警。
   *
   * 放在 onModuleInit 而不是首次请求，是为了让「规范包写坏了」在服务启动日志里
   * 立刻可见，而不是等某个用户点了生成才炸。
   */
  async onModuleInit() {
    try {
      const { specRegistry } = await this.loadEngine();
      const loaded = specRegistry.loadSpecRegistry({ includeUser: true });
      this.registryLoaded = loaded;
      const { specs, builtin, user, warnings } = loaded;
      this.logger.log(
        `[v2] 规范注册表已加载: ${specs.length} 个（内置 ${builtin.length} / 用户 ${user.length}）`,
      );
      for (const w of warnings) this.logger.warn(`[v2] ${w}`);
    } catch (e: any) {
      // 规范加载失败不阻断服务启动 —— v2 是 dev 实验功能，不能拖垮主进程
      this.logger.error(`[v2] 规范注册表加载失败: ${e.message}`);
    }
  }

  /** 惰性加载并缓存引擎各模块 */
  private async loadEngine() {
    if (this.engine) return this.engine;

    const [specRegistry, tierProfile, modelResolver, pipeline, inputAdapters, aiDefaults] =
      await Promise.all([
        import('../specs/spec-registry.js'),
        import('../pipeline/tier-profile.js'),
        import('../pipeline/model-resolver.js'),
        import('../pipeline/configurable-pipeline.js'),
        import('../pipeline/input-adapters/index.js'),
        import('../../ai-engine/utils/ai-defaults.js'),
      ]);

    this.engine = {
      specRegistry,
      tierProfile,
      modelResolver,
      pipeline,
      inputAdapters,
      aiDefaults,
    };
    return this.engine;
  }

  /** 注册表未加载（如启动时加载失败）则补一次 */
  private async ensureRegistry() {
    const engine = await this.loadEngine();
    if (!this.registryLoaded) {
      this.registryLoaded = engine.specRegistry.loadSpecRegistry({ includeUser: true });
    }
    return engine;
  }

  /**
   * 配置页元数据：有哪些规范、哪些档位、每个档位哪些节点可换模型
   */
  async getCatalog() {
    const engine = await this.ensureRegistry();
    const { specRegistry, tierProfile, modelResolver, inputAdapters } = engine;

    const tiers = tierProfile.listTiers().map((t: any) => ({
      ...t,
      configurableNodes: modelResolver.listConfigurableNodes(
        tierProfile.resolveTier(t.id),
      ),
    }));

    return {
      specs: specRegistry.listSpecs(),
      tiers,
      sourceTypes: inputAdapters.SUPPORTED_SOURCE_TYPES,
      defaults: {
        spec: 'microcode',
        tier: tierProfile.DEFAULT_TIER,
        sourceType: 'screenshot',
      },
      fallbackModels: modelResolver.FALLBACK_MODELS,
      registryWarnings: this.registryLoaded?.warnings || [],
    };
  }

  /**
   * 引擎自检：规范文档注入完整性 + 各档位节点覆盖 + 凭证可用性
   * 不实例化任何 role、不调用 LLM
   */
  async health(userId?: string) {
    const engine = await this.ensureRegistry();
    const { specRegistry, tierProfile } = engine;

    const audit = specRegistry.auditRegistry();
    const aiConfig = await this.buildAiConfig({}, userId);

    const tiers: Record<string, any> = {};
    for (const t of tierProfile.listTiers()) {
      try {
        const preview = await this.buildPreview(
          { spec: 'microcode', tier: t.id },
          aiConfig,
        );
        tiers[t.id] = {
          ok: true,
          llmCallCount: preview.llmCallCount,
          credentialsOk: preview.credentialsOk,
          missingCredentials: preview.missingCredentials,
        };
      } catch (e: any) {
        tiers[t.id] = { ok: false, error: e.message };
      }
    }

    return {
      // ok 只表示「引擎自身健康」：规范文档齐、各档位能装配
      ok: audit.ok && Object.values(tiers).every((t: any) => t.ok),
      // generationReady 才是「能不能真的点生成」：还要求凭证到位
      // 配置页据此决定生成按钮是否可点，而不是拿 ok 来判断
      generationReady:
        audit.ok && Object.values(tiers).every((t: any) => t.ok && t.credentialsOk),
      specAudit: {
        ok: audit.ok,
        warnings: audit.warnings,
        reports: audit.reports,
      },
      tiers,
      exposedBy: process.env.AI_ENGINE_V2_ENABLED
        ? 'AI_ENGINE_V2_ENABLED'
        : `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
    };
  }

  /** 执行前预览：会跑哪些节点、用什么模型、几次 LLM 调用、凭证齐不齐 */
  async preview(dto: PreviewV2Dto, userId?: string) {
    const aiConfig = await this.buildAiConfig(dto.config, userId);
    return this.buildPreview(dto, aiConfig);
  }

  private async buildPreview(dto: PreviewV2Dto, aiConfig: any) {
    const engine = await this.ensureRegistry();
    const { ConfigurablePipeline } = engine.pipeline;

    const p = new ConfigurablePipeline({
      spec: dto.spec || 'microcode',
      tier: dto.tier || 'lite',
      sourceType: dto.sourceType || 'screenshot',
      specOverrides: dto.specOverrides,
      tierOverrides: dto.tierOverrides,
      modelOverrides: dto.modelOverrides,
      aiConfig,
    });

    const view = p.preview();
    const prepared = p.prepare();

    return {
      ...view,
      // 模型表脱敏后返回：配置页要展示「每个节点最终用了哪个模型、来自哪一层优先级」
      models: Object.values(prepared.modelTable).map((m: any) => ({
        nodeId: m.nodeId,
        channel: m.channel,
        model: m.model,
        source: m.source,
        callsLlm: m.callsLlm,
        deterministic: m.deterministic,
        hasApiKey: Boolean(m.apiKey),
      })),
      expectedLlmCalls: prepared.tierProfile.expectedLlmCalls,
      matchesExpected: prepared.matchesExpected,
    };
  }

  /**
   * 异步执行生成：立即返回，进度经全局 SSE 推送
   *
   * 不在这里 await —— 与 Lite/Phase2 一致，控制器负责 fire-and-forget，
   * 终态由 ProgressService.sendComplete / sendError 统一落。
   */
  async runGeneration(
    sessionId: string,
    dto: GenerateV2Dto,
    groupId: string,
    userId?: string,
  ) {
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Phase2/Vue3 一致）
    groupId = await resolvePrivateGroupId(groupId, userId, this.groupMemberModel);

    const engine = await this.ensureRegistry();
    const { ConfigurablePipeline } = engine.pipeline;

    const outputPath = join(tempComponentsDir, groupId, sessionId);
    mkdirSync(outputPath, { recursive: true });

    const aiConfig = await this.buildAiConfig(dto.config, userId);

    const pipeline = new ConfigurablePipeline({
      spec: dto.spec || 'microcode',
      tier: dto.tier || 'lite',
      sourceType: dto.sourceType || 'screenshot',
      specOverrides: dto.specOverrides,
      tierOverrides: dto.tierOverrides,
      modelOverrides: dto.modelOverrides,
      promptInjectionMode: dto.promptInjectionMode || 'replace',
      aiConfig,
      workspaceDir: outputPath,
      // 截图渲染以 sessionId 做路径隔离，必须显式透传，不能让引擎回退到组件名
      sessionId,
      // 预览发布用，决定产物同步到 workspace 的哪个分组目录
      groupId,
      onProgress: (evt: any) => {
        this.progressService.sendProgress(sessionId, {
          stage: evt.stage,
          message: evt.message,
          status: evt.status,
          timestamp: evt.ts,
        });
      },
    });

    try {
      const result = await pipeline.execute({
        screenshot: dto.imageBase64,
        figmaUrl: dto.figmaUrl,
        figmaToken: this.resolveFigmaToken(dto.config?.figmaToken),
        componentName: dto.componentName || sessionId,
      });

      const written = this.writeArtifacts(outputPath, result.artifacts);

      const payload = {
        sessionId,
        spec: result.spec,
        tier: result.tier,
        sourceType: result.sourceType,
        componentName: result.componentName,
        outputPath,
        files: written,
        quality: result.quality,
        warnings: result.warnings,
        durationMs: result.durationMs,
        trace: result.trace,
      };

      await this.progressService.sendComplete(sessionId, payload);
      return payload;
    } catch (e: any) {
      this.logger.error(`[v2] 生成失败 ${sessionId}: ${e.message}`);
      await this.progressService.sendError(sessionId, {
        code: e.nodeId ? 'NODE_FAILED' : 'PIPELINE_FAILED',
        message: e.message,
        nodeId: e.nodeId,
        trace: e.trace,
      });
      throw e;
    }
  }

  /** 把 emit 节点产出的文件表落盘 */
  private writeArtifacts(outputPath: string, artifacts: any): string[] {
    if (!artifacts?.files) return [];
    const written: string[] = [];

    for (const [relPath, content] of Object.entries(artifacts.files)) {
      // 防目录穿越：规范声明的产物路径不允许跳出输出目录
      const abs = join(outputPath, relPath);
      if (!abs.startsWith(outputPath)) {
        this.logger.warn(`[v2] 跳过越界产物路径: ${relPath}`);
        continue;
      }
      const dir = dirname(abs);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const source = String(content);
      if (String(relPath).endsWith('.vue')) {
        const syntaxResult = validateVueSfc(source, String(relPath));
        if (!syntaxResult.valid) {
          throw new Error(`拒绝写入不可编译 Vue SFC ${relPath}: ${syntaxResult.errors.join('; ')}`);
        }
      }
      writeFileSync(abs, source, 'utf-8');
      written.push(relPath);
    }
    return written;
  }

  /**
   * 组装引擎期望的 aiConfig 形态 { visionAIConfig, textAIConfig }
   * 优先级与 Phase2 保持一致：请求 config > 用户 DB 配置 > 服务端 ai-config.json > 环境变量
   */
  private async buildAiConfig(config: Record<string, any> = {}, userId?: string) {
    const engine = await this.loadEngine();
    const { resolveVisionConfig, resolveTextConfig } = engine.aiDefaults;

    // 🔧 每用户隔离（2026-09-xx）：改用 getMergedAiConfig(userId)，
    // 其合并规则为「请求 config > 用户级配置(含 binding 用户优先) > 全局配置」，
    // 避免全局 ai-config.json 被他人保存覆盖后，本用户生成仍沿用别人的模型选择。
    const saved = (await this.aiConfigService.getMergedAiConfig(userId)) || {};

    const pick = (key: string) => {
      for (const value of [config?.[key], saved[key]]) {
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return undefined;
    };
    const merged = {
      ...config,
      visionApiKey: pick('visionApiKey'),
      visionBaseURL: pick('visionBaseURL'),
      visionModel: pick('visionModel'),
      visionProviderType: pick('visionProviderType'),
      visionTemperature: pick('visionTemperature'),
      textApiKey: pick('textApiKey'),
      textBaseURL: pick('textBaseURL'),
      textModel: pick('textModel'),
      textProviderType: pick('textProviderType'),
      textTemperature: pick('textTemperature'),
      unifiedApiKey: pick('unifiedApiKey'),
      unifiedBaseURL: pick('unifiedBaseURL'),
      unifiedModel: pick('unifiedModel'),
      unifiedProviderType: pick('unifiedProviderType'),
      unifiedTemperature: pick('unifiedTemperature'),
      modelMode: pick('modelMode'),
    };

    return {
      visionAIConfig: resolveVisionConfig(merged),
      textAIConfig: resolveTextConfig(merged),
    };
  }

  private resolveFigmaToken(requestToken?: string): string | undefined {
    const direct = typeof requestToken === 'string' ? requestToken.trim() : '';
    if (direct) return direct;

    const saved = this.aiConfigService.getAiConfig()?.figmaToken;
    const persisted = typeof saved === 'string' ? saved.trim() : '';
    return persisted || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN;
  }

  /** 暂无分组概念时按用户 uid 落到私人组（与 Lite/Phase2/Vue3 一致）；供控制器解析一次后透传 */
  async resolveGroupId(dtoGroupId: string | undefined, userId?: string): Promise<string> {
    return resolvePrivateGroupId(dtoGroupId, userId, this.groupMemberModel);
  }

  /** 供控制器写任务卡片用 */
  buildTaskMetadata(sessionId: string, dto: GenerateV2Dto, groupId: string, userId?: string) {
    return {
      componentId: sessionId,
      componentName: dto.componentName || sessionId,
      // 任务列表的 target 只认 vue3/microcode，v2 的 spec 维度更宽，
      // 这里做一次向下映射，保证旧任务卡片不至于显示空白
      target: dto.spec === 'microcode' ? 'microcode' : 'vue3',
      groupId,
      taskType: 'component' as const,
      userId,
      generationTier: (dto.tier || 'lite') as any,
      sourceType: (dto.sourceType || 'screenshot') as any,
      outputPath: join(tempComponentsDir, groupId, sessionId),
    };
  }

  /**
   * 上传自定义规范：将用户提交的 JSON 规范定义写入 specs/user/ 目录
   * 作为新的用户规范包，后续 catalog/preview/generate 均可选用。
   *
   * @param specDef 用户上传的规范定义（至少含 id / label / version）
   * @returns 写入的规范 id 与目录路径
   */
  async uploadSpec(specDef: Record<string, any>) {
    const { id, label, version } = specDef;
    if (!id || !label || !version) {
      throw new Error('自定义规范缺少必填字段: id, label, version');
    }
    // 安全校验：id 格式与内置规范一致
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id) || id.length > 64) {
      throw new Error(
        `非法规范 id "${id}"（要求小写字母/数字/中划线，2-64 位）`
      );
    }

    // 用户规范目录：与 spec-registry.js 中 USER_SPECS_DIR 保持一致
    const { USER_SPECS_DIR } = await import('../specs/spec-registry.js');
    const packageDir = join(USER_SPECS_DIR, id);

    // 防止覆盖内置规范（通过 loadSpecRegistry 内置列表检查）
    const { loadSpecRegistry } = await import('../specs/spec-registry.js');
    const registry = loadSpecRegistry({ includeUser: false });
    if (registry.builtin.includes(id)) {
      throw new Error(`规范 id "${id}" 与内置规范冲突，不可覆盖`);
    }

    mkdirSync(packageDir, { recursive: true });

    // 写 skill.json 清单
    writeFileSync(
      join(packageDir, 'skill.json'),
      JSON.stringify({ id, label, version, __source: 'upload' }, null, 2),
      'utf-8'
    );

    // 如有额外 spec 字段（nodes/tiers/engineerClass 等），写 spec.json
    const specFields = { ...specDef };
    delete specFields.id;
    delete specFields.label;
    delete specFields.version;
    if (Object.keys(specFields).length > 0) {
      writeFileSync(
        join(packageDir, 'spec.json'),
        JSON.stringify(specFields, null, 2),
        'utf-8'
      );
    }

    // 标记 registry 需要重新加载（下次 catalog 调用时生效）
    this.registryLoaded = null;

    this.logger.log(`[v2] 自定义规范已上传: ${id} → ${packageDir}`);
    return { id, packageDir };
  }
}
