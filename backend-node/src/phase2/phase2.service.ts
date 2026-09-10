import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { TokenTrackerService } from '../token-usage/token-tracker.service';
import { GeneratePhase2Dto } from './dto/generate-phase2.dto';
import { DocAnalyzerService } from './doc/doc-analyzer.service';
import { UiCacheService } from './ui-cache.service';
import { join, extname } from 'path';
import { writeFile, mkdir, cp, readFile, readdir } from 'fs/promises';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { customComponentsDir, vue3ComponentsDir, tempComponentsDir, workspaceRoot, backendRoot } from '../config/backend-root';
import { AiConfigService } from '../config/config.service';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { QuotaService } from '../quota/quota.service';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
const { ZipArchive } = require('archiver');
import { createReadStream } from 'fs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { sanitizeCssContent, aggressiveCleanCss } from '../ai-engine/utils/css-sanitizer.js';
import { humanizeGenerationError } from '../ai-engine/utils/error-humanizer.js';
import { resolvePrivateGroupId } from '../common/group-resolver';
import { packageEntryFilter } from '../common/utils/package-filter';
import { validateVueSfcDirectory } from '../ai-engine/utils/sfc-syntax-validation.js';
import { resolveComponentDirStrict } from '../ai-engine/utils/component-resolver.js';
// P4（增量修改）：把 refineType 翻译成 refiner 的 _reviseTarget，避免精修范围被静默放大
import { resolveRefineTarget } from './refine-target.js';
// 动态导入 ESM 模块（workspace-preview-publisher.js 依赖 ESM 的 logger）
const loadPreviewPublisher = () => import('../ai-engine/utils/workspace-preview-publisher.js');
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { Types } from 'mongoose';

@Injectable()
export class Phase2Service {
  private readonly logger = new Logger(Phase2Service.name);

  /**
   * figma-preview 预览图内存缓存：key = `${fileKey}:${apiNodeId}:${scale}`，
   * 命中时免调 Figma（getNode/exportImage/下载全跳过），配合 temp-preview-images/ 磁盘 TTL 清理。
   * 重启即清空（进程内存态），磁盘残留文件由既有 TTL 清理逻辑回收，无冲突。
   */
  private readonly _previewCache = new Map<
    string,
    { previewToken: string; nodeName: string; width: number; height: number; cachedAt: number }
  >();

  /**
   * 🛡️ 预览缓存磁盘索引（2026-09-03）：`_previewCache` 是进程内存态，后端每次重启即清空，
   * 而磁盘上的预览图（temp-preview-images/*.png，TTL 24h）还在——重启后首个 figma-preview
   * 请求缓存必未命中，被迫重新走 Figma API（exportImage + 下载，3~17s），用户体感「突然很慢」。
   * 今日后端为修管线 bug 重启 5 次，每次重启都触发一次慢请求。故把 key→token 映射持久化到
   * 磁盘 JSON 索引，启动时恢复，重启后仍能秒回命中未过期的预览图。
   */
  private readonly _previewCacheDir = join(backendRoot, 'temp-preview-images');
  private readonly _previewCacheIndexFile = join(backendRoot, 'temp-preview-images', '_cache-index.json');

  /** 启动时从磁盘索引恢复内存缓存（同步，constructor 内调用；磁盘文件缺失/过期自动跳过） */
  private _loadPreviewCacheFromDisk(): void {
    try {
      if (!existsSync(this._previewCacheIndexFile)) return;
      const raw = readFileSync(this._previewCacheIndexFile, 'utf-8');
      const idx = JSON.parse(raw || '{}') as Record<string, any>;
      if (!idx || typeof idx !== 'object') return;
      const ttlMs =
        Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
      const now = Date.now();
      let restored = 0;
      for (const [key, v] of Object.entries(idx)) {
        if (!v || typeof v !== 'object' || !v.previewToken) continue;
        // 过滤：磁盘图已不存在 / 已过 TTL
        if (!existsSync(join(this._previewCacheDir, `${v.previewToken}.png`))) continue;
        if (now - (Number(v.cachedAt) || 0) > ttlMs) continue;
        this._previewCache.set(key, {
          previewToken: v.previewToken,
          nodeName: v.nodeName || 'Unknown',
          width: Number(v.width) || 0,
          height: Number(v.height) || 0,
          cachedAt: Number(v.cachedAt) || now,
        });
        restored++;
      }
      if (restored > 0) {
        this.logger.log(`figma-preview 磁盘索引恢复: ${restored} 个缓存条目`);
      }
    } catch (e) {
      // 索引损坏/缺失不影响主流程，下次请求重新走 Figma 即可
      this.logger.warn(`figma-preview 磁盘索引加载失败（非阻断）: ${(e as Error).message}`);
    }
  }

  /** 把内存缓存映射持久化到磁盘索引（同步，写失败不阻断主流程） */
  private _persistPreviewCache(): void {
    try {
      mkdirSync(this._previewCacheDir, { recursive: true });
      const idx: Record<string, unknown> = {};
      for (const [key, v] of this._previewCache.entries()) {
        idx[key] = {
          previewToken: v.previewToken,
          nodeName: v.nodeName,
          width: v.width,
          height: v.height,
          cachedAt: v.cachedAt,
        };
      }
      writeFileSync(this._previewCacheIndexFile, JSON.stringify(idx), 'utf-8');
    } catch (e) {
      this.logger.warn(`figma-preview 磁盘索引持久化失败（非阻断）: ${(e as Error).message}`);
    }
  }

  /** 同时推 SSE 日志到前端（TaskDetail 日志 Tab） */
  private sendSseLog(sessionId: string, level: string, message: string) {
    try {
      this.progressService.sendLog(sessionId, level, message, { logger: 'Phase2Service' });
    } catch {
      // SSE 推送失败不影响主流程
    }
  }

  constructor(
    private readonly tasksService: TasksService,
    private readonly taskCodeSnapshotService: TaskCodeSnapshotService,
    private readonly progressService: ProgressService,
    private readonly componentService: ComponentService,
    private readonly tokenTrackerService: TokenTrackerService,
    private readonly aiConfigService: AiConfigService,
    private readonly docAnalyzerService: DocAnalyzerService,
    private readonly uiCacheService: UiCacheService,
    private readonly quotaService: QuotaService,
    private readonly userAiConfigService: UserAiConfigService,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {
    // 🆕 注册全局实例引用：供 TasksService.recoverTask 断点续跑时动态获取（避免循环依赖）
    (global as any).__phase2ServiceInstance = this;
    // 🛡️ 恢复预览缓存磁盘索引（重启后秒回命中，不再冷调 Figma）
    this._loadPreviewCacheFromDisk();
  }

  /**
   * 合并 AI 配置。
   * 🔧 根治（2026-08-17）：后端配置是真相源。此前「请求 config 优先」会让前端 localStorage
   * （mc_generator_config）里陈旧的 visionModel（如旧的 glm-5V-Turbo）覆盖后端已保存的正确配置
   * （ai-config.json 的 qwen3.7-plus），导致 max 任务视觉模型「改不动」。
   * 现改为后端 getMergedAiConfig（globalCfg ai-config.json + userCfg user_ai_configs 合并，
   * userCfg 优先，unified 模式已归一化）作为真相源，前端 dto.config 仅兜底后端缺失的请求级字段。
   */
  private async buildMergedAiConfig(
    config: any,
    userId?: string,
  ): Promise<Record<string, any>> {
    const backendCfg = await this.aiConfigService.getMergedAiConfig(userId);
    return {
      ...config,
      ...backendCfg,
    };
  }

  async startGeneration(
    sessionId: string,
    dto: GeneratePhase2Dto,
    groupId: string,
    userId?: string,
  ) {
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Vue3 一致）
    groupId = await resolvePrivateGroupId(groupId, userId, this.groupMemberModel);

    // 🆕 设置日志上下文 - 使后续所有日志推送到前端
    const { createLogger } = await import('../ai-engine/logger/index.js');
    const { Logger: CustomLogger } =
      await import('../ai-engine/logger/logger.js');
    CustomLogger.setSessionContext(sessionId, this.progressService);

    const {
      componentName,
      fileKey,
      nodeId,
      componentId,
      config = {},
      panelType,
      target = 'microcode',  // 🆕 C3: 管线目标类型
      requirementDoc,        // 🆕 S9: 需求文档（可选）
      docAnalysis,           // 🆕 S9: 预分析文档产物（可选）
      previewToken,          // 🆕 预览图复用 token
      reuseCache,            // 🆕 续跑复用缓存（true 才复用全局缓存，false=全新重新生成）
    } = dto;

    // 🐛 防御：phase2 是 Figma 完整生成管线，必须携带有效 fileKey/nodeId。
    // 此前排队/恢复执行时 lite 任务（截图/HTML 来源）被误路由到此，用空 fileKey 调 Figma API 直接 404，
    // 且错误信息晦涩（"Figma 数据获取失败"）。这里明确拒绝，便于定位路由 bug。
    if (!fileKey || !nodeId) {
      throw new Error(
        `Phase2 生成缺少 fileKey/nodeId（fileKey=${JSON.stringify(fileKey)}, nodeId=${JSON.stringify(nodeId)}），` +
        `疑似 lite 任务被错误路由到 max 管线。请检查任务来源与管线路由。`,
      );
    }

    // 如果没有提供componentName，使用sessionId作为组件名称
    const finalComponentName = componentName || sessionId;

    // 生成输出路径：temp-components/{groupId}/{componentId或sessionId}-{componentName}/
    // 如果componentName就是sessionId，则不添加后缀，避免重复
    // temp 目录必须以业务组件号 sessionId 开头，重启恢复才能精确关联任务产物。
    // DTO componentId 仅作为上游兼容字段，不再决定最终组件目录号。
    const folderName =
      componentName && componentName !== sessionId
        ? `${sessionId}-${finalComponentName}`
        : sessionId;
    const tempRoot = join(
      tempComponentsDir,
      groupId,
      folderName,
    );
    const outputPath = config.outputPath || tempRoot;
    const userAiCfg = userId
      ? await this.userAiConfigService.getUserConfig(userId)
      : null;
    const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
      ...(userAiCfg || {}),
      ...config,
      outputPath,
      target,
      panelType,
    });

    // 创建任务记录
    this.tasksService.createTask(sessionId, {
      configSnapshot,
      componentId: sessionId,
      groupId,
      componentName: finalComponentName,
      nodeId,
      fileKey,
      target,
      outputPath,
      checkpointStatus: 'none',
      panelKey: panelType,
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });
    this.sendSseLog(sessionId, 'info', `任务已创建: ${finalComponentName}`);

    // 🆕 预览图复用：如果有 previewToken，复制到输出目录
    if (previewToken) {
      const { copyFile, mkdir } = await import('fs/promises');
      const cacheDir = join(backendRoot, 'temp-preview-images');
      const cachedPath = join(cacheDir, `${previewToken}.png`);
      if (existsSync(cachedPath)) {
        const previewDir = join(outputPath, 'resources', 'images');
        await mkdir(previewDir, { recursive: true });
        await copyFile(cachedPath, join(previewDir, 'mc-preview.png'));
        this.sendSseLog(sessionId, 'info', `Preview image reused: ${previewToken}`);
      } else {
        this.sendSseLog(sessionId, 'warn', `Preview token not found in cache: ${previewToken}`);
      }
    }

    // 🆕 S3 全局缓存：按 fileKey+nodeId 查共享缓存。
    // 语义划分（用户规则 2026-08-27）：
    //   - reuseCache=true  = 续跑：复用已有 figma/visual 缓存，跳过最贵的 Figma API + Vision，只重跑代码生成
    //   - reuseCache=false = 重新生成：全新，忽略缓存，重新拉 Figma API + 重新 Vision 分析
    let sharedUiCache: Record<string, any> | undefined;
    if (reuseCache) {
      try {
        const { loadSharedCache } = await import('../ai-engine/utils/shared-cache.js');
        const shared = loadSharedCache(outputPath, fileKey, nodeId);
        if (shared && (shared.figmaNodeData || shared.previewAnalysis)) {
          sharedUiCache = {
            figmaNodeData: shared.figmaNodeData || undefined,
            previewAnalysis: shared.previewAnalysis || undefined,
            resourceDomMapping: shared.resourceDomMapping || undefined,
          };
          this.sendSseLog(
            sessionId,
            'info',
            `🗃️ 续跑命中全局缓存（同源设计稿），跳过 Figma 拉取${shared.previewAnalysis ? '与视觉分析' : ''}`,
          );
        } else {
          this.sendSseLog(sessionId, 'info', '🗃️ 续跑未命中缓存，按全新生成');
        }
      } catch { /* 全局缓存读取失败不阻断 */ }
    }

    // 异步执行生成任务
    // 🔧 并发日志串台修复：用 runInSessionContext 包裹整个异步生成链路（AsyncLocalStorage），
    // 使 graph 模块级 logger 的日志正确关联到本任务 sessionId（而非被并发任务覆盖的全局变量）。
    CustomLogger.runInSessionContext(sessionId, this.progressService, () => {
      this.executeGeneration(sessionId, {
        componentName: finalComponentName,
        fileKey,
        nodeId,
        outputPath,
        config,
        groupId,
        userId,
        panelType,
        target,  // 🆕 C3: 管线目标类型
        requirementDoc,  // 🆕 S9: 需求文档透传
        docAnalysis,     // 🆕 S9: 预分析产物透传
        uiCache: sharedUiCache,  // 🆕 S3: 全局缓存短路（figma/visual）
      }).catch((error) => {
        this.logger.error(
          `Phase 1 generation failed: ${error.message}`,
          error.stack,
        );
        this.progressService.sendError(sessionId, {
          message: error.message,
          stack: error.stack,
        });
      });
    });
  }

  /**
   * 🆕 S15: 路径B — 存量组件补文档再生成
   * 流程：UI 缓存命中检测 → 文档分析（或复用预分析）→ 带缓存重跑管线（figma/visual 短路）
   * 输出到新目录（{componentId}-doc-regen），旧版保留用于新旧并排对比
   */
  async regenerateWithDoc(
    sessionId: string,
    params: {
      componentId: string;
      groupId: string;
      requirementDoc: string;
      docAnalysis?: Record<string, any>;
      config: any;
      userId?: string;
      panelType?: string;
    },
  ) {
    const { componentId, requirementDoc, config, userId, panelType } = params;
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Lite/Vue3 一致）
    const effectiveGroupId = await resolvePrivateGroupId(params.groupId, userId, this.groupMemberModel);

    // 1. 定位组件目录（backend workspace 优先，frontend workspace 兜底）
    // polyrepo: 仅从 backend 自身 workspace 查找，不再跨仓库引用 frontend
    const candidates = [
      join(customComponentsDir, componentId),
    ];
    const componentDir = candidates.find((p) => existsSync(p));
    if (!componentDir) {
      throw new Error(`组件目录不存在: ${componentId}`);
    }

    // 2. UI 缓存命中检测（路径B 前提 — 未命中提示完整重生成）
    //    🔧 修复：先从缓存 meta 读取 fileKey/nodeId 再传入 check()，做一致性校验
    //    （此前传空对象会跳过一致性检查，导致 3 个月前的旧缓存被当作新鲜数据）
    let expectedMeta: { fileKey?: string; nodeId?: string } = {};
    try {
      const cacheMetaRaw = require('fs').readFileSync(
        join(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'),
        'utf-8',
      );
      const cacheMetaParsed = JSON.parse(cacheMetaRaw);
      expectedMeta = {
        fileKey: cacheMetaParsed.fileKey || undefined,
        nodeId: cacheMetaParsed.nodeId || undefined,
      };
    } catch {
      // meta 读取失败不阻断（check() 内部仍有 TTL 兜底）
    }
    const cacheHit = this.uiCacheService.check(componentDir, expectedMeta);
    if (!cacheHit.hit) {
      throw new Error(
        `UI 缓存未命中（${cacheHit.staleReason}）。该组件无法走快速路径，请使用完整重生成。`,
      );
    }
    this.logger.log(`🗃️ 路径B UI 缓存命中: ${componentId}`);

    // 3. 文档分析（预分析优先，否则调 analyze-doc）
    let docAnalysis = params.docAnalysis || undefined;
    if (!docAnalysis) {
      const analyzed = await this.docAnalyzerService.analyzeDocument({
        document: requirementDoc,
        source: 'paste',
        aiConfig: config?.textApiKey
          ? { textApiKey: config.textApiKey, textBaseURL: config.textBaseURL, textModel: config.textModel }
          : undefined,
      });
      docAnalysis = analyzed.analysis;
    }

    // 4. 从缓存的 Figma 数据提取 fileKey/nodeId（用于任务记录与血缘）
    const figmaNodeData = cacheHit.figmaNodeData || {};
    const cacheRaw = (() => {
      try {
        return require('fs').readFileSync(
          join(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'),
          'utf-8',
        );
      } catch {
        return '{}';
      }
    })();
    const cacheMeta = JSON.parse(cacheRaw);
    const fileKey = cacheMeta.fileKey || '';
    const nodeId = cacheMeta.nodeId || '';

    // 5. 新输出目录（旧版保留，供新旧并排对比）
    const outputPath = join(
      tempComponentsDir,
      effectiveGroupId,
      `${sessionId}-${componentId}-doc-regen`,
    );

    // 6. 任务记录
    const userAiCfg = userId
      ? await this.userAiConfigService.getUserConfig(userId)
      : null;
    const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
      ...(userAiCfg || {}),
      ...config,
      outputPath,
      target: 'microcode',
      panelType,
    });

    this.tasksService.createTask(sessionId, {
      configSnapshot,
      componentId: sessionId,
      groupId: effectiveGroupId,
      componentName: `${componentId}(文档纠偏)`,
      nodeId,
      fileKey,
      target: 'microcode',
      outputPath,
      checkpointStatus: 'none',
      panelKey: panelType,
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    // 7. 执行生成（带 UI 缓存 + 文档分析产物）
    this.executeGeneration(sessionId, {
      componentName: componentId,
      fileKey,
      nodeId,
      outputPath,
      config,
      groupId: effectiveGroupId,
      userId,
      panelType,
      target: 'microcode',
      requirementDoc,
      docAnalysis,
      uiCache: {
        figmaNodeData: cacheHit.figmaNodeData,
        previewAnalysis: cacheHit.previewAnalysis,
        resourceDomMapping: cacheHit.resourceDomMapping,
      },
    }).catch((error) => {
      this.logger.error(`路径B 再生成失败: ${error.message}`, error.stack);
      this.progressService.sendError(sessionId, {
        message: error.message,
        stack: error.stack,
      });
    });
  }

  private async executeGeneration(
    sessionId: string,
    params: {
      componentName: string;
      fileKey: string;
      nodeId: string;
      outputPath: string;
      config: any;
      groupId: string;
      userId?: string;
      panelType?: string;
      target?: string;
      requirementDoc?: string;   // 🆕 S9
      docAnalysis?: Record<string, any>;  // 🆕 S9
      uiCache?: Record<string, any>;      // 🆕 S15: UI 缓存（路径B 短路 figma/visual）
      resumeData?: Record<string, any>;   // 🆕 断点续跑数据（跳过已完成分析阶段）
      failureGuidance?: string;           // 🛡️ P1-3：任务级重试注入的上轮失败指导
    },
  ) {
    // 声明变量以便在finally块中使用
    let outputPath: string | undefined;
    let componentName: string | undefined;
    let genResult: any;
    let genError: any;
    let genTarget: string | undefined;
    //  实际完成模型（vision/text 各实际用了哪个），供任务详情页展示
    let visionModelUsed: string | null = null;
    let textModelUsed: string | null = null;
    // 🆕 收集任务执行过程中实际使用的模型（通过 provider 池动态选择）
    const actualVisionModels = new Set<string>();
    const actualTextModels = new Set<string>();
    let candidateRevision: string | null = null;
    let candidateValidation: any = {
      semantics: 'pending',
      sfc: 'pending',
      less: 'pending',
      runtime: 'pending',
    };

    // 🆕 顶层 AbortController：删除/取消任务时可真正中断生成管线（注入 state.signal）
    const controller = new AbortController();
    this.tasksService.registerAbortController(sessionId, controller);

    try {
      const {
        componentName: name,
        fileKey,
        nodeId,
        outputPath: path,
        config,
        panelType,
        target,
        requirementDoc,   // 🆕 S9
        docAnalysis,      // 🆕 S9
        uiCache,          // 🆕 S15
        resumeData,       // 🆕 断点续跑数据
      } = params;
      outputPath = path;
      componentName = name;
      genTarget = target || 'microcode';

      // 🆕 S1 自动断点复用：未显式传 uiCache/resumeData 时，检测 outputPath 下 checkpoint 自动复用。
      // 这样「重试」只要复用同一 outputPath（同 fileKey+nodeId），figma/visual/analysis 缓存就能短路，
      // 换模型只重跑失败阶段，无需从头拉 Figma / 下载资源 / 重跑已完成的视觉分析。
      let effectiveUiCache = uiCache;
      let effectiveResumeData = resumeData;
      if (!effectiveUiCache && !effectiveResumeData && outputPath) {
        try {
          const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
          const cp = loadCheckpoint(outputPath);
          if (cp.stage !== 'none' && cp.stage !== 'code-generated') {
            effectiveUiCache = cp.uiCache || undefined;
            effectiveResumeData = cp.resumeData || undefined;
            this.logger.log(`🔄 自动断点复用: ${outputPath} (stage=${cp.stage})`);
          }
        } catch (err: any) {
          this.logger.warn(`自动断点检测失败（忽略）: ${err.message}`);
        }
      }

      // 🆕 C3: 按 target 路由到对应管线图（2026-07-24）
      // microcode → mc-component-graph-phase2.js（微码组件，component.js 包装）
      // vue3      → mc-component-graph-vue3.js  （标准 SFC，面板头/背景真实 DOM）
      const graphTarget = params.target || 'microcode';

      let runGeneration: Function;
      if (graphTarget === 'vue3') {
        const vue3Module =
          await import('../ai-engine/graphs/mc-component-graph-vue3.js');
        runGeneration = vue3Module.runVue3Generation;
      } else {
        const phase2Module =
          await import('../ai-engine/graphs/mc-component-graph-phase2.js');
        runGeneration = phase2Module.runPhase2Generation;
      }

      // 动态导入配置工具
      const aiDefaultsModule =
        await import('../ai-engine/utils/ai-defaults.js');
      const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
      // 视觉能力实测结论（不依赖模型名白名单）
      const { resolveVisionCapability } =
        await import('../ai-engine/utils/model-config.js');

      // 🆕 视觉/文本配置：请求 config > 按用户存 DB 的配置 > 全局 ai-config.json
      // 🔧 修复：此前完全没读按用户存 DB 的配置，导致用户配置的统一 AI 在生成时被忽略
      const mergedAiConfig = await this.buildMergedAiConfig(config, params.userId);

      // 🔥 方案 B：Phase2 入口从 provider pool 取当前最优 provider，覆盖静态配置
      // 效果：主 provider 熔断/超限时，自动降级到备用 provider，无需等任务失败
      try {
        const { getProviderPool } = await import(
          '../ai-engine/utils/provider-pool.js'
        );
        const pool = getProviderPool();
        if (pool.configured) {
          const textProvider = pool.pick('text');
          const visionProvider = pool.pick('vision');

          if (textProvider) {
            // 用 pool 当前最优 provider 覆盖 mergedAiConfig 的 text 字段
            mergedAiConfig.textApiKey = textProvider.apiKey;
            mergedAiConfig.textBaseURL = textProvider.baseURL;
            mergedAiConfig.textModel = textProvider.model;
            mergedAiConfig.textProviderId = textProvider.id;
            this.logger.log(
              `[Phase2] 文本任务使用 provider pool: ${textProvider.id} (${textProvider.model})`
            );
          }

          if (visionProvider) {
            // 用 pool 当前最优 provider 覆盖 mergedAiConfig 的 vision 字段
            mergedAiConfig.visionApiKey = visionProvider.apiKey;
            mergedAiConfig.visionBaseURL = visionProvider.baseURL;
            mergedAiConfig.visionModel = visionProvider.model;
            mergedAiConfig.visionProviderId = visionProvider.id;
            this.logger.log(
              `[Phase2] 视觉任务使用 provider pool: ${visionProvider.id} (${visionProvider.model})`
            );
          }
        }
      } catch (err: any) {
        // pool 导入失败或未配置，保持原有逻辑（向后兼容）
        this.logger.warn(
          `[Phase2] provider pool 未启用，使用静态配置: ${err.message}`
        );
      }

      console.log('[Phase2] 原始 config:', JSON.stringify(config).substring(0, 400));
      const visionCfg = resolveVisionConfig(mergedAiConfig);
      const textCfg = resolveTextConfig(mergedAiConfig);
      visionModelUsed = visionCfg?.model || null;
      textModelUsed = textCfg?.model || null;
      console.log('[Phase2] visionCfg:', JSON.stringify(visionCfg));
      console.log('[Phase2] textCfg:', JSON.stringify(textCfg));

      // 🛡️ 生成闸门：视觉能力硬校验（2026-09-10）
      // 组件生成的第一步就是「看截图 / Figma 图」做视觉解析，模型若不具备视觉能力，
      // 请求仍会成功返回，但模型根本没看到图 —— 产物与截图完全无关且不报任何错，
      // 用户无从判断是模型问题。此处在真正发起生成前拦下并给出明确原因。
      // 判定依据为实测结论（resolveVisionCapability），不依赖模型名白名单：
      //   - false  → 实测不支持视觉，直接失败
      //   - null   → 从未检测过，要求先到设置页检测（fail-closed，不冒险生成）
      const visionModelName = String(visionCfg?.model || '').trim();
      if (!visionModelName) {
        throw new Error('未配置视觉模型，无法进行组件生成（截图 / Figma 识别依赖图像理解），请到「设置 - 模型配置」中选择支持视觉的模型并保存');
      }
      const visionCap = resolveVisionCapability(visionModelName);
      if (visionCap.vision === false) {
        throw new Error(
          `模型「${visionModelName}」不支持视觉输入，无法进行组件生成。` +
            `组件生成需要先识别截图 / Figma 设计图，请到「设置 - 模型配置」更换为支持视觉的模型（并点击「检测」确认）后重试`
        );
      }
      if (visionCap.vision !== true) {
        throw new Error(
          `模型「${visionModelName}」的视觉能力尚未检测，无法确认其能否识别设计图。` +
            `请到「设置 - 模型配置」点击「检测」完成能力识别后重试（未检测不支持直接生成，避免产出与设计图无关的结果）`
        );
      }

      const effectiveFigmaToken = this.resolveFigmaToken(config?.figmaToken);

      genResult = await runGeneration({
        componentName,
        // 🔧 componentId 传递给 L0-B CODE-003 做 class 前缀检查（此前缺失导致空 componentId 全报违规）
        componentId: String(componentName || '').replace(/^c-/, ''),
        fileKey,
        nodeId,
        outputPath,
        panelType: panelType || 'default-panel',
        target, // 🆕 生成目标：vue3 | microcode
        figmaToken: effectiveFigmaToken,
        // 🔧 复用 535/536 行已解析的 visionCfg/textCfg，避免重复调用 resolveVisionConfig/resolveTextConfig
        // 触发 pool.setProviders（每次打 2 条「供应商池已更新」日志，且重复覆盖池配置）。
        visionAIConfig: visionCfg,
        textAIConfig: textCfg,
        aiConfig: {
          // 向后兼容
          apiKey: config.aiApiKey || process.env.ANTHROPIC_API_KEY,
          baseURL: config.aiBaseURL || process.env.ANTHROPIC_BASE_URL,
          model: config.aiModel || process.env.ANTHROPIC_MODEL,
        },
        sessionId, // 🆕 传递 sessionId 用于 Token 追踪关联
        groupId: params.groupId,
        signal: controller.signal,
        skipNodes: Array.isArray(config.skipNodes) ? config.skipNodes : undefined, // 🆕 变体管线：跳过节点
        requirementDoc,   // 🆕 S9: 需求文档 → 图 init 节点文档子管线
        docAnalysis,      // 🆕 S9: 预分析产物（前端已分析则免重复）
        uiCache: effectiveUiCache,          // 🆕 S15: UI 缓存 → figma/visual 节点短路（路径B + 自动断点复用）
        _resumeData: effectiveResumeData || null,   // 🆕 断点续跑：跳过已完成的分析阶段
        failureGuidance: params.failureGuidance,    // 🛡️ P1-3：上轮失败指导 → 工程师首轮 prompt
        onProgress: (data) => {
          // 生成链以 `{ fileLifecycle: {...} }` 标记文件级生命周期事件，
          // 走独立的瞬态广播通道（不持久化、不进入 progress 历史）。
          if (data && data.fileLifecycle) {
            this.progressService.sendFileLifecycle(sessionId, data.fileLifecycle);
            return;
          }
          // 🏷️ 组件中文名（早提取，Figma 根节点名）→ 回写任务实体 displayName，
          // 监控浮窗/任务中心在任务启动 ~15s 内即可显示中文名（后续 declare 权威值会覆盖）
          if (data?.displayName && typeof data.displayName === 'string') {
            const t = this.tasksService.getTask(sessionId);
            if (t && t.displayName !== data.displayName) {
              t.displayName = data.displayName;
              this.logger.log(`[displayName] 早提取中文名: ${data.displayName} (${sessionId})`);
            }
          }
          // 🆕 收集实际使用的模型（按 vision/text agent 分槽，provider 池动态选择）
          if (data?.meta?.type === 'agent-model' && data?.meta?.model) {
            const agentName = data.meta.agent || '';
            if (agentName === 'vision-agent') {
              actualVisionModels.add(data.meta.model);
            } else {
              actualTextModels.add(data.meta.model);
            }
          }
          // 通过SSE实时推送进度（同时保存到任务状态）
          this.progressService.sendProgress(sessionId, data);
        },
        onFilesReady: async (data) => {
          // 🔧 补齐磁盘图片资源：microcode/vue3 生成角色的 files map 只含源码与标准文件，
          // 不含 figma-connector 已下载到 outputPath/resources/images 的二进制图。
          // 若不并入，候选快照会缺图，预览请求该图时后端抛 500「快照文件不存在」。
          // 与 Lite 路径 collectSnapshotFiles 扫盘语义对齐：凡磁盘存在、内存 map 未覆盖的
          // 图片资源，都并入快照，确保「冻结副本 == 磁盘产物」。
          const files: Record<string, string | Buffer> = { ...data.files };
          if (outputPath) {
            // 🛡️ 通用兜底：把磁盘上已写入的所有「工程师产物的标准伴随文件」并入快照。
            // 根因：runChunk 级 onFilesReady 触发在标准文件（index.less / dark.less / light.less /
            // component.js / declare.js）落盘之前，导致 chunk 级快照天然漏这些；且工程师最终 onFilesReady
            // 不一定是最新指针（被 chunk 级覆盖）。此处统一从磁盘读，保证「快照 = 磁盘产物」。
            const mergeFromDisk = (absDir: string, relPrefix: string) => {
              // 🛡️ 二进制扩展名：禁止 utf-8 读取（2026-08-25 修复）。
              // 根因：PNG magic 首字节 0x89 是非法 UTF-8 起始字节，utf-8 读取会被转成
              // U+FFFD 替换字符（EF BF BD），快照副本全损（mc-max-1787638371532 实锤：
              // 原文件 903B `89 50 4E 47` → 快照 1569B `EF BF BD 50 4E 47` → 预览裂图）。
              // 与 Lite 路径 collectSnapshotFiles 对齐（lite.service.ts 无编码读 = Buffer）。
              const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.pdf'])
              if (!existsSync(absDir)) return
              for (const name of readdirSync(absDir)) {
                const abs = join(absDir, name)
                const st = statSync(abs)
                if (st.isFile()) {
                  const rel = `${relPrefix}/${name}`
                  if (!(rel in files)) {
                    files[rel] = BINARY_EXTS.has(extname(name).toLowerCase())
                      ? readFileSync(abs)
                      : readFileSync(abs, 'utf-8')
                  }
                } else if (st.isDirectory()) {
                  mergeFromDisk(abs, `${relPrefix}/${name}`)
                }
              }
            }
            mergeFromDisk(join(outputPath, 'resources', 'images'), 'resources/images')
            mergeFromDisk(join(outputPath, 'resources', 'styles'), 'resources/styles')
            // 尺寸元数据可能在 onFilesReady 回调之后才由收尾逻辑写盘。
            // 这里从 Figma 缓存确定性补入快照，避免 snapshot 与 workspace 文件组不一致。
            if (!('_figma-size.json' in files)) {
              try {
                const cachePath = join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json')
                if (existsSync(cachePath)) {
                  const cached = JSON.parse(readFileSync(cachePath, 'utf-8'))
                  const bbox = (cached?.document || cached)?.absoluteBoundingBox
                  if (bbox?.width && bbox?.height) {
                    files['_figma-size.json'] = JSON.stringify(
                      { document: { absoluteBoundingBox: { width: bbox.width, height: bbox.height } } },
                      null,
                      2,
                    )
                  }
                }
              } catch (sizeError: any) {
                this.logger.warn(`[Phase2] 快照补齐 Figma 尺寸失败: ${sizeError.message}`)
              }
            }
            // 根级标准文件：入口、声明、尺寸和任务元数据。
            // 这些文件必须与源码一起进入候选快照，否则 snapshot 预览与 workspace 预览不一致。
            for (const top of ['component.js', 'declare.js', 'declare.json', '_figma-size.json', 'component-meta.json']) {
              const abs = join(outputPath, top)
              if (existsSync(abs) && !(top in files)) files[top] = readFileSync(abs, 'utf-8')
            }
          }
          // 仅接收生成角色确认完整的 files map；SSE 只通知 revision，不传源码。
          const manifest = this.taskCodeSnapshotService.createCandidate({
            sessionId,
            componentId: sessionId,
            groupId: params.groupId,
            target: graphTarget === 'vue3' ? 'vue3' : 'microcode',
            stage: data.stage,
            files,
          });
          candidateRevision = manifest.revision;
          candidateValidation = {
            semantics: 'passed',
            sfc: 'passed',
            less: 'passed',
            runtime: 'pending',
          };
          this.taskCodeSnapshotService.markValidating(
            sessionId,
            manifest.revision,
            candidateValidation,
          );
          this.progressService.sendCodeSnapshot(sessionId, {
            revision: manifest.revision,
            status: 'validating',
            stage: manifest.stage,
            fileCount: manifest.files.length,
            changedFiles: manifest.files.map((file) => file.path),
            lastGoodRevision: manifest.lastGoodRevision,
          });
          return manifest;
        },
        onTokenUsageRecord: (data) => {
          // 🆕 持久化 Token 用量到 MongoDB（异步非阻塞）
          this.tokenTrackerService.recordUsage(data);
        },
        // 🆕 暂停检查回调：每个分块生成前由管线调用，返回当前任务状态
        pauseChecker: async () => {
          const task = this.tasksService.getTask(sessionId);
          return task?.status || 'running';
        },
      });

      await this.ensurePreviewImage(
        outputPath,
        fileKey,
        nodeId,
        effectiveFigmaToken,
      );

      // 统一落盘 Figma 逻辑尺寸，作为 Preview/TaskDetail 的稳定元数据源。
      // 该文件必须进入 candidate 文件组，不能只依赖 workspace 侧临时推导。
      let figmaNode = genResult?.figmaNodeData?.document
        || genResult?.figmaNodeData
        || genResult?.figmaData?.document
        || genResult?.figmaData;
      if (!figmaNode) {
        try {
          const cachePath = join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
          if (existsSync(cachePath)) {
            const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
            figmaNode = cached?.document || cached;
          }
        } catch (sizeError: any) {
          this.logger.warn(`[Phase2] 读取 Figma 尺寸缓存失败: ${sizeError.message}`);
        }
      }
      const figmaBox = figmaNode?.absoluteBoundingBox;
      if (figmaBox?.width && figmaBox?.height) {
        await writeFile(
          join(outputPath, '_figma-size.json'),
          JSON.stringify({ document: { absoluteBoundingBox: {
            width: figmaBox.width,
            height: figmaBox.height,
          } } }, null, 2),
          'utf-8',
        );
      }

      // 🏷️ 权威中文名回写：declare.json 的 componentName（经引擎归一化，纯中文标题）
      // 优先级高于早提取的 Figma 根节点名；此时 declare.json 已落盘，从磁盘读最可靠。
      try {
        let declareRaw: string | null = null;
        if (outputPath) {
          const declPath = join(outputPath, 'declare.json');
          if (existsSync(declPath)) declareRaw = readFileSync(declPath, 'utf-8');
        }
        if (!declareRaw && typeof genResult?.files?.['declare.json'] === 'string') {
          declareRaw = genResult.files['declare.json'];
        }
        if (declareRaw) {
          const decl = JSON.parse(declareRaw);
          const zhName = typeof decl?.componentName === 'string' ? decl.componentName.trim() : '';
          if (zhName && /[\u4e00-\u9fa5]/.test(zhName)) {
            const t = this.tasksService.getTask(sessionId);
            if (t && t.displayName !== zhName) {
              t.displayName = zhName;
              this.logger.log(`[displayName] 权威中文名（declare）: ${zhName} (${sessionId})`);
            }
          }
        }
      } catch { /* declare 解析失败，保留早提取值 */ }

      this.logger.log(`Phase 1 generation completed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Phase 1 generation failed for session ${sessionId}: ${error.message}`,
      );
      genError = error;
    } finally {
      // 🆕 生成结束（成功/失败/被中断）即注销 AbortController，避免泄漏
      this.tasksService.removeAbortController(sessionId);

      // 🆕 清除日志上下文，避免全局 sessionId 污染后续任务（尤其 Lite 任务不调 setSessionContext）
      try {
        const { Logger: _CL } = await import('../ai-engine/logger/logger.js');
        _CL.clearSessionContext();
      } catch { /* ignore if logger module unavailable */ }

      // 质量预览期间 workspace 承载的是候选版本。候选始终可供人工审查，
      // 只有运行时质量门禁通过时才晋级 last-good；WARN/BLOCK 不撤销候选。
      // 候选发布失败或缺少入口时才进入终态错误，禁止广播假完成。
      const runtimeStatus = genResult?.runtimeGate?.status || null;
      // generate 模式（V3 写完即停）显式跳过质量门禁：无 runtimeGate 视为放行。
      // 其他模式 fail-closed：只有 runtime gate 明确 PASS 才能晋级 last-good。
      // 缺失、WARN、BLOCK 均保留审计并回滚旧版本，避免质量步骤未执行时误放行。
      const qualityGateSkipped = genResult?._v3Mode === 'generate';
      const qualityPassed = qualityGateSkipped || runtimeStatus === 'PASS';
      const qualityFailureMessage = genResult?.runtimeGate?.warning?.message
        || (runtimeStatus ? `运行时质量门禁未通过（${runtimeStatus}）` : '运行时质量门禁结果缺失');
      let terminalError = genError || (!qualityPassed ? new Error(qualityFailureMessage) : null);

      // 最终发布前强制从磁盘编译后处理后的 LESS。编译 BLOCK 是终态错误，不能降级为 WARN，
      // 否则会出现任务显示“已完成”但预览必然报错的假完成。
      if (!terminalError && outputPath && existsSync(join(outputPath, 'package', 'index.vue'))) {
        try {
          await this.precompileCss(outputPath);
          candidateValidation = { ...candidateValidation, less: 'passed' };
          // 🔒 R1（2026-09-01）：precompileCss 会清洗磁盘 styles（theme-vars :root 包裹、
          // LLM 污染剥离），而 candidate revision 创建在其之前 → 快照停在清洗前版本，
          // 与 workspace（磁盘发布）分叉。此处把 styles 终态同步进 revision，保持同源。
          if (candidateRevision) {
            try {
              const stylesRoot = join(outputPath, 'resources', 'styles');
              const relPaths: string[] = [];
              const walkStyles = (absDir: string, relPrefix: string) => {
                if (!existsSync(absDir)) return;
                for (const name of readdirSync(absDir)) {
                  const abs = join(absDir, name);
                  if (statSync(abs).isDirectory()) {
                    walkStyles(abs, `${relPrefix}/${name}`);
                  } else if (/\.(less|css)$/i.test(name)) {
                    relPaths.push(`${relPrefix}/${name}`);
                  }
                }
              };
              walkStyles(stylesRoot, 'resources/styles');
              if (relPaths.length > 0) {
                this.taskCodeSnapshotService.refreshRevisionFilesFromDisk(
                  sessionId,
                  candidateRevision,
                  outputPath,
                  relPaths,
                );
              }
            } catch (refreshErr: any) {
              this.logger.warn(
                `[Phase2] 快照 styles 终态同源刷新失败（非阻断）: ${refreshErr?.message || refreshErr}`,
              );
            }
          }
        } catch (cssErr: any) {
          terminalError = cssErr;
          candidateValidation = { ...candidateValidation, less: 'blocked' };
          this.logger.error(
            `Final LESS compile gate blocked task ${sessionId}: ${cssErr.message}`,
          );
        }
      } else if (terminalError) {
        // 终态错误已存在 → precompileCss 被跳过。候选创建时写入的 less:'passed' 只是
        // 未经真实编译的乐观初始值；若原样保留，会出现 manifest 显示 less passed、
        // 而磁盘产物必然编译失败（预览 iframe 必然报错）的“假完成”。此处如实回写：
        // 确属 LESS 阻断 → blocked；仅因流程提前失败未校验 → pending（未验证）。
        const errLike = terminalError as any;
        const l0bIssues: any[] = errLike?.codeValidationResult?.issues || [];
        const lessBlocked =
          errLike?.code === 'LESS_COMPILE_GATE_BLOCKED' ||
          errLike?.lessCompileGate?.pass === false ||
          (errLike?.code === 'L0B_BLOCK_EXHAUSTED' &&
            l0bIssues.some((i) => i?.id === 'LESS-COMPILE-001'));
        const fallback = candidateValidation.less === 'passed' ? 'pending' : candidateValidation.less;
        candidateValidation = { ...candidateValidation, less: lessBlocked ? 'blocked' : fallback };
        this.logger.warn(
          `[Phase2] 终态错误已存在，跳过最终 LESS 预编译；less 校验状态回写为 ${candidateValidation.less}` +
            ` (${errLike?.code || 'NO_CODE'}) session=${sessionId}`,
        );
      }

      const snapshotTarget = genTarget === 'vue3' ? 'vue3' : 'microcode';

      // 🛡️ 2026-09-03 补全：M1-1 候选发布改造引入 publisher.xxx 调用但未定义 publisher——
      // TS2304 构建失败。publisher 为 CJS 模块（无类型声明），沿用本文件动态 import 风格取实例。
      const publisher = await loadPreviewPublisher();

      // P0：候选发布必须在最终收尾路径中显式确认，不能只依赖质量节点内的非阻塞 Promise。
      // 质量 WARN/BLOCK 只影响 last-good 晋级，不撤掉仍可预览/可编辑的 candidate。
      const hasPreviewEntry = !!outputPath && existsSync(join(outputPath, 'package', 'index.vue'));

      // M1-1：以 declare.json 的 componentId（c-<englishId>）作为 workspace 目录名与任务 componentId，
      // 保证 workspace 目录、任务记录、前端预览 URL 三端一致。
      const resolvedComponentId = hasPreviewEntry
        ? publisher.resolveWorkspaceComponentId(outputPath, sessionId)
        : sessionId;
      if (resolvedComponentId !== sessionId) {
        const task = this.tasksService.getTask(sessionId);
        if (task && task.componentId !== resolvedComponentId) {
          task.componentId = resolvedComponentId;
          this.logger.log(
            `[Phase2] 任务 componentId 按 declare.json 归一: ${sessionId} -> ${resolvedComponentId}`,
          );
        }
      }

      const previewContext = {
        componentId: resolvedComponentId,
        groupId: params.groupId,
        target: snapshotTarget,
      };

      let previewTransactionCommitted = false;
      let candidatePublishError: Error | null = null;
      // 🛡️ 2026-09-03（P0 配套）：事务 key 必须用 publisher **实际落名** 的 componentId。
      // P0 重名保护会在撞名时把目录名改成 c-xxx-2，此时 publisher 内建的事务 key 用新 id，
      // 而 previewContext 仍是归一后的原 id → commit 找不到事务 → 误判"事务提交失败"并让任务失败
      // （实锤：mc-max-1788444537578 生成 c-env-monitor-3 后报「候选预览发布事务提交失败」）。
      let publishContext = { ...previewContext };

      if (hasPreviewEntry) {
        try {
          // 以最终 outputPath 再同步一次，确保预启动截图不会发布过时文件。
          // publisher 会复用现有 baseline，只替换当前 candidate，不会覆盖回滚基线。
          const publishResult = await publisher.publishQualityPreview({
            outputPath,
            componentId: resolvedComponentId,
            groupId: params.groupId,
            target: snapshotTarget,
          });
          const publishedComponentId = publishResult?.componentId || resolvedComponentId;
          if (publishedComponentId !== resolvedComponentId) {
            this.logger.warn(
              `[Phase2] 组件重名，实际落名 ${publishedComponentId}（原 ${resolvedComponentId}），事务上下文同步修正`,
            );
          }
          publishContext = { ...previewContext, componentId: publishedComponentId };
          previewTransactionCommitted = publisher.commitQualityPreviewTransaction(publishContext);
          if (!previewTransactionCommitted) {
            throw new Error('候选预览发布事务提交失败');
          }
          this.logger.log(
            `[Phase2] candidate 预览已确认发布: ${sessionId} -> ${publishedComponentId} (${snapshotTarget})`,
          );
        } catch (publishErr: any) {
          candidatePublishError = publishErr instanceof Error
            ? publishErr
            : new Error(String(publishErr?.message || publishErr));
          publisher.rollbackQualityPreviewTransaction({
            ...publishContext,
            reason: candidatePublishError.message,
          });
          this.logger.error(
            `[Phase2] candidate 预览发布失败: ${sessionId}: ${candidatePublishError.message}`,
            candidatePublishError.stack,
          );
        }
      } else {
        publisher.rollbackQualityPreviewTransaction({
          ...previewContext,
          reason: '缺少 package/index.vue，无法发布候选预览',
        });
      }

      // 发布失败必须进入错误态，禁止出现“任务完成但 workspace 不存在”。
      if (candidatePublishError) {
        terminalError = new Error(`候选预览发布失败: ${candidatePublishError.message}`);
        (terminalError as any).code = 'PREVIEW_PUBLISH_FAILED';
      } else if (!hasPreviewEntry && !terminalError) {
        terminalError = new Error('生成产物缺少 package/index.vue，无法提供预览');
        (terminalError as any).code = 'PREVIEW_ENTRY_MISSING';
      }

      if (candidateRevision) {
        candidateValidation = {
          ...candidateValidation,
          runtime: runtimeStatus === 'PASS' ? 'passed' : runtimeStatus === 'WARN' ? 'warning' : 'blocked',
        };
        let snapshot;
        if (!genError && qualityPassed && !candidatePublishError && hasPreviewEntry) {
          snapshot = this.taskCodeSnapshotService.publishLastGood(
            sessionId,
            candidateRevision,
            candidateValidation,
          );
        } else if (genError) {
          // 生成过程失败但已有文件时，保留 partial 供预览与 Playground 手动补全。
          snapshot = this.taskCodeSnapshotService.markPartial(
            sessionId,
            candidateRevision,
            terminalError?.message || '生成失败（部分文件已生成，可进入编辑器手动补全）',
            { ...candidateValidation, runtime: 'blocked' },
          );
        } else if (!candidatePublishError && hasPreviewEntry) {
          // 质量失败不等于文件不可用：保留 candidate，last-good 保持不变。
          snapshot = this.taskCodeSnapshotService.markCandidateDegraded(
            sessionId,
            candidateRevision,
            terminalError?.message || '质量门禁未通过，已保留候选版本供人工审查',
            candidateValidation,
          );
        } else {
          snapshot = this.taskCodeSnapshotService.rejectCandidate(
            sessionId,
            candidateRevision,
            terminalError?.message || '候选预览发布失败',
            { ...candidateValidation, runtime: 'blocked' },
          );
        }
        this.progressService.sendCodeSnapshot(sessionId, {
          revision: snapshot.revision,
          status: snapshot.status,
          stage: snapshot.stage,
          fileCount: snapshot.files.length,
          changedFiles: snapshot.files.map((file) => file.path),
          lastGoodRevision: snapshot.lastGoodRevision,
        });
      }

      // 🆕 P0修复：先广播终态事件，确保前端 SSE 立即收到 complete/error。
      // 此前 precompileCss + copyToWorkspace + DB 串行执行，可能耗时超过前端看门狗阈值，
      // 导致 SSE 被判定静默断开、前端永远收不到 complete 事件、isGenerating 卡死。
      // sendComplete/sendError 内部已调用 completeTask/failTask 完成持久化。
      // 🛡️ P2 缺失清单：失败时读 chunk-meta.json 附加「已完成分块」，让用户明确缺哪、半成品已保留。
      if (terminalError && outputPath) {
        try {
          const chunkMetaPath = join(outputPath, '.mc-gen', 'cache', 'code-chunks', 'chunk-meta.json');
          if (existsSync(chunkMetaPath)) {
            const meta = JSON.parse(readFileSync(chunkMetaPath, 'utf-8'));
            const completed = Array.isArray(meta?.completed) ? meta.completed : [];
            const note = completed.length > 0
              ? `已完成分块：${completed.join('、')}`
              : '未生成任何完整分块';
            terminalError.message = `${terminalError.message}\n${note}（半成品已保留，可进入编辑器手动补全）`;
          }
        } catch { /* 忽略 chunk-meta 读取失败 */ }

        // 🆕 S1-④ 失败卡片缓存状态：检测 checkpoint，更新 task.checkpointStatus，
        // 前端据此展示「已缓存设计稿/视觉分析，重试秒续」提示。
        try {
          const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
          const cp = loadCheckpoint(outputPath);
          if (cp?.stage && cp.stage !== 'none') {
            this.tasksService.updateTask(sessionId, { checkpointStatus: cp.stage });
          }
        } catch { /* 忽略 checkpoint 检测失败 */ }
      }
      if (terminalError) {
        // 🆕 用户极速通过：speedPassTask 已广播 complete，跳过失败广播避免覆盖完成态
        const t = this.tasksService.getTask(sessionId);
        if (t?.userApproved) {
          this.logger.log(`[Phase2] 任务 ${sessionId} 用户已极速通过，跳过失败广播`);
        } else {
          // 🆕 S1 错误人话翻译：裸错误码 → 友好提示（保留技术细节到 server.log 的 stack）
          const friendly = humanizeGenerationError(terminalError?.message);
          if (friendly && terminalError && friendly !== terminalError.message) {
            terminalError.friendlyMessage = friendly;
          }
          this.progressService.sendError(sessionId, terminalError);
        }
      } else {
        this.progressService.sendComplete(sessionId, {
          ...genResult,
          taskId: sessionId,
          componentId: resolvedComponentId,
          groupId: params.groupId,
          target: genTarget || 'microcode',
          _completionModels: {
            visionModel: actualVisionModels.size
              ? [...actualVisionModels].join(', ')
              : (visionModelUsed || ''),
            textModel: actualTextModels.size
              ? [...actualTextModels].join(', ')
              : (textModelUsed || ''),
          },
        });
        
        // 🆕 记录成功生成：只有成功生成的组件才占用配额
        if (params.userId && qualityPassed && !terminalError) {
          this.quotaService.recordSuccess(params.userId, sessionId);
        }
      }

      // 🆕 异步执行 DB 保存（不阻塞终态广播，失败仅记录日志）
      // workspace 同步已在 broadcast 前完成，此处仅剩 DB 持久化
      ;(async () => {
        if (terminalError || !qualityPassed) return; // 生成/质量/LESS 门禁失败时不登记为正式组件

        const hasEntry =
          !!outputPath && existsSync(join(outputPath, 'package', 'index.vue'));
        if (!outputPath || !componentName || !hasEntry) {
          return;
        }

        // 保存组件记录到数据库（供"我的组件"列表展示）
        try {
          let resolvedCreatorId = params.userId;
          let resolvedGroupId = params.groupId;

          // 无登录用户时，从群组成员中获取第一个成员作为创建者
          if (!resolvedCreatorId && resolvedGroupId) {
            const firstMember = await this.groupMemberModel
              .findOne({ groupId: resolvedGroupId })
              .exec();
            if (firstMember) {
              resolvedCreatorId = firstMember.userId.toString();
              this.logger.log(`Resolved creatorId to ${resolvedCreatorId} from group membership`);
            }
          }

          // 安全网：如果 groupId 不是合法的 ObjectId，从群组成员关系中解析
          if (!Types.ObjectId.isValid(resolvedGroupId)) {
            this.logger.warn(
              `groupId "${resolvedGroupId}" is not a valid ObjectId, resolving from user memberships...`,
            );
            if (resolvedCreatorId) {
              const membership = await this.groupMemberModel
                .findOne({ userId: resolvedCreatorId })
                .exec();
              if (membership) {
                resolvedGroupId = membership.groupId.toString();
                this.logger.log(
                  `Resolved groupId to ${resolvedGroupId} from user membership`,
                );
              }
            }
          }

          // 确保 groupId 是合法 ObjectId
          if (!Types.ObjectId.isValid(resolvedGroupId)) {
            throw new Error(
              `Cannot resolve groupId "${resolvedGroupId}" — no valid group found`,
            );
          }

          // 确保 creatorId 存在（至少用 groupId 兜底）
          if (!resolvedCreatorId) {
            this.logger.warn(
              `No creator found for ${sessionId}, using groupId as fallback`,
            );
            resolvedCreatorId = resolvedGroupId;
          }

          // 从缓存读取 Figma 节点原始尺寸，供前端预览按比例显示
          let figmaWidth: number | undefined;
          let figmaHeight: number | undefined;
          try {
            const cachePath = join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
            if (existsSync(cachePath)) {
              const cacheRaw = await readFile(cachePath, 'utf-8');
              const cacheData = JSON.parse(cacheRaw);
              const doc = cacheData.document || cacheData; // 兼容包装与裸节点两种结构
              const bbox = doc?.absoluteBoundingBox;
              if (bbox?.width && bbox?.height) {
                figmaWidth = Math.round(bbox.width);
                figmaHeight = Math.round(bbox.height);
              }
            }
          } catch {
            // 尺寸提取失败不影响组件记录保存
          }

          await this.componentService.createComponent(
            componentName,
            componentName || '微码生成组件',
            resolvedGroupId,
            resolvedCreatorId,
            {
              type: genTarget === 'vue3' ? 'vue3' : 'phase2',
              target: genTarget || 'microcode',
              taskId: sessionId,
              componentId: resolvedComponentId,
              sessionId,
              figmaFileKey: params.fileKey,
              figmaNodeId: params.nodeId,
              ...(figmaWidth ? { figmaWidth } : {}),
              ...(figmaHeight ? { figmaHeight } : {}),
            },
          );
          this.logger.log(
            `Component record saved to database: ${componentName} (sessionId: ${sessionId})`,
          );
        } catch (error) {
          // 数据库保存失败不影响组件使用（workspace 预览仍可用）
          this.logger.warn(
            `Failed to save component to database: ${error.message}`,
          );
        }
      })().catch((err) => {
        this.logger.error(
          `Post-processing unhandled error for ${sessionId}: ${err.message}`,
          err.stack,
        );
      });
    }
  }

  /**
   * 🆕 断点续跑：从 checkpoint 恢复被中断的组件生成
   * 供 TasksService.recoverTask 调用——当组件在分析阶段后（代码生成前）被中断时，
   * 读取 .checkpoint/ 缓存重建输入，跳过已完成的 figma/visual/analysis，从断点继续。
   * @returns { success, message, error? }
   */
  async resumeFromCheckpoint(
    sessionId: string,
    params: {
      componentName: string;
      fileKey: string;
      nodeId: string;
      outputPath: string;
      groupId: string;
      userId?: string;
      panelType?: string;
      target?: string;
      failureGuidance?: string; // 🛡️ P1-3：任务级重试注入的上轮失败指导（透传到 engineer prompt）
    },
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
      const cp = loadCheckpoint(params.outputPath);

      if (cp.stage === 'code-generated') {
        // 代码已生成 → 走完整收尾（copyToWorkspace 等），不需要重新生成
        return { success: false, error: '代码已生成，无需续跑' };
      }
      if (cp.stage === 'none') {
        return { success: false, error: '未找到可用的 checkpoint 缓存' };
      }

      this.logger.log(`🔄 断点续跑: ${sessionId} (stage=${cp.stage})`);

      // 读取任务原有 config（AI 配置快照）
      const task = this.tasksService.getTask(sessionId);
      const config = task?.configSnapshot || {};

      // 异步执行续跑（不阻塞恢复响应）
      this.executeGeneration(sessionId, {
        componentName: params.componentName,
        fileKey: params.fileKey,
        nodeId: params.nodeId,
        outputPath: params.outputPath,
        config,
        groupId: params.groupId,
        userId: params.userId,
        panelType: params.panelType,
        target: params.target,
        failureGuidance: params.failureGuidance, // 🛡️ P1-3：上轮失败指导
        uiCache: cp.uiCache || undefined,
        resumeData: cp.resumeData || undefined,
      }).catch((error: any) => {
        this.logger.error(`断点续跑失败: ${sessionId}: ${error.message}`);
        this.progressService.sendError(sessionId, { message: error.message });
      });

      return {
        success: true,
        message: `已从断点继续生成（跳过已完成的分析阶段）`,
      };
    } catch (error: any) {
      this.logger.error(`resumeFromCheckpoint 失败: ${sessionId}: ${error.message}`);
      return { success: false, error: `断点续跑启动失败: ${error.message}` };
    }
  }

  /**
   * 🆕 人工精修：生成完成（写完即停）后，用户可手动触发定向精修。
   * 复用 checkpoint 里的 figma/visual/analysis 缓存 + 磁盘产物，直接跑 refiner 角色，
   * 不重新走 figma/visual/engineer 全流程（省时）。
   *
   * 预检（任务产物 + checkpoint 存在性）在此同步完成，失败立即抛出由 controller 转 400；
   * 精修本身异步执行，不阻塞端点返回。
   */
  async refineComponent(
    sessionId: string,
    params: { componentId: string; refineType?: string; userId?: string },
  ): Promise<void> {
    const { componentId, refineType = 'both', userId } = params;

    // 1. 预检：任务记录 + 产物入口
    const task = this.tasksService.getTask(componentId);
    const outputPath = task?.outputPath;
    if (!outputPath || !existsSync(join(outputPath, 'package', 'index.vue'))) {
      throw new Error('任务产物不存在，无法精修（需先完成一次生成）');
    }

    // 2. 预检：checkpoint（figma/visual/analysis 缓存）
    const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
    const cp = loadCheckpoint(outputPath);
    const figmaNodeData = cp?.uiCache?.figmaNodeData || null;
    const previewAnalysis = cp?.uiCache?.previewAnalysis || null;
    const layoutStructure = previewAnalysis?.layoutStructure || null;
    const visualElements = previewAnalysis?.visualElements || null;
    const styleMappings = cp?.resumeData?.cachedStyleMappings || null;

    if (!figmaNodeData || !layoutStructure) {
      throw new Error('缺少分析缓存（checkpoint），无法精修。请重新生成一次以建立缓存');
    }

    const target = task.target || 'microcode';
    const groupId = task.groupId || 'default-group';
    const componentName = task.componentName || componentId;
    const generatedFiles = this.scanComponentFiles(outputPath);

    // 3. 创建精修任务记录（任务中心可见）
    // 🐛 修复：componentId 必须保持「原组件 ID」，而非精修任务 sessionId。
    // 精修是覆盖原组件（copyToWorkspace 用 componentName 同步到原目录），
    // 前端预览用 task.componentId 定位组件——若改成 sessionId(mc-refine-*) 会导致「未找到组件」。
    this.tasksService.createTask(sessionId, {
      configSnapshot: task.configSnapshot || {},
      componentId: componentId,
      groupId,
      componentName,
      nodeId: task.nodeId,
      fileKey: task.fileKey,
      target,
      outputPath,
      panelKey: task.panelKey || 'default-panel',
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: task.sourceType || 'figma',
    });

    const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
    CustomLogger.setSessionContext(sessionId, this.progressService);
    this.sendSseLog(sessionId, 'info', `人工精修已开始（${refineType === 'both' ? '布局 + 样式' : refineType}）`);

    // 4. 异步执行精修（runInSessionContext 包裹，避免并发任务日志串台）
    CustomLogger.runInSessionContext(sessionId, this.progressService, () => {
      this.executeRefine(sessionId, {
        componentName,
        outputPath,
        target,
        groupId,
        userId,
        refineType,
        figmaNodeData,
        layoutStructure,
        visualElements,
        styleMappings,
        generatedFiles,
        config: task.configSnapshot || {},
      }).catch((error: any) => {
        this.logger.error(`精修失败: ${sessionId}: ${error.message}`, error.stack);
        this.progressService.sendError(sessionId, { message: error.message, stack: error.stack });
      });
    });
  }

  /** 精修核心：按 refineType 跑 layout/style refiner，收尾同步 workspace 并广播完成 */
  private async executeRefine(
    sessionId: string,
    params: {
      componentName: string;
      outputPath: string;
      target: string;
      groupId: string;
      userId?: string;
      refineType: string;
      figmaNodeData: any;
      layoutStructure: any;
      visualElements: any;
      styleMappings: any;
      generatedFiles: string[];
      config: any;
    },
  ): Promise<void> {
    const mergedAiConfig = await this.buildMergedAiConfig(params.config, params.userId);
    const { resolveTextConfig } = await import('../ai-engine/utils/ai-defaults.js');
    const textCfg = resolveTextConfig(mergedAiConfig);
    const onProgress = (data: any) => this.progressService.sendProgress(sessionId, data);

    // 🎯 P4（增量修改）：把 refineType 翻译成 refiner 的 _reviseTarget。
    // 此前只用它决定「跑哪个 refiner」，没传 _reviseTarget → 两个 refiner 都按默认值
    // 'full' 跑「全面精修」，导致「仅布局」也会顺手动样式、「仅样式」也会重排结构。
    // 用户选的类型在传递途中被丢掉，这正是「为什么不是增量修改」的成因之一。
    const reviseTarget = resolveRefineTarget(params.refineType);
    this.logger.log(
      `精修范围: refineType=${params.refineType} → _reviseTarget=${reviseTarget}`,
    );

    // 布局精修
    if (params.refineType === 'layout' || params.refineType === 'both') {
      const { LayoutRefiner } = await import('../ai-engine/roles/layout-refiner.js');
      const refiner = new LayoutRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL,
      });
      const result = await refiner.execute({
        figmaNodeData: params.figmaNodeData,
        layoutStructure: params.layoutStructure,
        outputPath: params.outputPath,
        generatedFiles: params.generatedFiles,
        target: params.target,
        onProgress,
        _reviseTarget: reviseTarget, // 🎯 P4：收窄精修范围，避免顺手改动无关内容
      });
      this.sendSseLog(
        sessionId,
        'info',
        result.refined
          ? `✅ 布局精修完成（修改 ${result.modifiedFiles?.length || 0} 个文件）`
          : `⚠️ 布局精修跳过: ${result.reason || '无修改'}`,
      );
    }

    // 样式精修
    if (params.refineType === 'style' || params.refineType === 'both') {
      const { StyleRefiner } = await import('../ai-engine/roles/style-refiner.js');
      const refiner = new StyleRefiner({
        apiKey: textCfg.apiKey || process.env.TEXT_API_KEY,
        model: textCfg.model || process.env.TEXT_MODEL,
        baseURL: textCfg.baseURL || process.env.TEXT_BASE_URL,
      });
      const result = await refiner.execute({
        figmaNodeData: params.figmaNodeData,
        styleMappings: params.styleMappings,
        visualElements: params.visualElements,
        outputPath: params.outputPath,
        generatedFiles: params.generatedFiles,
        target: params.target,
        onProgress,
        _reviseTarget: reviseTarget, // 🎯 P4：收窄精修范围，避免顺手改动无关内容
      });
      this.sendSseLog(
        sessionId,
        'info',
        result.refined
          ? `✅ 样式精修完成（修改 ${result.modifiedFiles?.length || 0} 个文件）`
          : `⚠️ 样式精修跳过: ${result.reason || '无修改'}`,
      );
    }

    // 收尾：最终 LESS 编译门禁通过后才允许同步 workspace 与广播完成。
    // 精修同样可能改坏最终磁盘产物，因此必须 fail-closed，失败交由外层 catch 发送任务错误。
    await this.precompileCss(params.outputPath);
    // 🐛 说明：executeRefine 的 params 含 outputPath/componentName/target/groupId（原组件信息），
    // 精修是「覆盖原组件」——copyToWorkspace 用 componentName 同步到原组件目录。
    // 真正的 bug 是 refineComponent 里 createTask 的 componentId 误用 sessionId（已修复为原组件 ID）。
    await this.copyToWorkspace(params.outputPath, params.componentName, params.target, params.groupId);

    this.progressService.sendComplete(sessionId, {
      taskId: sessionId,
      componentId: sessionId,
      groupId: params.groupId,
      target: params.target,
      _completionModels: { visionModel: null, textModel: textCfg?.model || null },
    });
  }

  /** 扫描产物目录下的 .vue / .less 文件（相对路径），作为 refiner 的 generatedFiles 输入 */
  private scanComponentFiles(outputPath: string): string[] {
    const results: string[] = [];
    const walk = (dir: string, base: string) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        const st = statSync(full);
        if (st.isDirectory()) {
          if (name === '.checkpoint' || name === '.mc-gen' || name === '.cache' || name === 'node_modules') continue;
          walk(full, rel);
        } else if (name.endsWith('.vue') || name.endsWith('.less')) {
          results.push(rel);
        }
      }
    };
    walk(outputPath, '');
    return results;
  }

  // 预编译组件 LESS 样式为纯 CSS，写入组件目录 resources/styles/index.css
  // 生产环境预览页直接加载此 CSS，无需在浏览器里跑 LESS 编译
  private async precompileCss(outputPath: string): Promise<void> {
    try {
      const stylesDir = join(outputPath, 'resources', 'styles');
      const lessEntry = join(stylesDir, 'index.less');
      if (!existsSync(lessEntry)) {
        this.logger.warn(
          `No index.less found at ${lessEntry}, skip CSS precompile`,
        );
        return;
      }

      // 🆕 清洗所有 .less 文件中的 LLM 污染内容
      // 使用共享 css-sanitizer.js 工具（与 Vue3 <style> 清洗共用同一套逻辑）
      // 额外步骤：theme-vars.less 中根级别 mixin 调用需包裹 :root
      const sanitizeLess = (raw: string, fileName: string): string => {
        // 共享清洗：thinking 块、分隔符碎片、@import 修复、非法行跳过
        let cleaned = sanitizeCssContent(raw, { isLessFile: true });

        // theme-vars.less 专项修复：根级别 mixin 调用必须包裹在 :root 内
        // 典型问题：.common(); 单独一行在 :root 外部 → LESS 报错"Properties must be inside selector blocks"
        if (fileName === 'theme-vars.less') {
          const mixinCallPattern = /^\.(common|theme-dark|theme-light)\(\);\s*$/gm;
          const hasRootMixin = mixinCallPattern.test(cleaned);
          mixinCallPattern.lastIndex = 0;

          if (hasRootMixin) {
            // 1. 提取所有根级别 mixin 调用
            const rootMixins: string[] = [];
            let match;
            while ((match = mixinCallPattern.exec(cleaned)) !== null) {
              rootMixins.push(match[0].trim());
            }

            // 2. 移除所有根级别 mixin 调用行
            cleaned = cleaned.replace(mixinCallPattern, '');

            // 3. 如果已有 :root 块，把 mixin 调用插进去
            if (/:root\s*\{/.test(cleaned)) {
              cleaned = cleaned.replace(
                /(:root\s*\{)/,
                `$1\n${rootMixins.map((m) => `  ${m}`).join('\n')}`,
              );
            } else {
              // 没有 :root → 创建
              cleaned += `\n:root {\n${rootMixins.map((m) => `  ${m}`).join('\n')}\n}`;
            }

            // 4. 清理多余空行（:root 前后最多一个空行）
            cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
          }
        }

        return cleaned;
      };

      const lessFiles = (await readdir(stylesDir)).filter((f: string) =>
        f.endsWith('.less'),
      );
      for (const f of lessFiles) {
        const fp = join(stylesDir, f);
        const raw = await readFile(fp, 'utf-8');
        const cleaned = sanitizeLess(raw, f);
        if (cleaned !== raw) {
          await writeFile(fp, cleaned, 'utf-8');
          this.logger.warn(`Sanitized LESS file: ${f}`);
        }
      }
      // themes 子目录也清洗
      const themesDir = join(stylesDir, 'themes');
      if (existsSync(themesDir)) {
        const themeFiles = (await readdir(themesDir)).filter((f: string) =>
          f.endsWith('.less'),
        );
        for (const f of themeFiles) {
          const fp = join(themesDir, f);
          const raw = await readFile(fp, 'utf-8');
          const cleaned = sanitizeLess(raw, f);
          if (cleaned !== raw) {
            await writeFile(fp, cleaned, 'utf-8');
            this.logger.warn(`Sanitized LESS file: themes/${f}`);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const less = require('less');
      const lessSource = await readFile(lessEntry, 'utf-8');
      try {
        const result = await less.render(lessSource, {
          filename: lessEntry,
          paths: [stylesDir],
        });

        const cssPath = join(outputPath, 'resources', 'styles', 'index.css');
        await writeFile(cssPath, result.css, 'utf-8');

        // P0 产物校验：编译产物必须有实际 CSS 规则，否则视为无效编译
        const ruleCount = (result.css.match(/\{/g) || []).length;
        if (ruleCount === 0) {
          const emptyError: any = new Error(
            'LESS 编译产物无 CSS 规则（0 个选择器），源文件可能存在语法错误（如缺少分号）',
          );
          emptyError.code = 'LESS_EMPTY_OUTPUT';
          throw emptyError;
        }
        this.logger.log(`Precompiled CSS written to ${cssPath} (${ruleCount} rules)`);
      } catch (firstError) {
        // 🆕 第一次编译失败：尝试逐文件诊断+修复后重试
        this.logger.warn(`First LESS compile failed (${firstError.message}), trying aggressive fix...`);

        // 逐个 LESS 文件尝试编译，找到出错的文件
        const allLessFiles = [...lessFiles.map(f => ({ f, dir: stylesDir }))];
        if (existsSync(themesDir)) {
          const themeFiles = (await readdir(themesDir)).filter((f: string) => f.endsWith('.less'));
          themeFiles.forEach(f => allLessFiles.push({ f, dir: themesDir }));
        }

        for (const { f, dir } of allLessFiles) {
          const fp = join(dir, f);
          const content = await readFile(fp, 'utf-8');
          try {
            await less.render(content, { filename: fp, paths: [stylesDir] });
          } catch (fileErr) {
            this.logger.warn(`LESS file ${f} has errors: ${fileErr.message}, applying aggressive cleanup`);
            // 激进清洗：使用共享 css-sanitizer.js（只保留合法行 + 大括号闭合）
            const fixed = aggressiveCleanCss(content);
            await writeFile(fp, fixed, 'utf-8');
            this.logger.warn(`Aggressively cleaned ${f}`);
          }
        }

        // 🐛 修复：LESS 变量作用域 bug——变量被定义在 .common()/.theme-dark() 等 mixin 内部，
        // 但 common.less 经 index.less 根作用域 `@import (multiple)` 引入，引用变量时 mixin 尚未生效，
        // 导致 "variable @xxx is undefined"。这里从错误信息提取缺失变量名，若在 theme-vars.less
        // 的某个 mixin 内已定义，则复制一份到根级别（mixin 外），再重试编译。
        try {
          const themeVarsPath = join(themesDir, 'theme-vars.less');
          if (existsSync(themeVarsPath) && firstError?.message) {
            const missingMatch = String(firstError.message).match(/variable\s+@([\w-]+)\s+is\s+undefined/i);
            if (missingMatch) {
              const missingVar = `@${missingMatch[1]}`;
              const tv = await readFile(themeVarsPath, 'utf-8');
              const esc = missingVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const defRe = new RegExp(`^\\s*${esc}\\s*:\\s*([^;]+);`, 'm');
              const defMatch = tv.match(defRe);
              if (defMatch && !new RegExp(`^${esc}\\s*:\\s*[^;]+;\\s*$`, 'm').test(tv)) {
                await writeFile(themeVarsPath, `\n${missingVar}: ${defMatch[1].trim()};\n${tv}`, 'utf-8');
                this.logger.warn(`已将缺失变量 ${missingVar} 从 mixin 复制到根级别（作用域修复）`);
              }
            }
          }
        } catch (scopeErr: any) {
          this.logger.warn(`变量作用域修复失败（非致命）: ${scopeErr.message}`);
        }

        // 重试编译
        try {
          const retrySource = await readFile(lessEntry, 'utf-8');
          const result = await less.render(retrySource, {
            filename: lessEntry,
            paths: [stylesDir],
          });
          const cssPath = join(outputPath, 'resources', 'styles', 'index.css');
          await writeFile(cssPath, result.css, 'utf-8');
          this.logger.log(`Precompiled CSS written to ${cssPath} (after retry)`);
        } catch (retryError) {
          this.logger.error(
            `Failed to precompile CSS after retry: ${retryError.message}`,
          );
          const compileError: any = new Error(
            `共享 LESS 编译门禁阻断: ${retryError.message}`,
          );
          compileError.code = 'LESS_COMPILE_GATE_BLOCKED';
          compileError.lessCompileGate = {
            pass: false,
            blockCount: 1,
            diagnostics: [{
              id: 'LESS-COMPILE-001',
              severity: 'BLOCK',
              sourceType: 'shared-less',
              file: 'resources/styles/index.less',
              line: retryError.line || 1,
              column: (retryError.column ?? 0) + 1,
              message: retryError.message,
              extract: retryError.extract || [],
            }],
          };
          throw compileError;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to precompile CSS: ${error.message}`,
        error.stack,
      );
      // P0：编译失败必须阻断正常发布，禁止仅记日志后继续复制 workspace。
      throw error;
    }
  }

  /**
   * 修正 package/ 下 SFC 文件中的错误图片资源路径。
   *
   * LLM 生成 package/index.vue 时可能使用 ./resources/ 引用图片，
   * 但实际 resources/ 在 package/ 的父级目录，
   * 正确路径应为 ../resources/（从 package/ 内部访问时需上级）。
   *
   * 此方法在复制到 workspace 之前调用，确保路径正确后再落盘。
   */
  private async fixPackageImagePaths(outputPath: string): Promise<void> {
    try {
      const { readFile, writeFile, readdir, stat } = await import('fs/promises');
      const packageDir = join(outputPath, 'package');
      if (!existsSync(packageDir)) return;

      const files = await this.collectVueFiles(packageDir);
      let fixedCount = 0;

      for (const filePath of files) {
        const content = await readFile(filePath, 'utf-8');
        // 替换所有 ./resources/ 引用（img src、CSS url()、JS import 等）
        const fixed = content.replace(/['"]\.\/resources\//g, (m) => m.replace('./', '../'));
        if (fixed !== content) {
          await writeFile(filePath, fixed, 'utf-8');
          fixedCount++;
        }
      }

      if (fixedCount > 0) {
        this.logger.log(
          `[路径修正] package/ 中 ${fixedCount} 个文件已修正图片路径（./resources/ → ../resources/）`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`[路径修正] 跳过：${err.message}`);
      // 不阻塞主流程
    }
  }

  private resolveFigmaToken(figmaToken?: string): string {
    const directToken = typeof figmaToken === 'string' ? figmaToken.trim() : '';
    if (directToken) {
      return directToken;
    }

    const savedToken = this.aiConfigService.getAiConfig()?.figmaToken;
    const persistedToken = typeof savedToken === 'string' ? savedToken.trim() : '';
    if (persistedToken) {
      return persistedToken;
    }

    throw new Error('缺少 Figma Token：当前请求未传入，且服务端已保存配置中也不存在');
  }

  private async ensurePreviewImage(
    outputPath: string,
    fileKey: string,
    nodeId: string,
    figmaToken?: string,
  ): Promise<void> {
    const previewPath = join(outputPath, 'resources', 'images', 'mc-preview.png');
    if (existsSync(previewPath)) {
      return;
    }

    this.logger.warn(
      `Missing standardized preview image for ${outputPath}, trying to re-download from Figma`,
    );

    const effectiveFigmaToken = this.resolveFigmaToken(figmaToken);
    const figmaModule = await import('../ai-engine/roles/figma-connector.js');
    const { FigmaConnector } = figmaModule;
    const connector = new FigmaConnector({
      figmaToken: effectiveFigmaToken,
    });

    await connector.downloadPreviewImage(fileKey, nodeId, previewPath);

    if (!existsSync(previewPath)) {
      throw new Error(
        `Figma 预览图缺失，且补下载失败: resources/images/mc-preview.png (${outputPath})`,
      );
    }
  }

  /** 递归收集目录下所有 .vue 文件 */
  private async collectVueFiles(dir: string): Promise<string[]> {
    const { readdir, stat } = await import('fs/promises');
    const result: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await this.collectVueFiles(fullPath)));
      } else if (entry.name.endsWith('.vue')) {
        result.push(fullPath);
      }
    }
    return result;
  }

  // 将生成的组件复制到 backend workspace（供 API 预览）和前端 workspace（供 dev 预览）
  // 供开发环境下 Vite 自动感知并实时预览（生产环境需另走组件发布流程）
  async copyToWorkspace(
    outputPath: string,
    sessionId: string,
    target: string = 'microcode',
    groupId: string = 'default-group',
  ): Promise<void> {
    try {
      // M1-1：优先按 outputPath/declare.json 的 componentId 作为 workspace 目录名，
      // 保证目录名与 declare.json componentId 一致（mc-check M1-1 硬性要求）。
      // 🛡️ 2026-09-03 补全：动态 import 取实例后经实例调 resolveWorkspaceComponentId（TS2304 修复）。
      const publisher = await loadPreviewPublisher();
      let resolvedComponentId = publisher.resolveWorkspaceComponentId(outputPath, sessionId);
      if (resolvedComponentId !== sessionId) {
        this.logger.log(
          `[copyToWorkspace] workspace 目录名按 declare.json 归一: ${sessionId} -> ${resolvedComponentId}`,
        );
      }

      // 🛡️ P0 组件重名保护（2026-09-03）：englishId 由 LLM 生成且管线无唯一性校验，
      // 撞名会把其他任务的 workspace 产物**整体覆盖**（数据丢失）。与 publishQualityPreview
      // 同策略：以 backend workspace 目录为基准，同源（同 sessionId）沿用原名覆盖更新，
      // 异源追加 -2/-3；落名后写 .preview-source.json 标记供下次判定。
      const backendProbe = target === 'vue3'
        ? join(vue3ComponentsDir, groupId, resolvedComponentId)
        : join(customComponentsDir, resolvedComponentId);
      const uniqueComponentId = publisher.resolveUniqueComponentId(
        backendProbe,
        resolvedComponentId,
        sessionId,
        this.logger,
      );
      if (uniqueComponentId !== resolvedComponentId) {
        this.logger.warn(
          `[copyToWorkspace] 组件重名保护：${resolvedComponentId} 已被其他任务占用，改用 ${uniqueComponentId}`,
        );
        resolvedComponentId = uniqueComponentId;
      }

      // 微码与 Vue3 均保留 package/ 目录，资源位于其父级，需要 ./resources/ → ../resources/。
      await this.fixPackageImagePaths(outputPath);
      const packageDir = join(outputPath, 'package');
      const syntaxErrors = validateVueSfcDirectory(packageDir);
      // 🔧 generate 模式（写完即停）不因样式变量/非致命 SFC 问题阻断预览复制：
      //   用户明确要求"写完就停、质量留人"，阻断反而导致 404 无法人工审查。
      //   仅真正的目录缺失（产物根本不存在）才阻止复制，其余一律降级为 WARN 日志 + 照常复制。
      if (!existsSync(packageDir)) {
        throw new Error(`产物目录不存在: ${packageDir}`);
      }
      if (syntaxErrors.length > 0) {
        this.logger.warn(
          `[copyToWorkspace] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断预览复制）: ${syntaxErrors.slice(0, 5).join('; ')}`,
        );
      }
      const compDir = target === 'vue3' ? 'vue3-components' : 'custom-components';

      // 🆕 双目标复制：backend workspace（API 预览） + frontend workspace（Vite dev 预览）
      const backendPath = target === 'vue3'
        ? join(vue3ComponentsDir, groupId, resolvedComponentId)
        : join(customComponentsDir, resolvedComponentId);
      const frontendPath = target === 'vue3'
        ? join(resolveFrontendWorkspace(), compDir, groupId, resolvedComponentId)
        : join(resolveFrontendWorkspace(), compDir, resolvedComponentId);

      for (const targetPath of [backendPath, frontendPath]) {
        if (!existsSync(targetPath)) {
          await mkdir(targetPath, { recursive: true });
        }

        if (target === 'vue3') {
          const packageDir = join(outputPath, 'package');
          if (!existsSync(join(packageDir, 'index.vue'))) {
            this.logger.error(`Vue3 入口缺失，跳过发布: ${packageDir}`);
            continue;
          }
          await cp(packageDir, join(targetPath, 'package'), { recursive: true });
          const resourcesDir = join(outputPath, 'resources');
          if (existsSync(resourcesDir)) {
            await cp(resourcesDir, join(targetPath, 'resources'), { recursive: true });
          }
          this.logger.log(`Vue3 组件已复制到 ${targetPath}（package/ + resources/）`);
        } else {
          // 微码组件：复制整个目录（package、resources、declare.json 等），排除预览用的 index.html
          await cp(outputPath, targetPath, {
            recursive: true,
            filter: (src) => !src.endsWith('index.html'),
          });

          // 检查CSS文件是否存在
          const cssPath = join(outputPath, 'resources', 'styles', 'index.css');
          const lessPath = join(outputPath, 'resources', 'styles', 'index.less');
          const hasCss = existsSync(cssPath);
          const hasLess = existsSync(lessPath);

          // 创建 component.js 入口，供 import.meta.glob 扫描注册
          const styleImport = hasCss
            ? "import './resources/styles/index.css'"
            : hasLess
              ? "import './resources/styles/index.less'"
              : '// No CSS/LESS file found';
          const componentJs = `import component from './package/index.vue'
${styleImport}
export default component
`;
          await writeFile(
            join(targetPath, 'component.js'),
            componentJs,
            'utf-8',
          );
        }

        // 统一复制 Figma 尺寸元数据 _figma-size.json，供前端预览获取宽高比。
        // 优先使用 phase2 已规范化的尺寸文件；仅历史产物缺失时才回退缓存原始节点数据。
        const generatedSizeSource = join(outputPath, '_figma-size.json');
        const figmaCacheSource = join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
        const sizeSource = existsSync(generatedSizeSource)
          ? generatedSizeSource
          : existsSync(figmaCacheSource)
            ? figmaCacheSource
            : null;
        if (sizeSource) {
          const targetSizePath = join(targetPath, '_figma-size.json');
          await cp(sizeSource, targetSizePath);
          this.logger.debug(`[copyToWorkspace] 已复制 Figma 尺寸文件: ${targetSizePath}`);
        }

        // 🛡️ P0 重名保护配套：写入来源标记，供下次落名做同源判定
        // （缺标记时同源再发布会被误判为异源而错误追加 -2 后缀）。
        publisher.writePreviewSourceMarker(targetPath, sessionId);
      }

      this.logger.log(
        `Component copied to workspace: ${resolvedComponentId} (${target}, backend + frontend)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy component to workspace: ${error.message}`,
        error.stack,
      );
      // workspace 是预览发布的必要结果，不能吞掉异常后继续广播 complete。
      throw error;
    }
  }

  /**
   * 打包组件为zip文件
   */
  async packageComponent(
    componentId: string,
    target?: string,
    groupId?: string,
  ): Promise<Buffer> {
    // 统一走严格解析：与 Playground AI 修改器写入目录、规范检查目录保持同一事实源。
    // 用旧 resolveComponentDir 时，任务号（mc-lite-...-c298235f）会解析到 temp 快照空壳，
    // 导致下载包不含 AI 修复后的代码。
    const workspacePath = await resolveComponentDirStrict(componentId);

    if (!workspacePath || !existsSync(workspacePath)) {
      throw new Error(`组件不存在: ${componentId}`);
    }

    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err) => reject(err));

      // 将组件目录添加到zip中
      // 🧹 剔除管线内部目录（.snapshots/.backups/.cache/.checkpoint/.mc-gen）：
      // 这些是平台自身的快照/备份/中间态（含 125KB 生成截图），不属于组件交付物。
      archive.directory(workspacePath, componentId, packageEntryFilter());
      archive.finalize();
    });
  }

  /**
   * Figma 预览图获取（生成前确认）
   * 调用 Figma API 获取节点缩略图，用于用户确认
   */
  async getFigmaPreview(
    figmaUrl: string,
    figmaToken?: string,
    config?: any,
  ): Promise<{ success: boolean; imageUrl?: string; previewToken?: string; nodeName?: string; width?: number; height?: number; error?: string }> {
    // 动态导入 Figma 工具
    const { parseFigmaUrl } = await import('../ai-engine/utils/figma-url-parser.js');
    const { FigmaClient } = await import('../ai-engine/tools/figma/figma-client.js');
    const { getFigmaPreviewRateLimiter } = await import('../ai-engine/utils/figma-rate-limiter.js');

    // 1. 解析 URL
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed.fileKey) {
      return { success: false, error: '无效的 Figma URL，缺少 fileKey' };
    }

    // 2. 获取 Figma Token（请求 > 配置 > 环境变量）
    const token = figmaToken || config?.figmaToken || process.env.FIGMA_ACCESS_TOKEN;
    if (!token) {
      return { success: false, error: '缺少 Figma Token' };
    }

    try {
      // 3. 创建 FigmaClient（预览专用宽松限流器，避免被生成管线 7s 硬间隔拖慢）
      const client = new FigmaClient({ token, timeout: 30000, rateLimiter: getFigmaPreviewRateLimiter() });

      // 4. 确定 nodeId：URL 中未提供则通过 getFile 自动查找第一个可用节点
      let nodeId = parsed.nodeId;
      if (!nodeId) {
        this.logger.log(`URL 未提供 node-id，自动获取文件第一个可用节点`);
        const fileData = await client.getFile(parsed.fileKey);
        nodeId = this._findFirstNodeId(fileData?.document);
        if (!nodeId) {
          return { success: false, error: '无法从文件中找到可用节点，请在 URL 中添加 node-id 参数' };
        }
        this.logger.log(`自动找到节点: ${nodeId}`);
      }

      // 5. 并行拉节点信息 + 导出预览图（预览专用限流器 maxConcurrency=2 允许并行，省一次串行间隔）
      //    FigmaClient.getNode() 返回的已经是 nodeData.document（解包后的节点对象）
      //    ✅ getNode 传 depth=1：只返回目标节点自身属性（name/absoluteBoundingBox 足够预览），
      //    避免 Figma Nodes API 默认返回完整子树（复杂面板几千节点，曾拖慢接口至 ~17s）
      const apiNodeId = nodeId.replace(/-/g, ':');
      // 预览图分辨率参数化（默认 1.0：下载体积 461KB→242KB、耗时 5.3s→3.1s，预览确认够用；可 env 覆盖）
      const previewScale = Math.min(Math.max(Number(process.env.FIGMA_PREVIEW_SCALE ?? 1.0) || 1.0, 0.5), 4);

      // 5b. 内存缓存命中：同一 fileKey+nodeId+scale 重复请求直接复用，免调 Figma
      const cacheKey = `${parsed.fileKey}:${apiNodeId}:${previewScale}`;
      const cacheTtlMs =
        Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
      const cached = this._previewCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < cacheTtlMs) {
        // 🛡️ 防御（2026-09-03）：TTL 清理/人工清理可能已删掉磁盘图但内存条目仍在，
        // 此时返回已失效 token 会让前端 preview-image 404。命中前先确认 png 还在，
        // 不在则视为脏条目删除并照常走冷路径（重新调 Figma）。
        if (existsSync(join(this._previewCacheDir, `${cached.previewToken}.png`))) {
          this.logger.log(`figma-preview 缓存命中: ${cacheKey}`);
          return {
            success: true,
            imageUrl: `/api/phase2/preview-image/${cached.previewToken}?raw=1`,
            previewToken: cached.previewToken,
            nodeName: cached.nodeName,
            width: cached.width,
            height: cached.height,
          };
        }
        this._previewCache.delete(cacheKey);
        this.logger.warn(`figma-preview 缓存条目磁盘图缺失，已剔除: ${cacheKey} (token=${cached.previewToken})`);
      }
      // 未命中：打印 cacheKey 便于排查「重复请求为何 key 不同」（fileKey/nodeId/scale 任一变化都可见）
      this.logger.log(`figma-preview 缓存未命中: ${cacheKey}`);

      // 下载图片与 getNode 并行：exportImage → fetch 下载串成一路，与 getNode 并行，
      // 省掉原先「先等 exportImage 再串行 fetch」的 getNode 空档（下载 5s+ 是大头，getNode 1s 并行可省）
      // 给 fetch 加超时，避免图片 CDN 卡死把整个请求挂到 nginx 504
      const fetchWithTimeout = async (url: string, timeoutMs = 25000): Promise<Response> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, { signal: controller.signal });
          return res;
        } finally {
          clearTimeout(timer);
        }
      };

      const [node, buffer] = await Promise.all([
        client.getNode(parsed.fileKey, nodeId, { depth: 1 }),
        (async () => {
          const imgUrl = await client.exportImage(parsed.fileKey, apiNodeId, { format: 'png', scale: previewScale });
          const response = await fetchWithTimeout(imgUrl);
          if (!response.ok) {
            throw new Error(`Failed to download preview image: ${response.status}`);
          }
          return Buffer.from(await response.arrayBuffer());
        })(),
      ]);
      const nodeName = node?.name || 'Unknown';
      const width = node?.absoluteBoundingBox?.width || 0;
      const height = node?.absoluteBoundingBox?.height || 0;

      // 6. 写图片到本地缓存，生成 previewToken
      const { randomUUID } = await import('crypto');
      const { mkdir, writeFile, readdir, stat, unlink } = await import('fs/promises');
      const previewToken = randomUUID();
      const cacheDir = join(backendRoot, 'temp-preview-images');
      await mkdir(cacheDir, { recursive: true });

      await writeFile(join(cacheDir, `${previewToken}.png`), buffer);
      this.logger.log(`Preview image cached: ${previewToken}.png (${buffer.length} bytes)`);

      // 5c. 写入内存缓存（后续同一 URL 请求直接命中，免再调 Figma）
      this._previewCache.set(cacheKey, {
        previewToken,
        nodeName: node?.name || 'Unknown',
        width: Math.round(node?.absoluteBoundingBox?.width || 0),
        height: Math.round(node?.absoluteBoundingBox?.height || 0),
        cachedAt: Date.now(),
      });
      // 5d. 持久化磁盘索引（重启后仍可命中未过期预览图，避免冷调 Figma）
      this._persistPreviewCache();

      // 7. 惰性清理：删除超过 TTL 的旧预览图（防生产磁盘被临时图累积撑爆，无需定时器）
      const ttlMs = Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
      try {
        const files = await readdir(cacheDir);
        const now = Date.now();
        const deletedTokens = new Set<string>();
        for (const f of files) {
          if (!f.endsWith('.png')) continue;
          const fp = join(cacheDir, f);
          const st = await stat(fp).catch(() => null);
          if (st && st.isFile() && now - st.mtimeMs > ttlMs) {
            await unlink(fp).catch(() => {});
            deletedTokens.add(f.replace(/\.png$/, ''));
          }
        }
        // 🛡️ 同步清内存缓存与磁盘索引（2026-09-03）：只删磁盘文件不清内存/索引的话，
        // 内存条目仍指向已删 token（preview-image 404），索引里也留死条目；此处一并回收。
        if (deletedTokens.size > 0) {
          let evicted = 0;
          for (const [key, v] of [...this._previewCache.entries()]) {
            if (deletedTokens.has(v.previewToken)) {
              this._previewCache.delete(key);
              evicted++;
            }
          }
          if (evicted > 0) {
            this._persistPreviewCache();
            this.logger.log(`figma-preview TTL 清理: 删 ${deletedTokens.size} 张图, 驱逐 ${evicted} 个缓存条目并回写索引`);
          }
        }
      } catch (e) {
        // 清理失败不影响主流程
      }

      return {
        success: true,
        imageUrl: `/api/phase2/preview-image/${previewToken}?raw=1`,
        previewToken,
        nodeName,
        width: Math.round(width),
        height: Math.round(height),
      };
    } catch (err: any) {
      this.logger.error(`Figma 预览获取失败: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * 递归遍历 Figma 文件树，找到第一个 FRAME/COMPONENT/COMPONENT_SET/INSTANCE 节点
   * @param node - Figma 文件根节点
   * @returns nodeId 或 null
   */
  private _findFirstNodeId(node: any): string | null {
    if (!node) return null;
    const targetTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
    if (node.id && targetTypes.has(node.type)) {
      return node.id;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this._findFirstNodeId(child);
        if (found) return found;
      }
    }
    return null;
  }
}
