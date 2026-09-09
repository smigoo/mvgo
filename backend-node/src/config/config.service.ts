import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserAiConfigService } from './user-ai-config.service';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { dataDir } from './backend-root';
import { User } from '../schemas/user.schema';

/**
 * 服务端 AI 配置存储（接口保存，替代前端 localStorage）。
 * 配置以 JSON 文件持久化到 backend-node/data/ai-config.json，
 * 与生成后端（:3000）的服务端 model env 同属「服务端配置」体系，
 * 绑定向导改从本服务读取，避免依赖浏览器 localStorage。
 */
const CONFIG_FILE = path.resolve(dataDir, 'ai-config.json');

const numericField = (min: number, max: number, integer = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }, (integer ? z.number().int() : z.number()).min(min).max(max).optional());

// 允许浮点：weight 为负载均衡权重(可为 0.01 这类小权重)，rpm/tpm 允许浮点亦无副作用；
// 强制 int 会导致「只要配置里混入一个浮点数值，readRawConfig 抛错 → 所有保存全部 400」的数据死锁。
const numberField = (min: number, max: number) => numericField(min, max, false);
const temperatureField = numericField(0, 2);

const stringField = z
  .preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string().optional());

// 🆕 模型库条目（一等公民）：一次可添加 N 个模型，槽位从库中引用。
// capability 为模型固有能力标记（both=通用/ text=仅文本/ vision=仅视觉），驱动槽位候选过滤；
// 降维成 providers 时 capability 映射为 provider.role。
const MODEL_ENTRY_SCHEMA = z.object({
  id: z.string().min(1),
  name: stringField,
  apiKey: stringField,
  baseURL: stringField,
  model: stringField,
  providerType: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : value),
      z.enum(['openai-compatible', 'anthropic', 'auto']).optional(),
    ),
  capability: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : value),
      z.enum(['both', 'text', 'vision']).optional(),
    ),
  temperature: temperatureField,
  rpm: numberField(0, 1_000_000),
  tpm: numberField(0, 1_000_000_000),
  weight: numberField(0, 10_000),
});

// 🆕 槽位绑定：primaryId 指向模型库主模型（必选），poolIds 为额外池成员 id（可空=只用主模型）
const SLOT_BINDING_SCHEMA = z.object({
  primaryId: stringField,
  poolIds: z.array(z.string()).optional(),
});

const AI_CONFIG_BASE_SCHEMA = {
  figmaToken: stringField,
  apifoxToken: stringField,
  // 🆕 GitLab 推送凭据（2026-08-24 打通组件一键推送；secret 字段，读取侧 redactSecrets 脱敏）
  gitlabToken: stringField,
  textApiKey: stringField,
  textBaseURL: stringField,
  textModel: stringField,
  visionApiKey: stringField,
  visionBaseURL: stringField,
  visionModel: stringField,
  unifiedApiKey: stringField,
  unifiedBaseURL: stringField,
  unifiedModel: stringField,
  visionTemperature: temperatureField,
  textTemperature: temperatureField,
  unifiedTemperature: temperatureField,
  modelMode: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }, z.enum(['text', 'vision', 'unified', 'separate']).optional()),
  // 🆕 Provider 类型显式选择：openai-compatible（OpenAI 兼容协议）/ anthropic（Anthropic 原生）/ auto（兼容旧配置，自动识别）
  textProviderType: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }, z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
  visionProviderType: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }, z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
  unifiedProviderType: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }, z.enum(['openai-compatible', 'anthropic', 'auto']).optional()),
  outputPath: stringField,
  requestConcurrency: numberField(1, 10),
  requestQueueTimeoutMs: numberField(1_000, 300_000),
  requestTimeoutMs: numberField(10_000, 900_000),
  requestMaxRetries: numberField(0, 5),
  // 供应商池：多 key 负载分散 + 故障转移。缺省/空数组 = 不启用，回退单一配置
  providers: z
    .preprocess(
      (value) => (Array.isArray(value) ? value : undefined),
      z
        .array(
          z.object({
            id: z.string().min(1),
            apiKey: stringField,
            name: stringField,
            baseURL: stringField,
            model: stringField,
            providerType: z
              .preprocess(
                (value) => (value === undefined || value === null || value === '' ? undefined : value),
                z.enum(['openai-compatible', 'anthropic', 'auto']).optional(),
              ),
            // 🆕 角色分流：text 只进文本池、vision 只进视觉池、both 两者都进（缺省视为 both）。
            // 防止 deepseek-v4-pro 这类纯文本模型被视觉分析 pick 到 → 400 失败。
            role: z
              .preprocess(
                (value) => (value === undefined || value === null || value === '' ? undefined : value),
                z.enum(['text', 'vision', 'both']).optional(),
              ),
            rpm: numberField(0, 1_000_000),
            tpm: numberField(0, 1_000_000_000),
            weight: numberField(0, 10_000),
            temperature: temperatureField,
          }),
        )
        .optional(),
    ),
  // 熔断器参数（failureThreshold=0 表示禁用熔断）
  circuitBreaker: z
    .object({
      failureThreshold: numberField(0, 100),
      cooldownMs: numberField(0, 3_600_000),
    })
    .optional(),
  // 调度策略：primary-first（主模型独占）| weighted-spread（主模型参与加权随机）
  pickStrategy: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }    , z.enum(['primary-first', 'weighted-spread']).optional()),
  // 🆕 模型库（一等公民）：N 个模型条目，槽位从库中引用（最少 1 个、上不封顶）
  models: z
    .preprocess(
      (value) => (Array.isArray(value) ? value : undefined),
      z.array(MODEL_ENTRY_SCHEMA).optional(),
    ),
  // 🆕 槽位绑定：unified/text/vision 各含 primaryId + poolIds，引用模型库 id
  binding: z
    .object({
      unified: SLOT_BINDING_SCHEMA.optional(),
      text: SLOT_BINDING_SCHEMA.optional(),
      vision: SLOT_BINDING_SCHEMA.optional(),
    })
    .optional(),
};

// 🆕 模型方案（Profile）制：profiles 为完整配置快照数组，activeProfileId 指向当前生效方案。
// 必须定义在 AI_CONFIG_BASE_SCHEMA 之后，避免 z.object(AI_CONFIG_BASE_SCHEMA) 自引用 TDZ。
const AI_CONFIG_PROFILE_SCHEMA = {
  profiles: z
    .preprocess(
      (value) => (Array.isArray(value) ? value : undefined),
      z
        .array(
          z.object({
            id: z.string().min(1),
            name: stringField,
            config: z.object(AI_CONFIG_BASE_SCHEMA).passthrough().optional(),
          }),
        )
        .optional(),
    ),
  activeProfileId: stringField,
  // 🆕 根级审计 meta（2026-09-03 补 schema 同步）：写盘（saveCurrentProfile/applyProfile/
  // createProfile/updateProfile/deleteProfile）已在根对象带 lastModifiedBy/updatedAt，
  // 但 AI_CONFIG_SCHEMA 为 .strict() 漏声明这两个 key → readRawConfig 读回即抛
  // `Unrecognized keys: "lastModifiedBy", "updatedAt"` → 面板加载/保存前置读取全失败。
  // 此处与写盘字段对齐（白名单放行，仍是 strict 拦截其它臆造 key）。
  lastModifiedBy: stringField,
  updatedAt: stringField,
};

export const AI_CONFIG_SCHEMA = z
  .object({ ...AI_CONFIG_BASE_SCHEMA, ...AI_CONFIG_PROFILE_SCHEMA })
  .strict();

const TASK_CONFIG_SNAPSHOT_SCHEMA = z
  .object({
    ...AI_CONFIG_BASE_SCHEMA,
    target: z.enum(['microcode', 'vue3']).optional(),
    panelType: stringField,
    // 🆕 phase2 变体管线：要跳过的节点名数组（createPhase2Graph 消费）
    skipNodes: z.array(z.string()).optional(),
  })
  .strict();

export type AiConfig = z.infer<typeof AI_CONFIG_SCHEMA>;

const AI_CONFIG_DEFAULTS: Partial<AiConfig> = {
  requestConcurrency: 4,
  requestQueueTimeoutMs: 120_000,
  requestTimeoutMs: 300_000,
  requestMaxRetries: 1,
};

@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    private readonly userAiConfigService: UserAiConfigService,
    @InjectModel(User.name) private readonly userModel: Model<any>,
  ) {}

  /**
   * 🆕 方案 B（2026-09-04）：全局模型模板管理（apply/create/update/delete）仅限管理员。
   * 口径与 Java AdminInterceptor 一致：users.isAdmin === true。
   */
  async assertProfileAdmin(userId?: string): Promise<void> {
    if (!userId) throw new ForbiddenException('未登录，仅管理员可管理全局模型模板');
    const user = await this.userModel.findById(userId).lean().exec();
    if (!(user as any)?.isAdmin) {
      throw new ForbiddenException('仅管理员可管理全局模型模板');
    }
  }

  /**
   * 读取当前生效（active）方案的扁平配置（含默认值）。
   * 若文件为旧格式（无 profiles 字段），自动把根扁平字段包成 default 方案。
   */
  getAiConfig(): Record<string, any> {
    try {
      const raw = this.readRawConfig();
      const { activeProfile } = this.resolveProfiles(raw);
      return this.applyDefaults(
        this.normalizeConfigInput(activeProfile.config || {}, '读取 AI 配置'),
      );
    } catch (e: any) {
      this.logger.warn(`[AiConfigService] 读取 AI 配置失败: ${e.message}`);
      return this.applyDefaults({});
    }
  }

  /**
   * 读取含方案元信息的配置：返回 active 扁平 config + profiles 列表 + activeProfileId。
   * 前端设置面板据此渲染「方案下拉」并加载当前方案。
   */
  getAiConfigWithProfiles(): {
    config: Record<string, any>;
    profiles: Array<{ id: string; name: string; modelMode?: string }>;
    activeProfileId: string;
  } {
    const raw = this.readRawConfig();
    const { profiles, activeProfileId, activeProfile } = this.resolveProfiles(raw);
    return {
      // 🆕 前端读取入口迁移：旧结构（legacy 字段）自动补 models/binding，
      // 前端模型库 UI 据此渲染（幂等：已有 models 时透传；确定性 id 保证前端 id 稳定）。
      config: migrateLegacyToModels(this.applyDefaults(
        this.normalizeConfigInput(activeProfile.config || {}, '读取 AI 配置'),
      )),
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name || p.id,
        modelMode: p.config?.modelMode,
      })),
      activeProfileId,
    };
  }

  /**
   * 解析 profiles 结构，兼容旧格式（无 profiles 字段时把根扁平配置包成 default 方案）。
   */
  private resolveProfiles(raw: Record<string, any>): {
    profiles: Array<{ id: string; name?: string; config?: Record<string, any> }>;
    activeProfileId: string;
    activeProfile: { id: string; name?: string; config?: Record<string, any> };
  } {
    let profiles = raw?.profiles;
    let activeProfileId = raw?.activeProfileId;
    if (!Array.isArray(profiles) || !profiles.length) {
      // 旧格式迁移：根扁平字段即 default 方案配置
      // （同时剥离根级审计 meta，防止 lastModifiedBy/updatedAt 混入 config，
      //   否则会污染下游 TASK_CONFIG_SNAPSHOT_SCHEMA 的 .strict() 解析）
      const {
        profiles: _p,
        activeProfileId: _a,
        lastModifiedBy: _l,
        updatedAt: _u,
        ...flat
      } = raw || {};
      profiles = [{ id: 'default', name: '默认配置', config: flat }];
      activeProfileId = 'default';
    }
    const activeProfile =
      profiles.find((p) => p.id === activeProfileId) || profiles[0];
    return { profiles, activeProfileId: activeProfile.id, activeProfile };
  }

  /**
   * 合并 AI 配置（🆕 方案 B++，2026-09-04）：模型库与配置均为「独一份」——彻底无全局下发。
   * 全局文件仅提供系统凭证：figmaToken / apifoxToken / gitlabToken。
   * 模型库（models）与模型选择（binding / modelMode / 温度 / 并发等）全部来自用户级存储：
   *   - 用户保存过 → 自己的库 + 自己的选择完整生效；
   *   - 用户没保存过 → 空配置，生成链路应明确报「请先在配置面板添加模型并选择」，
   *     不做任何默认推导、不下发全局清单、不回退全局 legacy 字段。
   * userId 为空时同样返回仅含系统凭证的配置。
   * modelMode==='unified' 时将 unified* 补全为 vision/text 角色字段，兼容直接读取 role 字段的调用点（lite 等）。
   */
  async getMergedAiConfig(userId?: string): Promise<Record<string, any>> {
    const globalCfg = this.getAiConfig() || {};
    let userCfg: Record<string, any> = {};
    if (userId) {
      try {
        const u = await this.userAiConfigService.getUserConfig(userId);
        userCfg = u || {};
      } catch (e: any) {
        this.logger.warn(`[AiConfigService] 读取用户 AI 配置失败(${userId}): ${e.message}`);
        userCfg = {};
      }
    }
    const merged: Record<string, any> = {};
    for (const k of ['figmaToken', 'apifoxToken', 'gitlabToken']) {
      if (globalCfg[k] !== undefined) merged[k] = globalCfg[k];
    }
    Object.assign(merged, userCfg);
    if (merged.modelMode === 'unified') {
      // 统一模式：unified* 为唯一真相源，强制 vision*/text* 与之同源。
      // 修复「UI 显示 gpt-5.5、生成却走 kimi」类脏数据：无论文件里 role 字段是否被
      // 历史代码写成不同值，合并结果一律以 unified* 为准，杜绝三套字段漂移。
      for (const role of ['vision', 'text']) {
        merged[`${role}ApiKey`] = merged.unifiedApiKey;
        merged[`${role}BaseURL`] = merged.unifiedBaseURL;
        merged[`${role}Model`] = merged.unifiedModel;
        merged[`${role}ProviderType`] = merged.unifiedProviderType;
        merged[`${role}Temperature`] = merged.unifiedTemperature;
      }
    }
    // 🆕 降维：若配置为「模型库 + 槽位绑定」新结构，解析出完整 legacy 字段 + providers，
    // 保证下游 resolveVisionConfig/resolveTextConfig 零改动兼容（幂等，旧结构原样透传）。
    return resolveBindingToLegacy(merged);
  }

  /**
   * 返回当前用户的合并配置（全局 + 每用户），并迁移出 models/binding（供前端配置面板渲染模型库）。
   * userId 为空时退化为纯全局配置。读取/保存对称：面板打开读这里，保存写 saveUserConfig。
   */
  async getUserMergedConfig(userId?: string): Promise<Record<string, any>> {
    const merged = await this.getMergedAiConfig(userId);
    return migrateLegacyToModels(merged);
  }

  /** 保存当前编辑内容到 active 方案，并同步根扁平字段（保回退链路不回归） */
  saveCurrentProfile(input: Record<string, any>, operatorUserId?: string): Record<string, any> {
    try {
      const raw = this.readRawConfig();
      const { profiles, activeProfileId } = this.resolveProfiles(raw);
      const active = profiles.find((p) => p.id === activeProfileId) || profiles[0];
      const patch = this.normalizeConfigInput(input || {}, '保存当前方案');
      const merged = { ...(active.config || {}), ...patch };
      // 🆕 写时降维：新结构（models/binding）持久化前先解析出完整 legacy 字段 + providers，
      // 保证磁盘上的 config 永远具备完整 legacy 字段，任务快照重跑时下游也能正常解析。
      const mergedResolved = resolveBindingToLegacy(merged);
      // 统一模式：保存时以 unified* 为唯一真相源，强制 vision*/text* 同步
      if (mergedResolved.modelMode === 'unified') {
        for (const role of ['vision', 'text']) {
          mergedResolved[`${role}ApiKey`] = mergedResolved.unifiedApiKey;
          mergedResolved[`${role}BaseURL`] = mergedResolved.unifiedBaseURL;
          mergedResolved[`${role}Model`] = mergedResolved.unifiedModel;
          mergedResolved[`${role}ProviderType`] = mergedResolved.unifiedProviderType;
          mergedResolved[`${role}Temperature`] = mergedResolved.unifiedTemperature;
        }
      }
      const nextConfig = this.applyDefaults(mergedResolved);
      active.config = nextConfig;
      const root = {
        ...nextConfig,
        profiles,
        activeProfileId,
        lastModifiedBy: operatorUserId || 'unknown',
        updatedAt: new Date().toISOString(),
      };
      this.atomicWrite(root);
      const who = operatorUserId || 'unknown';
      const sig = `text=${nextConfig.textModel || '-'}|vision=${nextConfig.visionModel || '-'}|unified=${nextConfig.unifiedModel || '-'}|mode=${nextConfig.modelMode || '-'}`;
      this.logger.log(`[AiConfigService] 保存当前方案 by user=${who} at ${new Date().toISOString()} | ${sig}`);
      return this.getAiConfigWithProfiles();
    } catch (e: any) {
      this.logger.error(`[AiConfigService] 保存当前方案失败: ${e.message}`);
      throw e;
    }
  }

  /** 旧调用兼容：等同保存当前方案（save-current） */
  saveAiConfig(input: Record<string, any>, operatorUserId?: string): Record<string, any> {
    return this.saveCurrentProfile(input, operatorUserId);
  }

  /** 切换 active 方案（仅影响新任务） */
  applyProfile(profileId: string, operatorUserId?: string): Record<string, any> {
    if (!profileId) throw new BadRequestException('请指定要应用的方案 ID');
    const raw = this.readRawConfig();
    const { profiles } = this.resolveProfiles(raw);
    if (!profiles.find((p) => p.id === profileId)) {
      throw new BadRequestException(`方案不存在: ${profileId}`);
    }
    const root = {
      ...raw,
      activeProfileId: profileId,
      lastModifiedBy: operatorUserId || 'unknown',
      updatedAt: new Date().toISOString(),
    };
    this.atomicWrite(root);
    this.logger.log(`[AiConfigService] 已切换至方案: ${profileId} by user=${operatorUserId || 'unknown'} at ${new Date().toISOString()}`);
    return this.getAiConfigWithProfiles();
  }

  /** 新建方案（保存当前编辑内容为新方案，并设为 active） */
  createProfile(name: string, config: Record<string, any>, operatorUserId?: string): Record<string, any> {
    const raw = this.readRawConfig();
    const { profiles, activeProfileId } = this.resolveProfiles(raw);
    const id = `p_${Date.now()}`;
    const nextConfig = this.applyDefaults(
      resolveBindingToLegacy(this.normalizeConfigInput(config || {}, '创建方案')),
    );
    profiles.push({ id, name: name || '未命名方案', config: nextConfig });
    const root = {
      ...raw,
      profiles,
      activeProfileId: id,
      lastModifiedBy: operatorUserId || 'unknown',
      updatedAt: new Date().toISOString(),
    };
    this.atomicWrite(root);
    this.logger.log(`[AiConfigService] 已创建方案: ${id} (${name}) by user=${operatorUserId || 'unknown'} at ${new Date().toISOString()}`);
    return this.getAiConfigWithProfiles();
  }

  /** 更新指定方案的名称与配置（覆盖式） */
  updateProfile(
    profileId: string,
    name?: string,
    config?: Record<string, any>,
    operatorUserId?: string,
  ): Record<string, any> {
    if (!profileId) throw new BadRequestException('请指定要更新的方案 ID');
    const raw = this.readRawConfig();
    const { profiles, activeProfileId } = this.resolveProfiles(raw);
    const target = profiles.find((p) => p.id === profileId);
    if (!target) throw new BadRequestException(`方案不存在: ${profileId}`);
    if (name != null) target.name = name;
    if (config != null) {
      target.config = this.applyDefaults(
        resolveBindingToLegacy(this.normalizeConfigInput(config, '更新方案')),
      );
    }
    const root = {
      ...raw,
      profiles,
      activeProfileId,
      lastModifiedBy: operatorUserId || 'unknown',
      updatedAt: new Date().toISOString(),
    };
    this.atomicWrite(root);
    this.logger.log(`[AiConfigService] 已更新方案: ${profileId} by user=${operatorUserId || 'unknown'} at ${new Date().toISOString()}`);
    return this.getAiConfigWithProfiles();
  }

  /** 删除方案（default / 当前 active 不允许删除） */
  deleteProfile(profileId: string, operatorUserId?: string): Record<string, any> {
    if (!profileId) throw new BadRequestException('请指定要删除的方案 ID');
    if (profileId === 'default') {
      throw new BadRequestException('默认方案不可删除');
    }
    const raw = this.readRawConfig();
    const { profiles, activeProfileId } = this.resolveProfiles(raw);
    if (!profiles.find((p) => p.id === profileId)) {
      throw new BadRequestException(`方案不存在: ${profileId}`);
    }
    const nextProfiles = profiles.filter((p) => p.id !== profileId);
    const nextActive = activeProfileId === profileId ? 'default' : activeProfileId;
    const root = {
      ...raw,
      profiles: nextProfiles,
      activeProfileId: nextActive,
      lastModifiedBy: operatorUserId || 'unknown',
      updatedAt: new Date().toISOString(),
    };
    this.atomicWrite(root);
    this.logger.log(`[AiConfigService] 已删除方案: ${profileId} by user=${operatorUserId || 'unknown'} at ${new Date().toISOString()}`);
    return this.getAiConfigWithProfiles();
  }

  /**
   * 构建任务「创建时刻配置快照」—— 语义 = 任务创建时的参考/审计配置，**不是实际执行配置**。
   * 实际执行链路（executeGeneration）每次进入都会实时 getMergedAiConfig 重新合并，
   * 并以合并结果 resolveVisionConfig/resolveTextConfig 后冻结为 graph 的 vision/text cfg；
   * 因此重试/续跑/精修会自动吃到「当时最新保存的配置」。
   * 任务「真跑用了哪些模型」以 task.completionModels（agent-model 事件收集）为准，
   * configSnapshot 仅作展示兜底与旧任务回退（前端已优先 completionModels）。
   */
  buildTaskConfigSnapshot(input: Record<string, any> = {}): Record<string, any> {
    const existing = this.getAiConfig();
    const patch = this.normalizeTaskSnapshotInput(input || {}, '构建任务配置快照');
    // 🆕 降维：快照必须存具备完整 legacy 字段的结构，否则任务重跑时
    // resolveTextConfig(快照) 读不到 legacy 字段会解析失败（幂等，旧结构透传）。
    return resolveBindingToLegacy({
      ...this.applyDefaults({
        ...existing,
        ...patch,
      }),
      ...(patch.target ? { target: patch.target } : {}),
      ...(patch.panelType ? { panelType: patch.panelType } : {}),
    });
  }

  private readRawConfig(): Record<string, any> {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return this.normalizeConfigInput(parsed, '读取 AI 配置');
  }

  private normalizeConfigInput(input: Record<string, any>, scene: string): AiConfig {
    return this.safeParseSchema(AI_CONFIG_SCHEMA, input, scene);
  }

  private normalizeTaskSnapshotInput(input: Record<string, any>, scene: string) {
    return this.safeParseSchema(TASK_CONFIG_SNAPSHOT_SCHEMA, input, scene);
  }

  private safeParseSchema<T>(schema: z.ZodType<T>, input: Record<string, any>, scene: string): T {
    const result = schema.safeParse(input || {});
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`${scene}失败，配置字段不合法：${message}`);
    }
    return result.data;
  }

  private applyDefaults(config: Partial<AiConfig>): Record<string, any> {
    return {
      ...AI_CONFIG_DEFAULTS,
      ...config,
    };
  }

  private atomicWrite(config: Record<string, any>) {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tmpFile, CONFIG_FILE);
  }
}

// ==================== 模型库 ↔ legacy 字段转换（2026-08-25） ====================

/**
 * 降维（新 → 旧）：把 models[] + binding 解析成 legacy 字段（unified/text/vision 三组）+ providers[]。
 *
 * 下游 resolveVisionConfig / resolveTextConfig（ai-defaults.js）只认 legacy 字段（modelMode +
 * unified/text/vision 三组字段 + providers[]），本函数保证任何产出给下游的 config 都具备完整 legacy 字段，
 * 从而零改动兼容现有全部管线（Phase2 / Vue3 / Lite / v2 / 编排器 / 页面生成器 / Playground）。
 *
 * 行为：只「补充」legacy 字段与 providers，不删除 models/binding（供前端读回渲染模型库）。
 * 幂等：无 models 或 models 为空时原样返回（旧结构透传）。
 */
export function resolveBindingToLegacy<T extends Record<string, any>>(config: T): T {
  const cfg: Record<string, any> = { ...config };
  const models = Array.isArray(cfg.models) ? cfg.models : [];
  if (!models.length) return cfg as T;

  const binding = cfg.binding || {};
  // 边界保护：有模型但尚未绑定任何槽位（中间态）时不降维，避免误清 legacy 字段/ providers
  const hasAnyBinding = ['unified', 'text', 'vision'].some((s) => binding[s]?.primaryId);
  if (!hasAnyBinding) return cfg as T;

  const byId = new Map<string, Record<string, any>>();
  for (const m of models) if (m && m.id) byId.set(m.id, m);

  const toTemp = (v: unknown) =>
    v !== undefined && v !== null && v !== '' ? Number(v) : undefined;

  const applyPrimary = (slot: 'unified' | 'text' | 'vision') => {
    const b = cfg.binding?.[slot];
    if (!b?.primaryId) return;
    const m = byId.get(b.primaryId);
    if (!m) return;
    cfg[`${slot}ApiKey`] = m.apiKey ?? '';
    cfg[`${slot}BaseURL`] = m.baseURL ?? '';
    cfg[`${slot}Model`] = m.model ?? '';
    cfg[`${slot}ProviderType`] = m.providerType || 'auto';
    // 显式覆盖：主模型未填温度时清掉 legacy 残留，避免「UI 显示 A、生成走 B」类脏数据
    cfg[`${slot}Temperature`] = toTemp(m.temperature);
  };

  const buildPoolProviders = (slot: 'unified' | 'text' | 'vision', role: 'both' | 'text' | 'vision') => {
    const b = cfg.binding?.[slot];
    const ids = Array.isArray(b?.poolIds) ? b.poolIds : [];
    return ids
      .map((id: string) => byId.get(id))
      .filter((m): m is Record<string, any> => !!m)
      .map((m) => ({
        id: m.id,
        name: m.name,
        apiKey: m.apiKey,
        baseURL: m.baseURL,
        model: m.model,
        providerType: m.providerType || 'auto',
        role,
        ...(toTemp(m.temperature) !== undefined ? { temperature: toTemp(m.temperature) } : {}),
        ...(m.rpm !== undefined ? { rpm: Number(m.rpm) } : {}),
        ...(m.tpm !== undefined ? { tpm: Number(m.tpm) } : {}),
        ...(m.weight !== undefined ? { weight: Number(m.weight) } : {}),
      }));
  };

  if (cfg.modelMode === 'unified') {
    applyPrimary('unified');
    cfg.providers = buildPoolProviders('unified', 'both');
  } else {
    applyPrimary('text');
    applyPrimary('vision');
    cfg.providers = [
      ...buildPoolProviders('text', 'text'),
      ...buildPoolProviders('vision', 'vision'),
    ];
  }

  return cfg as T;
}

/**
 * 迁移（旧 → 新）：把 legacy 字段 + providers 转成 models[] + binding。
 * 供前端读取渲染模型库 UI 使用。确定性 id（legacy-* 前缀）保证幂等（同输入同输出）。
 * 已有 models 时原样返回。
 */
export function migrateLegacyToModels<T extends Record<string, any>>(config: T): T {
  const cfg: Record<string, any> = { ...config };
  if (Array.isArray(cfg.models) && cfg.models.length) return cfg as T;

  const models: Array<Record<string, any>> = [];
  const binding: Record<string, any> = {};

  const toEntry = (prefix: 'unified' | 'text' | 'vision', capability: 'both' | 'text' | 'vision') => {
    const temp = cfg[`${prefix}Temperature`];
    return {
      id: `legacy-${prefix}`,
      name: prefix === 'unified' ? '主模型' : prefix === 'text' ? '文本模型' : '视觉模型',
      apiKey: cfg[`${prefix}ApiKey`] ?? '',
      baseURL: cfg[`${prefix}BaseURL`] ?? '',
      model: cfg[`${prefix}Model`] ?? '',
      providerType: cfg[`${prefix}ProviderType`] || 'auto',
      capability,
      ...(temp !== undefined && temp !== null && temp !== '' ? { temperature: Number(temp) } : {}),
    };
  };

  const providerToEntry = (p: Record<string, any>) => {
    const role = p.role || 'both';
    return {
      id: p.id || `legacy-provider-${models.length}`,
      name: p.name,
      apiKey: p.apiKey ?? '',
      baseURL: p.baseURL ?? '',
      model: p.model ?? '',
      providerType: p.providerType || 'auto',
      capability: role === 'text' ? 'text' : role === 'vision' ? 'vision' : 'both',
      ...(p.temperature !== undefined ? { temperature: Number(p.temperature) } : {}),
      ...(p.rpm !== undefined ? { rpm: Number(p.rpm) } : {}),
      ...(p.tpm !== undefined ? { tpm: Number(p.tpm) } : {}),
      ...(p.weight !== undefined ? { weight: Number(p.weight) } : {}),
    };
  };

  const providers = Array.isArray(cfg.providers) ? cfg.providers : [];

  if (cfg.modelMode === 'unified') {
    const primary = toEntry('unified', 'both');
    models.push(primary);
    const poolIds: string[] = [];
    for (const p of providers) {
      const entry = providerToEntry(p);
      models.push(entry);
      poolIds.push(entry.id);
    }
    binding.unified = { primaryId: primary.id, poolIds };
  } else {
    const textPrimary = toEntry('text', 'text');
    const visionPrimary = toEntry('vision', 'vision');
    models.push(textPrimary, visionPrimary);
    // 🐛 2026-09-04 修复：迁移时不自动填充池子，避免用户误以为已选择
    // 旧逻辑会把所有 role 匹配的 provider 自动加入池子，导致用户没勾选却被后端自动添加
    // 新逻辑：池子默认为空，只包含 primary 模型（如果有的话）
    const textPool: string[] = [];
    const visionPool: string[] = [];
    for (const p of providers) {
      const role = p.role || 'both';
      const entry = providerToEntry(p);
      // 去重：同一条 provider 只进一次模型库（role=both 会同时进两个池，但条目唯一）
      if (!models.some((m) => m.id === entry.id)) models.push(entry);
      // 不自动加入池子，让用户在前端显式选择
    }
    binding.text = { primaryId: textPrimary.id, poolIds: textPool };
    binding.vision = { primaryId: visionPrimary.id, poolIds: visionPool };
  }

  cfg.models = models;
  cfg.binding = binding;
  return cfg as T;
}
