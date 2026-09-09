import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { saveComponentMeta } from '../component/component-meta.util';
import { TokenTrackerService } from '../token-usage/token-tracker.service';
import { GenerateVue3Dto } from './dto/generate-vue3.dto';
import { join } from 'path';
import { cp, mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { validateVueSfcDirectory } from '../ai-engine/utils/sfc-syntax-validation.js';
import { InjectModel } from '@nestjs/mongoose';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { tempComponentsDir, vue3ComponentsDir } from '../config/backend-root';
import { AiConfigService } from '../config/config.service';
import { Model } from 'mongoose';
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { resolvePrivateGroupId } from '../common/group-resolver';
import { Types } from 'mongoose';
import { QuotaService } from '../quota/quota.service';

/**
 * Vue3 独立生成服务（与 Phase2 微码服务完全解耦）。
 * 复用 ai-engine 共享节点（figma-connector / visual-parser / refiners / validators / adversarial-checker），
 * 但渲染器固定为 Vue3Engineer，产物为标准 SFC（package/index.vue + 可选子组件），
 * 后处理跳过 less 预编译、不写 component.js，直接落 vue3-components/<groupId>/<sessionId>/。
 */
@Injectable()
export class Vue3Service {
  private readonly logger = new Logger(Vue3Service.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    private readonly componentService: ComponentService,
    private readonly tokenTrackerService: TokenTrackerService,
    private readonly aiConfigService: AiConfigService,
    private readonly quotaService: QuotaService,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {}

  async startGeneration(
    sessionId: string,
    dto: GenerateVue3Dto,
    groupId: string,
    userId?: string,
  ) {
    // 🆕 暂无分组概念时，按用户 uid 落到私人组（与 Phase2/Lite 一致）
    groupId = await resolvePrivateGroupId(groupId, userId, this.groupMemberModel);

    const {
      componentName,
      fileKey,
      nodeId,
      componentId,
      config = {},
      panelType,
      requirementDoc,
      docAnalysis,
    } = dto;

    const finalComponentName = componentName || sessionId;

    // 生成输出路径：temp-components/{groupId}/{componentId或sessionId}-{componentName}/
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
      ? await this.aiConfigService.getMergedAiConfig(userId)
      : null;
    const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
      ...(userAiCfg || {}),
      ...config,
      outputPath,
      target: 'vue3',
      panelType: panelType || 'default-panel',
    });

    this.tasksService.createTask(sessionId, {
      configSnapshot,
      componentId: sessionId,
      groupId,
      componentName: finalComponentName,
      nodeId,
      fileKey,
      target: 'vue3',
      outputPath,
      checkpointStatus: 'none',
      panelKey: panelType || 'default-panel',
      taskType: 'component',
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    this.executeGeneration(sessionId, {
      componentName: finalComponentName,
      fileKey,
      nodeId,
      outputPath,
      config,
      groupId,
      userId,
      panelType,
      requirementDoc,
      docAnalysis,
    }).catch((error) => {
      this.logger.error(
        `Vue3 generation failed: ${error.message}`,
        error.stack,
      );
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
      requirementDoc?: string;
      docAnalysis?: Record<string, any>;
    },
  ) {
    // 声明变量以便在 finally 块中使用
    let outputPath: string | undefined;
    let componentName: string | undefined;
    let genResult: any;
    let genError: any;
    //  实际完成模型（vision/text 各实际用了哪个），供任务详情页展示
    let visionModelUsed: string | null = null;
    let textModelUsed: string | null = null;

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
      } = params;
      outputPath = path;
      componentName = name;

      // 动态导入 Vue3 独立生成图（复制自 Phase2 拓扑，渲染器=Vue3Engineer）
      const graphModule = await import(
        '../ai-engine/graphs/mc-component-graph-vue3.js'
      );
      const { runVue3Generation } = graphModule;

      // 动态导入配置工具
      const aiDefaultsModule = await import(
        '../ai-engine/utils/ai-defaults.js'
      );
      const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;

      this.logger.log(`Starting Vue3 generation for session ${sessionId}`);

      const mergedAiConfig = params.userId
        ? await this.aiConfigService.getMergedAiConfig(params.userId)
        : this.aiConfigService.getAiConfig() || {};
      const finalAiConfig = { ...mergedAiConfig, ...config };
      const effectiveFigmaToken = await this.resolveFigmaToken(
        config?.figmaToken,
        params.userId,
      );
      const resolvedVisionCfg = resolveVisionConfig(finalAiConfig);
      const resolvedTextCfg = resolveTextConfig(finalAiConfig);
      visionModelUsed = resolvedVisionCfg?.model || null;
      textModelUsed = resolvedTextCfg?.model || null;

      genResult = await runVue3Generation({
        componentName,
        fileKey,
        nodeId,
        outputPath,
        panelType: panelType || 'default-panel',
        figmaToken: effectiveFigmaToken,
        visionAIConfig: resolvedVisionCfg,
        textAIConfig: resolvedTextCfg,
        aiConfig: {
          // 向后兼容
          apiKey: config.aiApiKey || process.env.ANTHROPIC_API_KEY,
          baseURL: config.aiBaseURL || process.env.ANTHROPIC_BASE_URL,
          model: config.aiModel || process.env.ANTHROPIC_MODEL,
        },
        sessionId,
        groupId: params.groupId,
        signal: controller.signal,
        onProgress: (data) => {
          // 通过SSE实时推送进度（同时保存到任务状态）
          this.progressService.sendProgress(sessionId, data);
        },
        onTokenUsageRecord: (data) => {
          // 持久化 Token 用量到 MongoDB（异步非阻塞）
          this.tokenTrackerService.recordUsage(data);
        },
        pauseChecker: async () => {
          const task = this.tasksService.getTask(sessionId);
          return task?.status || 'running';
        },
      });

      // 将 Figma 预览图设为统一硬标准：生成成功前必须存在 resources/images/mc-preview.png
      await this.ensurePreviewImage(
        outputPath,
        fileKey,
        nodeId,
        effectiveFigmaToken,
      );
    } catch (error: any) {
      this.logger.error(
        `Vue3 generation failed for session ${sessionId}: ${error.message}`,
      );
      genError = error;
    } finally {
      // 🆕 生成结束（成功/失败/被中断）即注销 AbortController，避免泄漏
      this.tasksService.removeAbortController(sessionId);

      // 🔧 关键修复（2026-08-06）：在 broadcast 前先同步 workspace，
      // 避免前端收到 complete 后立即加载组件时找不到文件（竞态条件）
      if (!genError && outputPath && componentName) {
        const hasEntry = existsSync(join(outputPath, 'package', 'index.vue'));
        if (hasEntry) {
          try {
            await this.copyToWorkspaceVue3(outputPath, componentName, params.groupId);
          } catch (syncErr: any) {
            this.logger.warn(
              `Workspace sync failed before broadcast for ${sessionId}: ${syncErr.message}`,
            );
            // 不设 genError：sync 失败不影响 complete 广播，预览可能延迟但不丢数据
          }
        }
      }

      // 先广播终态事件，确保前端 SSE 立即收到 complete/error
      if (genError) {
        // 🆕 用户极速通过：speedPassTask 已广播 complete，跳过失败广播避免覆盖完成态
        const t = this.tasksService.getTask(sessionId);
        if (t?.userApproved) {
          this.logger.log(`[Vue3] 任务 ${sessionId} 用户已极速通过，跳过失败广播`);
        } else {
          this.progressService.sendError(sessionId, genError);
        }
      } else {
        this.progressService.sendComplete(sessionId, {
          ...genResult,
          taskId: sessionId,
          componentId: sessionId,
          groupId: params.groupId,
          target: 'vue3',
          _completionModels: { visionModel: visionModelUsed, textModel: textModelUsed },
        });
        
        // 生成成功：记录配额（只有成功生成的组件才占用额度）
        if (params.userId) {
          this.quotaService.recordSuccess(params.userId, 'vue3');
        }
      }

      // 异步执行剩余 post-processing（LESS 门禁 + DB 保存，不阻塞终态广播）
      ;(async () => {
        if (genError) return;

        const hasEntry =
          !!outputPath && existsSync(join(outputPath, 'package', 'index.vue'));
        if (!outputPath || !componentName || !hasEntry) {
          return;
        }

        try {
          // 🆕 LESS 编译门禁：验证并自动修复 SFC 内 <style lang="less"> 块的语法错误
          // 注意：workspace 已同步，此修复针对的是 workspace 中的文件（同步后 + db保存前）
          await this.validateVue3Less(outputPath, sessionId);

          // S10: 持久化 component-meta.json 到 workspace，供接口对接时自动预填。
        // 无条件写入（即使 requirementDoc/docAnalysis 为空也写），确保所有组件都有 meta 文件，
        // 避免 ApiBindingWizard 打开时出现 404 噪音。
        await saveComponentMeta(
          params.groupId,
          sessionId,
          'vue3',
          params.requirementDoc,
          params.docAnalysis,
          //  P0-3: 透传视觉分析降级标志（视觉超时→Figma 兜底时 degraded=true 且 layoutSource='figma'）
          {
            degraded: !!genResult?._visualDegraded,
            layoutSource: genResult?._visualLayoutSource || undefined,
            degradeReason: genResult?._visualDegradeReason || undefined,
          },
        );
        } catch (postErr: any) {
          this.logger.warn(
            `Preview post-processing failed for ${sessionId}: ${postErr.message}`,
          );
        }

        // 保存组件记录到数据库（供组件库列表展示）
        try {
          // 解析 creatorId：优先使用登录用户，否则从群组成员中获取
          let resolvedCreatorId = params.userId;
          let resolvedGroupId = params.groupId;

          if (!resolvedCreatorId && resolvedGroupId) {
            // 无登录用户时，从群组成员中获取第一个成员作为创建者
            const firstMember = await this.groupMemberModel
              .findOne({ groupId: resolvedGroupId })
              .exec();
            if (firstMember) {
              resolvedCreatorId = firstMember.userId.toString();
              this.logger.log(`Resolved creatorId to ${resolvedCreatorId} from group membership`);
            }
          }

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
              const doc = cacheData.document || cacheData;
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
            componentName || 'Vue3 生成组件',
            resolvedGroupId,
            resolvedCreatorId,
            {
              type: 'vue3',
              target: 'vue3',
              taskId: sessionId,
              componentId: sessionId,
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
   * Vue3 组件专属复制：将 package/ 与 resources/ 原样发布到
   * vue3-components/<groupId>/<sessionId>/，保持 package/index.vue 唯一入口。
   * 同时落后端 workspace（持久化）与前端 workspace（实时预览）。
   *
   * 🆕 同步复制 .mc-gen/cache/figma-node-data.json → _figma-size.json（根目录）：
   *   1) 该文件包含 Figma 节点的 absoluteBoundingBox，preview 页用它作为
   *      metadata.figmaWidth 缺失时的尺寸兜底。少了它，Vue3 预览会全屏占满。
   *   2) 不能放回 .mc-gen/ 隐藏目录：NestJS 通配符路由 @Get(':groupId/:componentId/*path')
   *      不支持「.」开头的路径段，prod 下 /api/preview 会返回 404。改放根目录非隐藏名
   *      _figma-size.json 同时兼容 dev (Vite /__raw) 与 prod (NestJS 静态文件)。
   */
  private async copyToWorkspaceVue3(
    outputPath: string,
    sessionId: string,
    groupId: string,
  ): Promise<void> {
    try {
      const packageDir = join(outputPath, 'package');
      const resourcesDir = join(outputPath, 'resources');
      const figmaCacheFile = join(
        outputPath,
        '.mc-gen',
        'cache',
        'figma-node-data.json',
      );
      const backendWsPath = join(
        vue3ComponentsDir,
        groupId,
        sessionId,
      );
      const frontendWsPath = join(
        resolveFrontendWorkspace(),
        'vue3-components',
        groupId,
        sessionId,
      );

      if (!existsSync(join(packageDir, 'index.vue'))) {
        this.logger.error(`Vue3 入口缺失: ${join(packageDir, 'index.vue')}`);
        return;
      }
      const syntaxErrors = validateVueSfcDirectory(packageDir);
      // 🔧 不因样式变量/非致命 SFC 问题阻断预览复制（与 phase2/lite 对齐）
      if (syntaxErrors.length > 0) {
        this.logger.warn(
          `[copyToWorkspaceVue3] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断复制）: ${syntaxErrors.slice(0, 5).join('; ')}`,
        );
      }

      for (const targetPath of [backendWsPath, frontendWsPath]) {
        await mkdir(targetPath, { recursive: true });

        // 清理旧结构残留，避免新旧入口共存
        for (const legacy of [
          join(targetPath, 'index.vue'),
          join(targetPath, 'components'),
          join(targetPath, 'package', 'resources'),
          join(targetPath, '_figma-size.json'),
        ]) {
          if (existsSync(legacy)) {
            try {
              const { rm } = await import('fs/promises');
              await rm(legacy, { recursive: true, force: true });
            } catch {}
          }
        }

        await cp(packageDir, join(targetPath, 'package'), { recursive: true });
        if (existsSync(resourcesDir)) {
          await cp(resourcesDir, join(targetPath, 'resources'), { recursive: true });
        }

        // 🆕 复制 figma-node-data.json 到 workspace 根目录（重命名为 _figma-size.json），
        // 供 preview 页读 absoluteBoundingBox，绕开「数据库 metadata 缺失/写库失败」导致
        // 的「Vue3 预览全屏占满」问题。
        if (existsSync(figmaCacheFile)) {
          await cp(figmaCacheFile, join(targetPath, '_figma-size.json'));
        }
      }

      this.logger.log(
        `Vue3 component copied to workspace: ${groupId}/${sessionId} (package/index.vue + resources + _figma-size.json)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy vue3 component to workspace: ${error.message}`,
        error.stack,
      );
      // 不抛出错误，避免影响主流程
    }
  }

  private async resolveFigmaToken(
    figmaToken?: string,
    userId?: string,
  ): Promise<string> {
    const directToken = typeof figmaToken === 'string' ? figmaToken.trim() : '';
    if (directToken) {
      return directToken;
    }

    const cfg = userId
      ? await this.aiConfigService.getMergedAiConfig(userId)
      : this.aiConfigService.getAiConfig() || {};
    const savedToken = cfg?.figmaToken;
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

  /**
   * LESS 编译门禁：验证 SFC 中 <style lang="less"> 块的语法正确性。
   *
   * AI 生成代码时常漏写分号（如 `background: linear-gradient(...)` 行末），
   * 导致 Vite 加载预览时 LESS 编译失败 → iframe load-error → 质量门禁阻断。
   *
   * 此处做 standalone LESS 编译预检，编译失败时尝试自动修复（补分号 + 激进去噪），
   * 修复失败则阻断后续 copyToWorkspace + DB 保存，防止无效产物污染 workspace。
   */
  private async validateVue3Less(
    outputPath: string,
    sessionId: string,
  ): Promise<void> {
    const { readdir, stat } = await import('fs/promises');
    const packageDir = join(outputPath, 'package');
    if (!existsSync(packageDir)) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const less = require('less');

    const vueFiles: string[] = [];
    async function collectVue(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await collectVue(full);
        } else if (entry.name.endsWith('.vue')) {
          vueFiles.push(full);
        }
      }
    }
    await collectVue(packageDir);

    if (vueFiles.length === 0) return;

    const hasError = false;
    for (const vuePath of vueFiles) {
      const content = await readFile(vuePath, 'utf-8');
      const styleRegex = /<style[^>]*lang="less"[^>]*>([\s\S]*?)<\/style>/gi;
      let match: RegExpExecArray | null;
      let fileHasError = false;
      let modified = content;

      while ((match = styleRegex.exec(content)) !== null) {
        const lessCode = match[1];
        try {
          await less.render(lessCode, { filename: vuePath });
        } catch (err: any) {
          fileHasError = true;
          this.logger.warn(
            `[LESS门禁] ${vuePath} 编译失败: ${err.message} (line ${err.line || '?'})`,
          );
        }
      }

      if (fileHasError) {
        // 自动修复：尝试补分号 — 匹配「属性值行末无分号 + 紧跟下一个属性声明」的模式
        const fixed = modified.replace(
          /([a-z-]+:\s*[^;{}]+)(\n\s+[a-z-]+:)/gi,
          '$1;$2',
        );

        // 二次验证修复后是否通过
        const reStyleRegex = /<style[^>]*lang="less"[^>]*>([\s\S]*?)<\/style>/gi;
        let reMatch: RegExpExecArray | null;
        let allPassed = true;
        while ((reMatch = reStyleRegex.exec(fixed)) !== null) {
          try {
            await less.render(reMatch[1], { filename: vuePath });
          } catch {
            allPassed = false;
            break;
          }
        }

        if (allPassed) {
          await writeFile(vuePath, fixed, 'utf-8');
          this.logger.log(
            `[LESS门禁] ${vuePath} 自动修复成功（补分号）`,
          );
        } else {
          this.logger.error(
            `[LESS门禁] ${vuePath} 修复失败，阻断发布`,
          );
          throw new Error(
            `LESS 编译失败且无法自动修复: ${vuePath}。AI 生成的样式存在语法错误，请重新生成。`,
          );
        }
      }
    }
  }

}
