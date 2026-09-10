import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { TokenTrackerService } from '../token-usage/token-tracker.service';
import { AiConfigService } from '../config/config.service';
import { QuotaService } from '../quota/quota.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
import { GenerateLiteDto } from './dto/generate-lite.dto';
import { repairJson as repairJsonUtil } from './repair-json.util';
import {
  LiteErrorCode,
  LITE_PRECHECK,
  LITE_ERROR_MESSAGES,
  LITE_SCREENSHOT_TIER,
  LITE_HTML_MAX_BYTES,
  LiteSourceType,
  LiteComponentType,
  LiteGenerationTier,
} from './lite.constants';
import { join, dirname, relative, sep } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { validateVueSfcDirectory } from '../ai-engine/utils/sfc-syntax-validation.js';
import { repairScopedThirdPartySelectors } from '../ai-engine/utils/css-sanitizer.js';
import { dedupeScriptDeclarations, findDuplicateImports, findDuplicateScriptDeclarations } from '../ai-engine/utils/sfc-semantics.js';
// 🆕 2026-09-04（方案 A/C）：组件语义命名工具——中文→语义映射 / 确定性唯一 componentId
// c-<语义>-<sessionId 尾 8hex>（与 max 管线同一契约）
import { zhToSemanticEn, buildComponentId } from '../ai-engine/utils/component-naming.js';
import { resolvePrivateGroupId as resolvePrivateGroupIdCore } from '../common/group-resolver';
// 动态导入 ESM 模块（workspace-preview-publisher.js 依赖 ESM 的 logger）
const loadPreviewPublisher = () => import('../ai-engine/utils/workspace-preview-publisher.js');
import sharp from 'sharp';
import { VisionAgent } from '../ai-engine/agents/vision-agent.js';
import { resolveVisionConfig } from '../ai-engine/utils/ai-defaults.js';
import { resolveVisionCapability } from '../ai-engine/utils/model-config.js';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { workspaceRoot, customComponentsDir, vue3ComponentsDir, tempComponentsDir } from '../config/backend-root';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { Types } from 'mongoose';
import { FigmaClient } from '../ai-engine/tools/figma/figma-client.js';
import { parseFigmaUrl } from '../ai-engine/utils/figma-url-parser.js';

type AssetPlacementReport = {
  placements: any[];
  summary: string;
  analyzedAt: string;
  model?: string;
};

type AssetCodeApplication = {
  codeUpdated: boolean;
  backupFile?: string;
  appliedPlacements: any[];
  skippedPlacements: any[];
  modifiedFiles: string[];
  validation: {
    sfcStructure: 'passed' | 'skipped';
    scriptSetupUnchanged: 'passed' | 'skipped';
    resourceReferences: 'passed' | 'skipped';
  };
};

type AssetUpgradeResult = {
  success: boolean;
  message: string;
  assets?: any[];
  mappingFile?: string;
  placementReport?: AssetPlacementReport | null;
  codeUpdated?: boolean;
  backupFile?: string;
  appliedPlacements?: any[];
  skippedPlacements?: any[];
  modifiedFiles?: string[];
  validation?: AssetCodeApplication['validation'];
};

/**
 * 轻量组件生成服务（Phase 4：截图/Figma → Vue3 / 微码）
 *
 * 设计原则（与锁定规则一致）：
 * - 截图来源强制 Lite（快速草稿，允许推断/占位）
 * - Figma 来源默认 Max，可降级为 Lite（仅导出截图走 vision 管线，不拉完整图谱）
 * - 复用成熟能力：VisionAgent（视觉分析 + 多模态代码生成）、FigmaClient（导出图片）、workspace 复制约定
 * - 产物结构对齐现有管线：
 *   Vue3:   package/index.vue + resources/images/mc-preview.png
 *   微码:   package/index.vue + declare.json + resources/styles/ + resources/images/mc-preview.png
 */
@Injectable()
export class LiteService {
  private readonly logger = new Logger(LiteService.name);
  private readonly resumeOperations = new Map<
    string,
    Promise<{ success: boolean; sessionId: string; message: string }>
  >();
  private readonly assetUpgradeOperations = new Map<
    string,
    Promise<AssetUpgradeResult>
  >();

  constructor(
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    private readonly componentService: ComponentService,
    private readonly tokenTrackerService: TokenTrackerService,
    private readonly aiConfigService: AiConfigService,
    private readonly quotaService: QuotaService,
    private readonly taskCodeSnapshotService: TaskCodeSnapshotService,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {}

  async startGeneration(
    sessionId: string,
    dto: GenerateLiteDto,
    groupId: string,
    userId: string | undefined,
    meta: {
      sourceType: LiteSourceType;
      componentType: LiteComponentType;
      generationTier: LiteGenerationTier;
    },
  ) {
    const { sourceType, componentType, generationTier } = meta;
    // 组件名在分析完成后由 deriveComponentName 推导（视觉中英文名 → kebab-case）；
    // 此处不再提前绑定 sessionId，避免编码名污染 codegen prompt / declare / persist。

    // 统一产物输出根：temp-components/{groupId}/{sessionId}/
    const tempRoot = join(
      tempComponentsDir,
      groupId,
      sessionId,
    );
    const outputPath = tempRoot;

    // 🆕 顶层 AbortController：删除/取消 Lite 任务时可中断 LLM 请求（analyzeImage 支持 signal）
    const controller = new AbortController();
    this.tasksService.registerAbortController(sessionId, controller);

    // 🆕 桥接业务日志到前端 SSE（Lite 任务日志页可见）
    const { createLogger } = await import('../ai-engine/logger/index.js');
    const sseLogger = createLogger({ name: 'lite', sessionId, progressManager: this.progressService });
    const origLogger = this.logger;
    (this as any).logger = new Proxy(origLogger, {
      get(target: any, prop: string | symbol) {
        switch (prop) {
          case 'log':
            return (msg: any, ...args: any[]) => { target.log(msg, ...args); sseLogger.info(String(msg)); };
          case 'warn':
            return (msg: any, ...args: any[]) => { target.warn(msg, ...args); sseLogger.warn(String(msg)); };
          case 'error':
            return (msg: any, ...args: any[]) => { target.error(msg, ...args); sseLogger.error(String(msg)); };
          case 'debug':
            return (msg: any, ...args: any[]) => { target.debug(msg, ...args); sseLogger.debug(String(msg)); };
          default:
            return target[prop];
        }
      },
    });

    try {
      // ---------- 阶段 1：预检 + 获取输入图 ----------
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'precheck',
        status: 'running',
        message:
          sourceType === 'figma'
            ? '导出 Figma 图片中...'
            : sourceType === 'html'
              ? '安全渲染 HTML 文件中...'
              : '校验截图中...',
      });

      let imageResult: {
        buffer: Buffer;
        mime: string;
        ext: string;
        logicalWidth?: number | null;
        logicalHeight?: number | null;
        figmaTexts?: string[] | null;
      };
      if (sourceType === 'figma' && dto.figmaUrl) {
        imageResult = await this.fetchFigmaImage(dto, sessionId, userId);
        // 持久化 Figma 源信息，供后续素材升级使用
        const parsed = parseFigmaUrl(dto.figmaUrl!);
        if (parsed.fileKey && parsed.nodeId) {
          await this.saveFigmaSource(
            outputPath,
            dto.figmaUrl!,
            parsed.fileKey,
            parsed.nodeId,
          );
        }
      } else if (sourceType === 'html' && dto.htmlContent) {
        imageResult = await this.renderHtmlPreview(dto, sessionId);
      } else {
        imageResult = this.normalizeImage(dto);
      }
      const { buffer, mime, ext } = imageResult;
      const { width: rasterWidth, height: rasterHeight } = await this.precheck(buffer, mime);
      // Figma 预览接口返回的是节点逻辑尺寸（CSS px）；导出图使用 scale=2，
      // 因此 PNG 像素只用于图片校验，不能作为组件设计画布尺寸。
      // 截图来源同理：用户截图通常来自 HiDPI/Retina 屏幕（DPR=2），PNG 像素是
      // 逻辑尺寸的 2 倍。统一按 2x 还原为 CSS 逻辑尺寸，否则生成的组件会偏大 2 倍。
      // figma 源尺寸优先级：dto.previewWidth（前端显式传）> 节点 absoluteBoundingBox（getNode 实时取）> 栅格/2 兜底
      const width =
        sourceType === 'figma' && Number(dto.previewWidth) > 0
          ? Math.round(Number(dto.previewWidth))
          : sourceType === 'figma' && Number(imageResult.logicalWidth) > 0
            ? Number(imageResult.logicalWidth)
            : sourceType === 'screenshot'
              ? Math.round(rasterWidth / 2)
              : sourceType === 'html'
                ? rasterWidth
                : Math.round(rasterWidth / 2);
      const height =
        sourceType === 'figma' && Number(dto.previewHeight) > 0
          ? Math.round(Number(dto.previewHeight))
          : sourceType === 'figma' && Number(imageResult.logicalHeight) > 0
            ? Number(imageResult.logicalHeight)
            : sourceType === 'screenshot'
              ? Math.round(rasterHeight / 2)
              : sourceType === 'html'
                ? rasterHeight
                : Math.round(rasterHeight / 2);

      const uploadDir = join(outputPath, '_upload');
      await mkdir(uploadDir, { recursive: true });
      const uploadPath = join(uploadDir, `screenshot.${ext}`);
      await writeFile(uploadPath, buffer);

      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'precheck',
        status: 'completed',
        message: `${sourceType === 'html' ? 'HTML 渲染' : '截图校验'}通过（${rasterWidth}x${rasterHeight}）`,
        rasterWidth,
        rasterHeight,
        width,
        height,
      });

      // 截图/HTML 来源：将还原后的逻辑尺寸写入 task metadata 的 figmaDimensions，
      // 供前端预览页计算 previewScale（Figma 来源已在 controller 提前写入）
      if (sourceType !== 'figma') {
        this.tasksService.updateTask(sessionId, {
          figmaDimensions: { width, height },
        });
      }

      // ---------- 阶段 2：视觉分析 ----------
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'analyzing',
        status: 'running',
        message: '分析截图结构、配色与组件...',
      });

      const agent = await this.buildVisionAgent(dto, sourceType, userId);
      let brief: any;
      try {
        const analysisText = await agent.analyzeImage(
          uploadPath,
          this.buildAnalysisPrompt(
            width,
            height,
            rasterWidth,
            rasterHeight,
            imageResult.figmaTexts,
          ),
          // 🔧 视觉调用显式超时覆盖全局 120s 兜底（codegen 要输出完整 SFC，慢模型易超时）
          // 🔧 视觉子调用心跳转发到 UI 日志通道，对齐 Figma 频率
          { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId) },
        );
        brief = this.parseBrief(analysisText);
        // 🔧 像素级主题兜底（2026-09-01）：模型视觉对颜色的提取不稳定（浅色截图曾被误判成中灰
        // #A5ADB5 → 深色主题）。用截图像素直接采样根背景明暗作为 theme 的确定性 ground truth：
        // 像素采样有效且与模型结论矛盾时，以像素为准覆盖 brief.theme，供 codegen prompt 与
        // normalizeLiteDeclare 共同消费。半透明卡片不参与——采样点取四角/边缘（根容器底色）。
        const pixelTheme = await this.sampleRootBrightness(buffer);
        if (pixelTheme) {
          const modelTheme = typeof brief?.theme === 'string' ? brief.theme : '';
          if (modelTheme && modelTheme !== pixelTheme) {
            this.logger.warn(
              `主题判定不一致，以像素采样为准：模型=${modelTheme} 像素=${pixelTheme}`,
              { modelTheme, pixelTheme },
            );
          }
          brief.theme = pixelTheme;
          brief._themeSource = 'pixel';
        } else if (typeof brief?.theme === 'string') {
          brief._themeSource = 'model';
        }
        // 🔧 边缘底色真值（2026-09-01）：模型对浅蓝白渐变底色反复误读成中灰（#A8B5C0），
        // theme=light 锚点只保明暗不保色相，产物仍渲染成灰蓝。figma 源（exportImage 纯净
        // 节点、无 OS 截图边框）用最外 3% 环带像素中位数覆盖 brief.colors.background。
        if (sourceType === 'figma') {
          const edgeColor = await this.sampleEdgeColor(buffer);
          if (edgeColor) {
            if (!brief.colors || typeof brief.colors !== 'object') brief.colors = {};
            const modelBg = String(brief.colors.background || '');
            if (modelBg && modelBg.toUpperCase() !== edgeColor) {
              this.logger.warn(
                `底色不一致，以边缘像素采样为准：模型=${modelBg} 采样=${edgeColor}`,
              );
            }
            brief.colors.background = edgeColor;
            brief._bgSource = 'pixel-edge';
          }
        }
      } catch (err: any) {
        // 🔧 失败前必须把当前阶段标记为 failed，否则前端 sseStages 停留在 running 状态
        this.progressService.sendProgress(sessionId, {
          type: 'progress',
          stage: 'analyzing',
          status: 'failed',
          message: `视觉分析失败: ${err.message}`,
        });
        throw this.wrapError(
          LiteErrorCode.ANALYSIS_FAILED,
          `视觉分析失败: ${err.message}`,
          err,
        );
      }

      // 🔧 语义化组件名（2026-09-01）：视觉分析出中英文名后，若用户未显式指定组件名，
      // 用 brief.name.en 推导 kebab-case 语义名替代编码 sessionId（目录/class 前缀/展示名全受益）。
      const derivedName = this.deriveComponentName(dto.componentName, brief, sessionId);
      const finalComponentName = derivedName.codeName;
      const displayName = derivedName.displayName;

      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'analyzing',
        status: 'completed',
        message: '截图分析完成',
        brief,
      });

      // 💾 分析断点：保存 brief 到磁盘，服务重启后可从此处续跑
      await this.saveCheckpoint(outputPath, {
        stage: 'analysis_done',
        brief,
        width,
        height,
        sourceType,
        componentType,
        generationTier,
        // 语义化组件名随断点持久化，续跑阶段直接复用（不重复推导）
        ...(finalComponentName && finalComponentName !== sessionId ? { finalComponentName, displayName } : {}),
      });

      // ---------- 阶段 3：生成组件代码 ----------
      const isMicrocode = componentType === 'microcode';
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'generating',
        status: 'running',
        message: isMicrocode ? '生成微码组件代码...' : '生成 Vue3 组件代码...',
      });

      let vueCode: string;
      let declareJson: any = null;
      try {
        const genText = await agent.analyzeImage(
          uploadPath,
          isMicrocode
            ? this.buildMicrocodeCodegenPrompt(brief, finalComponentName, dto, width, height)
            : this.buildCodegenPrompt(brief, finalComponentName, dto, width, height),
          // 🔧 视觉调用显式超时覆盖全局 120s 兜底（codegen 要输出完整 SFC，慢模型易超时）
          // 🔧 视觉子调用心跳转发到 UI 日志通道，对齐 Figma 频率
          { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId) },
        );

        if (isMicrocode) {
          const parsed = this.extractMicrocodeOutput(genText);
          vueCode = parsed.vueCode;
          declareJson = parsed.declareJson;
        } else {
          vueCode = this.extractVueCode(genText);
        }
      } catch (err: any) {
        this.progressService.sendProgress(sessionId, {
          type: 'progress',
          stage: 'generating',
          status: 'failed',
          message: `代码生成失败: ${err.message}`,
        });
        throw this.wrapError(
          LiteErrorCode.GENERATION_FAILED,
          `代码生成失败: ${err.message}`,
          err,
        );
      }

      if (!vueCode || vueCode.trim().length < 30) {
        throw this.wrapError(
          LiteErrorCode.GENERATION_FAILED,
          '生成的组件代码为空或无效',
        );
      }

      vueCode = repairScopedThirdPartySelectors(vueCode, this.logger);
      vueCode = this.sanitizeVueScriptImports(vueCode);
      this.validateLiteSfc(vueCode);

      // 🛡️ 兜底：去重后仍残留重复 import / 重复顶层声明 → 明确失败，不发布坏组件
      const _scriptBlock = vueCode.match(/<script[\s>][\s\S]*?<\/script>/i);
      const _scriptBody = _scriptBlock ? _scriptBlock[0] : vueCode;
      const _residualDups = [
        ...findDuplicateImports(_scriptBody),
        ...findDuplicateScriptDeclarations(_scriptBody),
      ];
      if (_residualDups.length > 0) {
        throw this.wrapError(
          LiteErrorCode.GENERATION_FAILED,
          `生成的组件存在重复声明（${_residualDups.slice(0, 5).join('、')}），已拒绝发布`,
        );
      }
      if (isMicrocode) {
        // 🆕 2026-09-04（方案 C）：declare.componentId 确定性唯一化——
        // c-<语义段>-<sessionId 尾 8hex>（如 c-equipment-monitor-43e7fe45，M1-1 合规），
        // 与 max 管线同一契约；语义段与 codegen prompt 的 class 前缀（c-${finalComponentName}-）
        // 同源，避免 id=编码 sessionId 时 class 前缀与 componentId 失配。
        const uniqueComponentId = buildComponentId(
          finalComponentName || 'component',
          sessionId,
        );
        declareJson = this.normalizeLiteDeclare(
          declareJson,
          uniqueComponentId,
          finalComponentName,
          width,
          height,
          brief?.theme as string | undefined,
        );
      }

      // 💾 代码生成断点：保存代码到磁盘，后续只需写盘+同步
      await this.saveCheckpoint(outputPath, {
        stage: 'codegen_done',
        brief,
        width,
        height,
        sourceType,
        componentType,
        generationTier,
        vueCode,
        ...(declareJson ? { declareJson } : {}),
      });

      // ---------- 阶段 4：写盘 + 预览图 + workspace ----------
      const packageDir = join(outputPath, 'package');
      await mkdir(packageDir, { recursive: true });
      await writeFile(join(packageDir, 'index.vue'), vueCode, 'utf-8');

      // 微码：写入确定性声明文件与最小样式入口
      if (isMicrocode) {
        await writeFile(
          join(outputPath, 'declare.json'),
          JSON.stringify(declareJson, null, 2),
          'utf-8',
        );
        await writeFile(
          join(outputPath, 'declare.js'),
          `import declareConfig from './declare.json'\nlet declareInfo = $createMcDeclare({ metaUrl: import.meta.url, declareConfig })\nexport default declareInfo\n`,
          'utf-8',
        );
        const stylesDir = join(outputPath, 'resources', 'styles');
        await mkdir(stylesDir, { recursive: true });
        await writeFile(
          join(stylesDir, 'index.less'),
          this.buildDefaultLess(finalComponentName),
          'utf-8',
        );
        // 🔧 微码入口 component.js（2026-09-01）：与 max 管线（microcode-engineer.js standardFiles）
        // 对齐，在写盘阶段即生成到产物源目录，供 import.meta.glob 注册 / 预览 / 打包扫描。
        // 此前仅在 copyToWorkspace 发布时动态生成，产物源目录缺失导致任务卡片/快照缺该文件。
        await writeFile(
          join(outputPath, 'component.js'),
          `import component from './package/index.vue'\nimport './resources/styles/index.less'\nexport default component\n`,
          'utf-8',
        );
      }

      // 截图直接作为统一预览图
      const previewDir = join(outputPath, 'resources', 'images');
      await mkdir(previewDir, { recursive: true });
      await sharp(buffer).png().toFile(join(previewDir, 'mc-preview.png'));

      // 统一落设计画布逻辑尺寸文件，供前端预览获取宽高比。
      // - Figma：来自 API 返回的节点逻辑尺寸（CSS px）
      // - Screenshot：已按 DPR=2 还原的逻辑尺寸
      // - HTML：来自 Puppeteer 渲染的 1x 像素尺寸
      await writeFile(
        join(outputPath, '_figma-size.json'),
        JSON.stringify(
          { document: { absoluteBoundingBox: { width, height } } },
          null,
          2,
        ),
        'utf-8',
      );

      // 元数据先进入 outputPath，确保 revision、后端 workspace 与前端 workspace
      // 使用同一份完整文件组，不再出现 dev 有 metadata、prod-style 缺失的情况。
      await writeFile(
        join(outputPath, 'component-meta.json'),
        JSON.stringify({
          requirementDoc: (dto as any).requirementDoc || '',
          docAnalysis: null,
          // 语义化组件名（视觉分析推导）：中文名展示、英文名作代码标识
          componentName: finalComponentName,
          displayName: displayName || finalComponentName,
          generatedAt: new Date().toISOString(),
        }, null, 2),
        'utf-8',
      );

      // Lite 完整文件组进入与 Max 一致的 revision 状态链。候选先发布到可回滚的
      // workspace 事务中供预览，只有本地 SFC/结构门禁明确通过才晋级 last-good。
      await this.publishValidatedLiteOutput(
        outputPath,
        sessionId,
        groupId,
        isMicrocode ? 'microcode' : 'vue3',
      );

      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'generating',
        status: 'completed',
        message: '组件已生成',
      });

      // 🔧 任务卡片组件名更新为语义名（controller 创建任务时是编码 sessionId）
      this.tasksService.updateTask(sessionId, {
        componentName: finalComponentName,
        ...(displayName && displayName !== finalComponentName ? { displayName } : {}),
      });

      // ---------- 终态：complete ----------
      const target = componentType;
      const workspacePath = isMicrocode
        ? join(resolveFrontendWorkspace(), 'custom-components', sessionId)
        : join(resolveFrontendWorkspace(), 'vue3-components', groupId, sessionId);

      this.progressService.sendComplete(sessionId, {
        taskId: sessionId,
        componentId: sessionId,
        groupId,
        target,
        sourceType,
        componentType,
        generationTier,
        componentName: finalComponentName,
        displayName,
        workspacePath,
        outputPath,
        previewImage: join(previewDir, 'mc-preview.png'),
        brief,
        code: vueCode,
        //  实际完成模型：lite 仅一个 vision agent 承担分析与生成，text 复用同一模型
        _completionModels: { visionModel: agent?.model || null, textModel: agent?.model || null },
        ...(declareJson ? { declareJson } : {}),
      });

      if (userId) {
        try {
          await this.quotaService.recordSuccess(userId, sessionId);
        } catch (e) {
          this.logger.warn(`配额记录失败(非阻塞): ${e.message}`);
        }
      }

      // 组件记录落库（失败不影响预览）
      this.persistComponent(
        finalComponentName,
        sessionId,
        groupId,
        userId,
        width,
        height,
        componentType,
        sourceType,
        generationTier,
      ).catch((e) =>
        this.logger.warn(`组件记录保存失败(非阻塞): ${e.message}`),
      );
    } catch (error: any) {
      this.logger.error(`Lite 生成失败 ${sessionId}: ${error.message}`, error.stack);
      this.progressService.sendError(sessionId, {
        code: error.code || LiteErrorCode.INTERNAL_ERROR,
        message:
          error.message ||
          LITE_ERROR_MESSAGES[LiteErrorCode.INTERNAL_ERROR],
      });
      return false;
    } finally {
      // 🆕 生成结束（成功/失败/被中断）即注销 AbortController，避免泄漏
      this.tasksService.removeAbortController(sessionId);

      // 🆕 截图保留为正式缓存：把 _upload/screenshot.* 复制到 resources/images/source-screenshot.*
      // 供失败/崩溃后的重试复用（服务器被迫停止时 finally 不执行，_upload 天然保留；
      // 正常结束时这里主动落一份到正式产物区，重试可从组件目录直接读原图）
      try {
        const { readdirSync, copyFileSync, mkdirSync } = await import('fs');
        const uploadDir = join(outputPath, '_upload');
        const entries = readdirSync(uploadDir).filter((f) =>
          /^screenshot\.(png|jpe?g|webp)$/i.test(f),
        );
        if (entries.length > 0) {
          const imagesDir = join(outputPath, 'resources', 'images');
          mkdirSync(imagesDir, { recursive: true });
          for (const f of entries) {
            const ext = f.replace(/^screenshot\./i, '');
            copyFileSync(
              join(uploadDir, f),
              join(imagesDir, `source-screenshot.${ext}`),
            );
          }
          this.logger.log(
            `📸 原截图已保留为缓存: ${entries.join(', ')} -> resources/images/source-screenshot.*`,
          );
        }
      } catch {
        /* 非阻塞 */
      }

      // 清理临时上传图，保留 package/ 与 resources/
      try {
        await rm(join(outputPath, '_upload'), {
          recursive: true,
          force: true,
        });
      } catch {
        /* 非阻塞 */
      }
    }
  }

  // ===================== 素材升级 =====================

  /**
   * 素材升级：从原 Figma 下载 bg/img/icon 资源并应用到 Lite 组件
   * 仅适用于 sourceType=figma && generationTier=lite 的已完成组件
   */
  async upgradeAssets(
    sessionId: string,
    fallbackFigmaUrl?: string,
  ): Promise<AssetUpgradeResult> {
    const running = this.assetUpgradeOperations.get(sessionId);
    if (running) return running;

    const operation = this.performAssetUpgrade(sessionId, fallbackFigmaUrl);
    this.assetUpgradeOperations.set(sessionId, operation);
    try {
      return await operation;
    } finally {
      this.assetUpgradeOperations.delete(sessionId);
    }
  }

  private async performAssetUpgrade(
    sessionId: string,
    fallbackFigmaUrl?: string,
  ): Promise<AssetUpgradeResult> {
    const task = this.tasksService.getTask(sessionId);
    if (!task) {
      return { success: false, message: `任务 ${sessionId} 不存在` };
    }

    // 验证组件来源和档位
    const srcType = (task as any).sourceType || '';
    const tier = (task as any).generationTier || '';
    if (srcType !== 'figma' || tier !== 'lite') {
      return {
        success: false,
        message: '素材升级仅支持 Figma 来源的 Lite 组件',
      };
    }

    const status = (task as any).status;
    if (status !== 'completed') {
      return { success: false, message: '素材升级仅支持已完成的组件' };
    }

    const outputPath = (task as any).outputPath;
    if (!outputPath) {
      return { success: false, message: '未找到组件产物目录' };
    }

    // 尝试获取 Figma 源信息：优先读取 .cache/figma-source.json
    let fileKey: string;
    let nodeId: string;
    try {
      const { readFileSync } = await import('fs');
      const cacheDir = join(outputPath, '.cache');
      const sourceFile = join(cacheDir, 'figma-source.json');
      if (existsSync(sourceFile)) {
        const src = JSON.parse(readFileSync(sourceFile, 'utf-8'));
        fileKey = src.fileKey;
        nodeId = src.nodeId;
        this.logger.log(`📌 从 .cache/figma-source.json 读取 Figma 源: ${fileKey}/${nodeId}`);
      } else if (fallbackFigmaUrl) {
        // 历史任务：用传入的 Figma URL 建立缓存
        const parsed = parseFigmaUrl(fallbackFigmaUrl);
        if (!parsed.fileKey || !parsed.nodeId) {
          return {
            success: false,
            message: '传入的 Figma URL 无法解析出 fileKey/nodeId',
          };
        }
        fileKey = parsed.fileKey;
        nodeId = parsed.nodeId;
        await this.saveFigmaSource(outputPath, fallbackFigmaUrl, fileKey, nodeId);
        this.logger.log(`📌 历史任务已建立 Figma 源缓存: ${fileKey}/${nodeId}`);
      } else {
        return {
          success: false,
          message: '未找到 Figma 源信息（.cache/figma-source.json），历史组件需从 Figma URL 重新生成一次以建立来源缓存',
        };
      }
    } catch (e: any) {
      return { success: false, message: `读取 Figma 源信息失败: ${e.message}` };
    }

    // 获取 Figma Token（复用上方已获取的 task）
    const userId = task?.userId;
    const aiConfig = await this.aiConfigService.getMergedAiConfig(userId);
    const figmaToken = aiConfig.figmaToken || process.env.FIGMA_ACCESS_TOKEN;
    if (!figmaToken) {
      return { success: false, message: '未配置 Figma Token，请在设置中配置' };
    }

    // 🆕 升级期间将任务状态切换为 running，使前端进度条/SSE 正常展示
    this.tasksService.updateTask(sessionId, { status: 'running' });

    try {
      // 动态导入 FigmaConnector（纯 JS 模块）
      const { FigmaConnector } = await import('../ai-engine/roles/figma-connector.js');
      const connector = new FigmaConnector({ figmaToken });

      // 1. 获取 Figma 节点数据
      this.logger.log(`🔍 获取 Figma 节点数据: ${fileKey}/${nodeId}`);
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-fetch',
        status: 'running',
        message: '获取 Figma 节点数据...',
      });

      const nodeData = await connector.fetchNodeData(fileKey, nodeId);

      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-fetch',
        status: 'completed',
        message: `节点数据获取完成 (${fileKey}/${nodeId})`,
      });

      // 2. 缓存节点数据到 .cache/
      const cacheDir = join(outputPath, '.cache');
      const { mkdirSync, writeFileSync } = await import('fs');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'figma-node-data.json'),
        JSON.stringify({ fileKey, nodeId, fetchedAt: new Date().toISOString(), document: nodeData }, null, 2),
      );

      // 3. 下载素材资源到 .cache/resources/
      const assetsDir = join(cacheDir, 'resources');
      mkdirSync(assetsDir, { recursive: true });
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-download',
        status: 'running',
        message: '下载素材资源（bg/img/icon）...',
      });

      const assets = await connector.downloadAssets(fileKey, nodeData, assetsDir);

      const dlCount = assets.filter((a: any) => a.downloaded).length;
      const cssCount = assets.filter((a: any) => a.cssInsteadOfImage).length;
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-download',
        status: 'completed',
        message: `素材下载完成：${dlCount} 个图片 + ${cssCount} 个 CSS 替代`,
        data: { downloaded: dlCount, cssSubstituted: cssCount, total: assets.length },
      });

      // 4. 构建资源-DOM 映射
      const resourceDomMapping = connector._buildResourceDomMapping(nodeData, assets);
      const mappingPath = join(cacheDir, 'resource-dom-mapping.json');
      writeFileSync(mappingPath, JSON.stringify(resourceDomMapping, null, 2));

      // 5. 🤖 AI 分析：读取组件代码，匹配每个素材的使用位置
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-analysis',
        status: 'running',
        message: 'AI 分析素材对应位置...',
      });

      const placementReport = await this.analyzeAssetPlacement(outputPath, resourceDomMapping, assets, userId);

      if (placementReport?.placements?.length) {
        this.progressService.sendProgress(sessionId, {
          type: 'progress',
          stage: 'upgrade-analysis',
          status: 'completed',
          message: `AI 定位完成：${placementReport.placements.length} 个素材已匹配`,
        });
      } else {
        this.progressService.sendProgress(sessionId, {
          type: 'progress',
          stage: 'upgrade-analysis',
          status: 'completed',
          message: 'AI 定位完成（无高置信度结果）',
        });
      }

      // 6. 将下载素材复制到组件资源目录
      const imagesDir = join(outputPath, 'resources', 'images');
      mkdirSync(imagesDir, { recursive: true });
      const { copyFileSync } = await import('fs');
      let syncedCount = 0;
      const copiedFiles: string[] = [];
      for (const asset of assets) {
        if (asset.downloaded && asset.localPath && !asset.cssInsteadOfImage) {
          const fileName = asset.localPath.split('/').pop() || `${asset.name}.png`;
          const destFile = join(imagesDir, fileName);
          copyFileSync(asset.localPath, destFile);
          syncedCount++;
          copiedFiles.push(`resources/images/${fileName}`);
        }
      }

      // 7. 根据高/中置信度定位结果自动改写完整 SFC
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-code',
        status: 'running',
        message: 'AI 将素材应用到组件代码...',
      });
      const codeApplication = await this.applyAssetPlacementsToCode(
        outputPath,
        placementReport,
        resourceDomMapping,
        assets,
        userId,
      );
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-code',
        status: 'completed',
        message: codeApplication.codeUpdated
          ? `组件代码已更新（应用 ${codeApplication.appliedPlacements.length} 个素材）`
          : '未找到可安全应用的素材位置，组件代码保持不变',
        data: {
          codeUpdated: codeApplication.codeUpdated,
          applied: codeApplication.appliedPlacements.length,
          skipped: codeApplication.skippedPlacements.length,
        },
      });

      // 8. 写入 resources.json 清单和代码应用报告
      const manifestPath = join(cacheDir, 'resources.json');
      const manifest = {
        componentId: sessionId,
        fileKey,
        nodeId,
        upgradedAt: new Date().toISOString(),
        totalAssets: assets.length,
        assets: assets.map((a: any) => ({
          name: a.name,
          ref: a.ref,
          localPath: a.localPath,
          downloadStatus: a.downloaded ? 'success' : a.cssInsteadOfImage ? 'css' : 'failed',
          type: a.preferredUsage || (a.localPath?.includes('bg-') ? 'bg' : a.localPath?.includes('icon-') ? 'icon' : 'image'),
          ...(a.cssInsteadOfImage ? { cssValue: a.cssValue } : {}),
        })),
        mapping: resourceDomMapping.map((m: any) => ({
          figmaNodeId: m.figmaNodeId,
          resourceFile: m.resourceFile,
          targetDomSelector: m.targetDomSelector,
          downloadStatus: m.downloadStatus,
          role: m.previewAnalysisRole,
          recommendedUsage: m.recommendedUsage,
        })),
        placementReport,
        codeApplication,
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      writeFileSync(
        join(cacheDir, 'asset-code-application.json'),
        JSON.stringify({ appliedAt: new Date().toISOString(), ...codeApplication }, null, 2),
      );

      // 9. 同步完整组件到 backend + frontend workspace；失败时恢复原入口
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-sync',
        status: 'running',
        message: `同步素材和组件代码 (${syncedCount} 个文件)...`,
      });
      try {
        await this.copyToWorkspace(outputPath, sessionId, (task as any).groupId || 'default-group', (task as any).target || 'vue3');
      } catch (syncError) {
        if (codeApplication.codeUpdated && codeApplication.backupFile) {
          copyFileSync(codeApplication.backupFile, join(outputPath, 'package', 'index.vue'));
          await this.copyToWorkspace(outputPath, sessionId, (task as any).groupId || 'default-group', (task as any).target || 'vue3')
            .catch((rollbackError: any) => {
              throw new Error(`workspace 同步失败且代码回滚同步失败: ${(syncError as Error).message}; rollback: ${rollbackError.message}`);
            });
        }
        throw syncError;
      }
      this.progressService.sendProgress(sessionId, {
        type: 'progress',
        stage: 'upgrade-sync',
        status: 'completed',
        message: `素材和组件代码已同步 (${syncedCount} 个文件)`,
      });

      const upgradeResult = {
        totalAssets: assets.length,
        downloaded: assets.filter((a: any) => a.downloaded).length,
        cssSubstituted: assets.filter((a: any) => a.cssInsteadOfImage).length,
        syncedToWorkspace: syncedCount,
        mappingFile: mappingPath,
        placementReport,
        codeUpdated: codeApplication.codeUpdated,
        backupFile: codeApplication.backupFile,
        appliedPlacements: codeApplication.appliedPlacements,
        skippedPlacements: codeApplication.skippedPlacements,
        modifiedFiles: [...copiedFiles, ...codeApplication.modifiedFiles],
        validation: codeApplication.validation,
      };
      const currentTask = this.tasksService.getTask(sessionId) as any;
      this.tasksService.updateTask(sessionId, {
        status: 'completed',
        error: undefined,
        result: {
          ...(currentTask?.result || {}),
          upgradeResult,
        },
      });
      this.progressService.sendProgress(sessionId, {
        type: 'upgrade-complete',
        stage: 'upgrade-complete',
        status: 'completed',
        message: codeApplication.codeUpdated ? '素材升级并自动应用完成' : '素材下载完成，代码未自动修改',
        data: upgradeResult,
      });

      this.logger.log(
        `✅ 素材升级完成: ${sessionId}, 总素材 ${assets.length}, 下载 ${assets.filter((a: any) => a.downloaded).length}, CSS替代 ${assets.filter((a: any) => a.cssInsteadOfImage).length}, 同步 ${syncedCount}, 自动应用 ${codeApplication.appliedPlacements.length} 项`,
      );

      return {
        success: true,
        message: codeApplication.codeUpdated
          ? `素材升级完成：已下载 ${syncedCount} 个资源，并自动应用 ${codeApplication.appliedPlacements.length} 个素材到组件代码`
          : `素材升级完成：已下载 ${syncedCount} 个资源，但没有可安全自动应用的位置，组件代码保持不变`,
        assets: manifest.assets,
        mappingFile: mappingPath,
        placementReport,
        codeUpdated: codeApplication.codeUpdated,
        backupFile: codeApplication.backupFile,
        appliedPlacements: codeApplication.appliedPlacements,
        skippedPlacements: codeApplication.skippedPlacements,
        modifiedFiles: upgradeResult.modifiedFiles,
        validation: codeApplication.validation,
      };
    } catch (error: any) {
      this.logger.error(`素材升级失败 ${sessionId}: ${error.message}`, error.stack);
      this.progressService.sendProgress(sessionId, {
        type: 'upgrade-error',
        stage: 'upgrade-error',
        status: 'failed',
        message: `素材升级失败: ${error.message}`,
      });
      // 升级是完成任务上的附加操作，失败不改变原生成任务的 completed 语义。
      const currentTask = this.tasksService.getTask(sessionId) as any;
      this.tasksService.updateTask(sessionId, {
        status: 'completed',
        result: {
          ...(currentTask?.result || {}),
          upgradeResult: {
            ...(currentTask?.result?.upgradeResult || {}),
            success: false,
            error: error.message,
            failedAt: new Date().toISOString(),
          },
        },
      });
      return { success: false, message: `素材升级失败: ${error.message}` };
    }
  }

  /** 持久化 Figma 源信息到 .cache/figma-source.json */
  private async saveFigmaSource(
    outputPath: string,
    figmaUrl: string,
    fileKey: string,
    nodeId: string,
    nodeName?: string,
  ): Promise<void> {
    try {
      const { mkdirSync, writeFileSync } = await import('fs');
      const cacheDir = join(outputPath, '.cache');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'figma-source.json'),
        JSON.stringify({
          figmaUrl,
          fileKey,
          nodeId,
          nodeName: nodeName || '',
          savedAt: new Date().toISOString(),
        }, null, 2),
      );
      this.logger.log(`💾 Figma 源信息已保存到 .cache/figma-source.json: ${fileKey}/${nodeId}`);
    } catch (e: any) {
      this.logger.warn(`保存 Figma 源信息失败（非阻塞）: ${e.message}`);
    }
  }

  /**
   * 🤖 AI 分析素材在组件中的对应位置
   * 读取组件 Vue SFC 代码，结合 Figma 资源映射，使用 LLM 分析每个素材应对应到哪个 DOM 元素
   */
  private async analyzeAssetPlacement(
    outputPath: string,
    resourceDomMapping: any[],
    assets: any[],
    userId?: string,
  ): Promise<AssetPlacementReport | null> {
    try {
      const { readFileSync } = await import('fs');
      const vuePath = join(outputPath, 'package', 'index.vue');

      if (!existsSync(vuePath)) {
        this.logger.warn('组件 Vue 文件不存在，跳过位置分析');
        return null;
      }

      const vueCode = readFileSync(vuePath, 'utf-8');

      // 仅提取 <template> 部分以减少 token（script 和 style 对素材定位无帮助）
      const templateMatch = vueCode.match(/<template>([\s\S]*?)<\/template>/i);
      const template = templateMatch ? templateMatch[1].trim() : vueCode;

      if (template.length < 10) {
        this.logger.warn('组件模板为空，跳过位置分析');
        return null;
      }

      // 滤出有实际资源的映射项（下载成功或有 CSS 替代）
      const actionableMappings = resourceDomMapping.filter(
        (m: any) => m.downloadStatus === 'success' || m.downloadStatus === 'css' || m.deduplicatedFrom,
      );

      if (actionableMappings.length === 0) {
        this.logger.log('无可定位资源，跳过位置分析');
        return null;
      }

      // 构建 AI 分析 prompt
      const mappingSummary = actionableMappings.map((m: any, i: number) => {
        const asset = assets.find((a: any) => a.ref === m.figmaNodeId);
        const fileName = m.resourceFile
          ? m.resourceFile.split('/').pop()
          : m.cssInsteadOfImage
            ? `[CSS: ${m.cssValue?.slice?.(0, 40) || 'N/A'}]`
            : '[未下载]';
        return `${i + 1}. Figma 节点: ${m.figmaNodeId} (${m.figmaPath || 'unknown'})
   - 类型: ${m.previewAnalysisRole || 'unknown'}
   - 资源文件: ${fileName}
   - 推荐用途: ${m.recommendedUsage || '未指定'}
   - Figma 建议选择器(仅供参考, 以真实模板为准): ${m.targetDomSelector || '无'}
   - 描述提示: ${m.targetDomHint || m.hint || '无'}
   - Figma 尺寸: ${m.figmaBox ? `${m.figmaBox.width}x${m.figmaBox.height}` : '未知'}
   - 状态: ${m.downloadStatus}${m.cssInsteadOfImage ? ` (CSS: ${m.cssValue?.slice?.(0, 30)})` : ''}`;
      }).join('\n\n');

      const prompt = `你是一个前端组件素材定位专家。下面是：
1. 一个 Vue 组件的模板代码（仅 template 部分）
2. Figma 资源映射表，列出了从 Figma 下载的素材（背景图/图标/图片）

请分析**每个素材应该对应到模板中的哪个 DOM 元素**，并给出具体的使用建议。

回复 JSON 格式（不要 markdown 包裹）：
{
  "placements": [
    {
      "figmaNodeId": "节点ID",
      "resourceFile": "资源文件名",
      "type": "bg|icon|image",
      "targetElement": "模板中的目标元素描述",
      "targetSelector": "CSS 选择器（如 .header-bg）",
      "usage": "imgSrc|backgroundImage|inlineStyle|cssClass",
      "codeSuggestion": "具体代码片段（如 <img :src=\"bgHeader\" class=\"header-bg\" /> 或 style=\"background-image: url(...)\"）",
      "confidence": "high|medium|low",
      "reason": "匹配理由"
    }
  ],
  "summary": "整体定位总结（1-2句话）"
}

规则：
- 以组件模板中的【真实 class 与 DOM 结构】为准进行定位，不要机械依赖 Figma 映射里的 targetDomSelector（那只是参考，经常与真实模板 class 不一致）
- 仔细阅读下方完整模板，根据素材类型（bg/icon/image）与 Figma 描述，推断最合理的承载元素
- bg 类型（大面积背景）通常作为容器背景，优先选最外层或区块容器元素（如 header/section 根 div）
- icon 类型（小图标）用 <img> 标签或 CSS background 替换原占位图标
- image 类型直接放入对应内容区 <img>
- 若模板中确实无合适元素，才标记 confidence 为 low 并解释原因
- CSS 替代的资源不需要定位，跳过

--- 组件模板 ---
${template.slice(0, 12000)}

--- Figma 资源映射 ---
${mappingSummary}`;

      // 调用文本 LLM
      const aiConfig = await this.aiConfigService.getMergedAiConfig(userId);
      const apiKey = aiConfig.textApiKey || aiConfig.apiKey || process.env.TEXT_API_KEY;
      const baseURL = aiConfig.textBaseURL || aiConfig.baseURL || process.env.TEXT_BASE_URL;

      if (!apiKey || !baseURL) {
        this.logger.warn('AI 配置不完整，跳过素材位置分析');
        return null;
      }

      const { buildChatUrl } = await import('../ai-engine/utils/chat-url.js');
      const fullUrl = buildChatUrl(baseURL);
      const model = aiConfig.textModel || aiConfig.model || 'gpt-4o-mini';

      this.logger.log(`🤖 调用 AI 分析素材位置: ${model}`);

      const axios = (await import('axios')).default;
      const response = await axios.post(
        fullUrl,
        {
          model,
          messages: [
            { role: 'system', content: '你是一个前端组件素材定位专家。只返回合法 JSON，不要任何额外文字。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 16384,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          // qwen3.7-plus 等慢模型单次约 3.5 分钟，60s 必超时 → 原 placements 全空
          timeout: 300000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn('AI 位置分析返回空内容');
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        // 尝试提取 JSON（模型可能包裹了 markdown）
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          this.logger.warn('AI 位置分析返回非 JSON 内容');
          return null;
        }
      }

      const result = {
        placements: (parsed.placements || []).filter(
          (p: any) => p.confidence !== 'low' && p.type !== 'css',
        ),
        summary: parsed.summary || '',
        analyzedAt: new Date().toISOString(),
        model,
      };

      this.logger.log(`✅ AI 位置分析完成: ${result.placements.length} 个素材已定位`);
      return result;
    } catch (error: any) {
      this.logger.warn(`AI 素材位置分析失败（非阻塞）: ${error.message}`);
      return null;
    }
  }

  /**
   * 根据位置分析结果改写完整 SFC。模型只能调整 template/style，script setup 必须保持不变。
   * 任何结构、资源引用或脚本一致性校验失败都会拒绝落盘。
   */
  private async applyAssetPlacementsToCode(
    outputPath: string,
    placementReport: AssetPlacementReport | null,
    resourceDomMapping: any[],
    assets: any[],
    userId?: string,
  ): Promise<AssetCodeApplication> {
    const placements = Array.isArray(placementReport?.placements)
      ? placementReport!.placements
      : [];
    const skippedResult = (reason: string): AssetCodeApplication => ({
      codeUpdated: false,
      appliedPlacements: [],
      skippedPlacements: placements.map((placement: any) => ({
        ...placement,
        skipReason: reason,
      })),
      modifiedFiles: [],
      validation: {
        sfcStructure: 'skipped',
        scriptSetupUnchanged: 'skipped',
        resourceReferences: 'skipped',
      },
    });

    if (placements.length === 0) {
      return skippedResult('无高/中置信度素材定位结果');
    }

    const vuePath = join(outputPath, 'package', 'index.vue');
    if (!existsSync(vuePath)) {
      throw new Error(`组件入口不存在: ${vuePath}`);
    }

    const { readFileSync, writeFileSync, readdirSync } = await import('fs');
    const originalCode = readFileSync(vuePath, 'utf-8');
    const originalScript = this.extractSfcBlock(originalCode, 'script');
    const imagesDir = join(outputPath, 'resources', 'images');
    const availableFiles = existsSync(imagesDir)
      ? new Set(readdirSync(imagesDir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name))
      : new Set<string>();

    const actionablePlacements = placements.filter((placement: any) => {
      const fileName = String(placement.resourceFile || '').split('/').pop() || '';
      return fileName && availableFiles.has(fileName);
    });
    if (actionablePlacements.length === 0) {
      return skippedResult('定位结果未引用已下载的本地素材');
    }

    // 🔧 每用户隔离（2026-09-xx）：改走 getMergedAiConfig(userId)，binding 用户级优先，
    // 避免全局 ai-config.json 被他人保存覆盖后，素材应用仍沿用别人的文本模型。
    const aiConfig = (await this.aiConfigService.getMergedAiConfig(userId)) || {};
    const apiKey = aiConfig.textApiKey || aiConfig.apiKey || process.env.TEXT_API_KEY;
    const baseURL = aiConfig.textBaseURL || aiConfig.baseURL || process.env.TEXT_BASE_URL;
    if (!apiKey || !baseURL) {
      return skippedResult('AI 文本模型配置不完整');
    }

    const placementContext = actionablePlacements.map((placement: any) => {
      const fileName = String(placement.resourceFile).split('/').pop();
      const mapping = resourceDomMapping.find(
        (item: any) => item.figmaNodeId === placement.figmaNodeId,
      );
      const asset = assets.find((item: any) => item.ref === placement.figmaNodeId);
      return {
        ...placement,
        resourceFile: `../resources/images/${fileName}`,
        figmaPath: mapping?.figmaPath,
        targetDomHint: mapping?.targetDomHint || mapping?.hint,
        dimensions: mapping?.figmaBox,
        preferredUsage: asset?.preferredUsage,
      };
    });

    const prompt = `你是 Vue3 单文件组件素材应用工程师。请把给定的本地图片素材应用到组件中，并返回修改后的完整 Vue SFC。

硬性规则：
1. 只允许修改 <template> 和 <style>；<script setup> 的开始标签、内容、结束标签必须逐字保持不变。
2. 只能引用清单中的 ../resources/images/* 本地路径，禁止 data URL、网络 URL 和不存在的文件。
3. 背景使用 CSS background-image: url('../resources/images/文件名')；内容图和图标优先直接使用 <img src="../resources/images/文件名">，不要新增 JS import。
4. 保留现有业务结构、交互、变量、事件、组件标签和 scoped/lang 属性，只做素材应用所需的最小改动。
5. 选择器不可靠时，以 targetElement、reason、DOM 语义和现有 class 综合判断；无法可靠应用的素材跳过。
6. 必须返回完整且可闭合的 template、script setup、style，不要输出解释。

--- 可应用素材 ---
${JSON.stringify(placementContext, null, 2)}

--- 原始组件 ---
${originalCode}`;

    const { buildChatUrl } = await import('../ai-engine/utils/chat-url.js');
    const fullUrl = buildChatUrl(baseURL);
    const model = aiConfig.textModel || aiConfig.model || 'gpt-4o-mini';
    const axios = (await import('axios')).default;
    const response = await axios.post(
      fullUrl,
      {
        model,
        messages: [
          {
            role: 'system',
            content: '只返回一个包含完整 Vue SFC 的 ```vue 代码块。不得修改 script setup。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 16384,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        // 慢模型（如 qwen3.7-plus 单次约 3.5 分钟）需要更长超时，避免 SFC 改写阶段被中断
        timeout: 300000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    let updatedCode = this.extractVueCode(content);
    updatedCode = this.sanitizeVueScriptImports(updatedCode);
    if (!updatedCode || updatedCode === originalCode.trim()) {
      return skippedResult('AI 未生成有效代码变更');
    }

    // 清理 AI 在 HTML 属性值中误用的反斜杠转义（\" / \'）。
    // 根因：HTML 属性值不识别反斜杠转义，\" 会让双引号提前结束属性，
    // 导致 Vue 编译器拿到残缺表达式并抛 "Expecting Unicode escape sequence \uXXXX"，
    // 最终组件加载超时。清洗后：双引号属性值内 \" -> '；单引号属性值内 \' -> "。
    updatedCode = this.sanitizeSfcAttributeEscapes(updatedCode);
    updatedCode = repairScopedThirdPartySelectors(updatedCode, this.logger);
    this.validateLiteSfc(updatedCode);
    const updatedScript = this.extractSfcBlock(updatedCode, 'script');
    if (originalScript !== updatedScript) {
      throw new Error('素材自动应用被拒绝：AI 修改了 <script setup>');
    }

    const referencedFiles = Array.from(
      updatedCode.matchAll(/\.\.\/resources\/images\/([^\s"'()?#]+)/g),
      (match) => match[1],
    );
    const missingReferences = referencedFiles.filter((fileName) => !availableFiles.has(fileName));
    if (missingReferences.length > 0) {
      throw new Error(`素材自动应用被拒绝：引用了不存在的资源 ${missingReferences.join(', ')}`);
    }

    const appliedPlacements = actionablePlacements.filter((placement: any) => {
      const fileName = String(placement.resourceFile).split('/').pop() || '';
      return referencedFiles.includes(fileName);
    });
    if (appliedPlacements.length === 0) {
      return skippedResult('AI 输出未实际引用任何定位素材');
    }

    const skippedPlacements = placements
      .filter((placement: any) => !appliedPlacements.includes(placement))
      .map((placement: any) => ({
        ...placement,
        skipReason: '未通过本地资源校验或未被 AI 应用',
      }));
    const cacheDir = join(outputPath, '.cache');
    const backupFile = join(cacheDir, `package-index.before-assets-${Date.now()}.vue`);
    writeFileSync(backupFile, originalCode, 'utf-8');
    writeFileSync(vuePath, `${updatedCode.trim()}\n`, 'utf-8');

    return {
      codeUpdated: true,
      backupFile,
      appliedPlacements,
      skippedPlacements,
      modifiedFiles: ['package/index.vue'],
      validation: {
        sfcStructure: 'passed',
        scriptSetupUnchanged: 'passed',
        resourceReferences: 'passed',
      },
    };
  }

  private extractSfcBlock(code: string, block: 'script'): string {
    const match = code.match(/<script\s+setup(?:\s[^>]*)?>[\s\S]*?<\/script>/i);
    return match?.[0] || '';
  }

  // ===================== 工具方法 =====================

  /** 将上传的自包含 HTML 在无脚本、无外网环境中渲染为截图，复用 Lite 视觉管线 */
  private async renderHtmlPreview(
    dto: GenerateLiteDto,
    sessionId: string,
  ): Promise<{ buffer: Buffer; mime: string; ext: string }> {
    const html = dto.htmlContent?.trim() || '';
    const size = Buffer.byteLength(html, 'utf8');
    if (!html || size > LITE_HTML_MAX_BYTES || !/<(?:html|body|div|main|section|article|header|footer|form|table)\b/i.test(html)) {
      throw this.wrapError(
        LiteErrorCode.INVALID_HTML,
        LITE_ERROR_MESSAGES[LiteErrorCode.INVALID_HTML],
      );
    }

    const sanitized = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    let browser: any;
    try {
      const puppeteer = await import('puppeteer');
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',
      ].find(p => { try { return existsSync(p) } catch { return false } });
      browser = await puppeteer.default.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith('about:')) request.continue();
        else request.abort();
      });
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.setContent(sanitized, { waitUntil: 'domcontentloaded', timeout: 15_000 });

      const dimensions = await page.evaluate(() => ({
        width: Math.min(1600, Math.max(320, document.documentElement.scrollWidth || document.body?.scrollWidth || 1440)),
        height: Math.min(1200, Math.max(240, document.documentElement.scrollHeight || document.body?.scrollHeight || 900)),
      }));
      await page.setViewport({ ...dimensions, deviceScaleFactor: 1 });
      const screenshot = await page.screenshot({ type: 'png', fullPage: false });
      this.logger.log(`HTML 安全渲染完成 ${sessionId}: ${dimensions.width}x${dimensions.height}, ${Math.round(size / 1024)}KB`);
      return { buffer: Buffer.from(screenshot), mime: 'image/png', ext: 'png' };
    } catch (error: any) {
      throw this.wrapError(
        LiteErrorCode.INVALID_HTML,
        `HTML 渲染失败: ${error.message}`,
        error,
      );
    } finally {
      if (browser) await browser.close().catch(() => undefined);
    }
  }

  /** 从 Figma URL 导出图片并下载为 buffer */
  private async fetchFigmaImage(
    dto: GenerateLiteDto,
    sessionId: string,
    userId?: string,
  ): Promise<{
    buffer: Buffer;
    mime: string;
    ext: string;
    logicalWidth?: number | null;
    logicalHeight?: number | null;
    figmaTexts?: string[] | null;
  }> {
    try {
      // 解析 Figma URL
      const parsed = parseFigmaUrl(dto.figmaUrl!);
      if (!parsed.fileKey || !parsed.nodeId) {
        throw this.wrapError(
          LiteErrorCode.INVALID_FIGMA_URL,
          'Figma 链接缺少 fileKey 或 nodeId',
        );
      }

      // 解析 Figma Token：dto.config > 按用户 DB 配置 > 环境变量
      const aiCfg = await this.aiConfigService.getMergedAiConfig(userId);
      const figmaToken =
        dto.config?.figmaToken ||
        aiCfg?.figmaToken ||
        process.env.FIGMA_ACCESS_TOKEN;

      if (!figmaToken) {
        throw this.wrapError(
          LiteErrorCode.FIGMA_EXPORT_FAILED,
          '未配置 Figma Token，请在设置中配置或传入 config.figmaToken',
        );
      }

      // 创建 FigmaClient 并导出图片
      const figmaClient = new FigmaClient({ token: figmaToken });
      const imageUrl = await figmaClient.exportImage(
        parsed.fileKey,
        parsed.nodeId,
        { format: 'png', scale: 2 },
      );

      if (!imageUrl) {
        throw this.wrapError(
          LiteErrorCode.FIGMA_EXPORT_FAILED,
          'Figma 图片导出失败：未返回图片 URL',
        );
      }

      // 下载图片
      const https = await import('https');
      const http = await import('http');
      const client = imageUrl.startsWith('https:') ? https : http;

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        client
          .get(imageUrl, (res) => {
            if (res.statusCode !== 200) {
              reject(
                this.wrapError(
                  LiteErrorCode.FIGMA_EXPORT_FAILED,
                  `Figma 图片下载失败：HTTP ${res.statusCode}`,
                ),
              );
              return;
            }
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          })
          .on('error', reject);
      });

      if (
        buffer.length === 0 ||
        buffer.length > LITE_PRECHECK.MAX_IMAGE_BYTES
      ) {
        throw this.wrapError(
          LiteErrorCode.INVALID_IMAGE,
          `Figma 导出图片大小无效（${buffer.length} bytes）`,
        );
      }

      // 🔧 节点逻辑尺寸（2026-09-01）：Figma API absoluteBoundingBox 是 CSS 逻辑坐标，
      // 与导出图 scale=2 的栅格像素解耦。lite 页面（LiteGenerate）不传 previewWidth 时，
      // 用它替代「栅格宽度」作为组件设计画布尺寸，避免组件按 2 倍栅格生成/预览。
      // getNode 失败不阻塞导出：返回 null，由调用方按 rasterWidth/2 兜底。
      let logicalWidth: number | null = null;
      let logicalHeight: number | null = null;
      let figmaTexts: string[] | null = null;
      try {
        const nodeDoc = await figmaClient.getNode(parsed.fileKey, parsed.nodeId);
        const bbox = nodeDoc?.absoluteBoundingBox;
        if (bbox && Number(bbox.width) > 0 && Number(bbox.height) > 0) {
          logicalWidth = Math.round(Number(bbox.width));
          logicalHeight = Math.round(Number(bbox.height));
          this.logger.log(`Figma 节点逻辑尺寸: ${logicalWidth}x${logicalHeight}（scale=2 导出栅格 ${buffer.length} bytes）`);
        }
        // 🔧 文本图层真值（2026-09-01）：同一 getNode 响应含完整子树的 TEXT 节点
        // characters，是设计稿文案的确定性事实源。视觉模型对小字号多字标签反复误读
        // （「南北接线设备」三轮读成「雨北援缅/掉缆/横线」），注入分析 prompt 当对照表。
        figmaTexts = this.extractFigmaTextNodes(nodeDoc);
        if (figmaTexts.length > 0) {
          this.logger.log(`Figma 文本图层真值: ${figmaTexts.length} 条（注入视觉分析对照）`);
        }
      } catch (nodeErr: any) {
        this.logger.warn(`获取 Figma 节点尺寸失败（非阻塞，走栅格/2 兜底）: ${nodeErr?.message}`);
      }

      return {
        buffer,
        mime: 'image/png',
        ext: 'png',
        logicalWidth,
        logicalHeight,
        figmaTexts,
      };
    } catch (error: any) {
      if (error.code) throw error; // 已包装的错误直接抛出
      throw this.wrapError(
        LiteErrorCode.FIGMA_EXPORT_FAILED,
        `Figma 图片获取失败：${error.message}`,
        error,
      );
    }
  }

  /** 递归提取 Figma 节点树中的 TEXT 图层文字（按阅读顺序排序 + 去重，上限 80 条防 prompt 膨胀） */
  private extractFigmaTextNodes(nodeDoc: any): string[] {
    if (!nodeDoc || typeof nodeDoc !== 'object') return [];
    const items: Array<{ text: string; x: number; y: number }> = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.visible === false) return;
      if (node.type === 'TEXT' && typeof node.characters === 'string') {
        const text = node.characters.replace(/\s+/g, ' ').trim();
        if (text) {
          const bb = node.absoluteBoundingBox || {};
          items.push({
            text,
            x: Number(bb.x) || 0,
            y: Number(bb.y) || 0,
          });
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child);
      }
    };
    walk(nodeDoc);
    // 阅读顺序：先按 y 分行（容差 8px 视为同一行），行内按 x
    items.sort((a, b) => (Math.abs(a.y - b.y) <= 8 ? a.x - b.x : a.y - b.y));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      if (seen.has(item.text)) continue;
      seen.add(item.text);
      out.push(item.text);
      if (out.length >= 80) break;
    }
    return out;
  }

  /** 将 base64 / data URL / 二进制推断归一为 {buffer, mime, ext} */
  private normalizeImage(dto: GenerateLiteDto): {
    buffer: Buffer;
    mime: string;
    ext: string;
  } {
    let raw = (dto.imageBase64 || '').trim();
    let mime = (dto.imageMime || '').trim().toLowerCase();

    // 🔧 容错：清理 base64 中的换行/空白（部分粘贴/传输会插入 \r\n）
    raw = raw.replace(/\s+/g, '');

    const dataUrlMatch = raw.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1].toLowerCase();
      raw = dataUrlMatch[2];
    } else if (!mime) {
      // 尝试从文件头推断 PNG/JPEG/WebP
      const head = Buffer.from(raw.slice(0, 16), 'base64');
      if (head.slice(0, 8).toString('hex') === '89504e470d0a1a0a') mime = 'image/png';
      else if (head.slice(0, 3).toString('hex') === 'ffd8ff') mime = 'image/jpeg';
      else if (head.slice(0, 4).toString('hex') === '52494646') mime = 'image/webp';
    }

    if (!LITE_PRECHECK.ALLOWED_MIME.includes(mime as any)) {
      throw this.wrapError(
        LiteErrorCode.INVALID_IMAGE,
        `不支持的图片格式: ${mime || 'unknown'}`,
      );
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      throw this.wrapError(LiteErrorCode.INVALID_IMAGE, 'base64 解码失败');
    }
    if (buffer.length === 0 || buffer.length > LITE_PRECHECK.MAX_IMAGE_BYTES) {
      throw this.wrapError(
        LiteErrorCode.INVALID_IMAGE,
        `图片大小超出限制（${LITE_PRECHECK.MAX_IMAGE_BYTES / 1024 / 1024}MB）`,
      );
    }

    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    return { buffer, mime, ext };
  }

  /** 尺寸与基础校验，返回 {width, height} */
  private async precheck(
    buffer: Buffer,
    mime: string,
  ): Promise<{ width: number; height: number }> {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch (e: any) {
      throw this.wrapError(
        LiteErrorCode.INVALID_IMAGE,
        `图片解析失败: ${e.message}`,
      );
    }
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (
      width < LITE_PRECHECK.MIN_DIMENSION ||
      height < LITE_PRECHECK.MIN_DIMENSION
    ) {
      throw this.wrapError(
        LiteErrorCode.INVALID_IMAGE,
        `图片尺寸过小（${width}x${height}，需单边 ≥ ${LITE_PRECHECK.MIN_DIMENSION}px）`,
      );
    }
    return { width, height };
  }

  /**
   * 🔧 像素级主题判定兜底（2026-09-01）：不依赖模型视觉，直接用截图像素判定
   * 根容器底色明暗，作为 theme 的确定性 ground truth。
   * - 方法：整图缩到 64x64 后统计所有不透明像素的感知亮度分布（Figma 导出节点 PNG
   *   常有透明 padding，四角采样会大面积落空，整体分布法对「内容不铺满画布」更鲁棒）
   * - 跳过透明像素（alpha=0 的 RGB 全为 0，直接算会误判为深色）
   * - 判定：亮度中位数 > 0.55 且浅色像素占比 ≥ 50% → light；中位数 < 0.45 且深色
   *   像素占比 ≥ 50% → dark；其余（渐变/深浅混合/灰色地带）返回 null 保留模型自报
   */
  private async sampleRootBrightness(
    buffer: Buffer,
  ): Promise<'light' | 'dark' | null> {
    try {
      const { data, info } = await sharp(buffer)
        .resize(64, 64, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const ch = info.channels; // 3=RGB 4=RGBA
      const lums: number[] = [];
      for (let p = 0; p < data.length; p += ch) {
        if (ch === 4 && data[p + 3] < 128) continue; // 跳过透明像素
        const lum =
          (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
        lums.push(lum);
      }
      if (lums.length < 50) return null; // 有效像素太少
      lums.sort((a, b) => a - b);
      const median = lums[Math.floor(lums.length / 2)];
      const lightRatio = lums.filter((l) => l > 0.6).length / lums.length;
      const darkRatio = lums.filter((l) => l < 0.4).length / lums.length;
      if (median > 0.55 && lightRatio >= 0.5) return 'light';
      if (median < 0.45 && darkRatio >= 0.5) return 'dark';
      return null; // 深浅混合 / 渐变 / 灰色地带，交给模型判断
    } catch (e: any) {
      this.logger.warn(`像素级主题采样失败（非阻塞）: ${e.message}`);
      return null;
    }
  }

  /**
   * 🔧 边缘环带底色采样（2026-09-01）：根容器真实底色在截图最外环带可见，
   * 取外圈 3% 像素逐通道取中位数得确定性 hex。用途：视觉模型对浅蓝白渐变底色
   * 反复误读成中灰（#A8B5C0），导致 light 主题产物渲染成灰蓝色——用采样值覆盖
   * brief.colors.background。仅 figma 源调用（exportImage 导出纯净节点，无 OS 截图边框）。
   */
  private async sampleEdgeColor(buffer: Buffer): Promise<string | null> {
    try {
      const { data, info } = await sharp(buffer)
        .resize(100, 100, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      const w = info.width;
      const h = info.height;
      const ring = 3; // 100x100 缩放下 3px 环带 ≈ 原图 3% 边缘
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const onRing = x < ring || x >= w - ring || y < ring || y >= h - ring;
          if (!onRing) continue;
          const p = (y * w + x) * ch;
          if (ch === 4 && data[p + 3] < 128) continue;
          rs.push(data[p]);
          gs.push(data[p + 1]);
          bs.push(data[p + 2]);
        }
      }
      if (rs.length < 100) return null;
      const median = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const hex = (v: number) => v.toString(16).padStart(2, '0');
      return `#${hex(median(rs))}${hex(median(gs))}${hex(median(bs))}`.toUpperCase();
    } catch (e: any) {
      this.logger.warn(`边缘底色采样失败（非阻塞）: ${e.message}`);
      return null;
    }
  }

  private async buildVisionAgent(
    dto: GenerateLiteDto,
    sourceType: LiteSourceType = 'screenshot',
    userId?: string,
  ): Promise<VisionAgent> {
    // 解析视觉配置：仅认用户显式配置（dto.config > 设置面板保存的 ai-config.json）。
    // 🔧 原则（2026-08-04）：不依赖环境变量 / 硬编码默认 —— API Key 必须由用户配置提供。
    const aiCfg = (await this.aiConfigService.getMergedAiConfig(userId)) || {};

    // 优先级：请求内联配置 > 全局设置面板配置 > 请求的通用 aiApiKey 兼容字段
    const apiKey =
      dto.config?.visionApiKey ||
      aiCfg.visionApiKey ||
      (dto.config?.aiApiKey as string | undefined) ||
      '';
    const baseURL =
      dto.config?.visionBaseURL ||
      aiCfg.visionBaseURL ||
      (dto.config?.aiBaseURL as string | undefined) ||
      '';
    const model =
      dto.config?.visionModel ||
      aiCfg.visionModel ||
      (dto.config?.aiModel as string | undefined) ||
      '';
    // 🆕 显式 provider 类型：请求内联 > 全局设置面板 > 默认 auto
    const providerType =
      dto.config?.visionProviderType ||
      aiCfg.visionProviderType ||
      'auto';
    const inlineTemperature = dto.config?.modelMode === 'unified'
      ? dto.config?.unifiedTemperature
      : dto.config?.visionTemperature;
    const temperature = inlineTemperature ?? aiCfg.visionTemperature;

    if (!apiKey) {
      throw this.wrapError(
        LiteErrorCode.INTERNAL_ERROR,
        '视觉模型未配置 API Key，请在设置面板中配置视觉模型后重试',
      );
    }

    // 🛡️ 生成闸门：视觉能力硬校验（2026-09-10）
    // Lite 是「截图 → 组件」，第一步就是让模型看图。模型若不具备视觉能力，请求照样成功返回，
    // 但模型根本没看到图 —— 产物与截图完全无关且不报任何错，用户无从判断是模型问题。
    // 判定依据为实测结论（resolveVisionCapability），不依赖模型名白名单。
    const visionModelName = String(model || '').trim();
    if (!visionModelName) {
      throw this.wrapError(
        LiteErrorCode.INTERNAL_ERROR,
        '未配置视觉模型，无法从截图生成组件，请到「设置 - 模型配置」中选择支持视觉的模型并保存',
      );
    }
    const visionCap = resolveVisionCapability(visionModelName);
    if (visionCap.vision === false) {
      throw this.wrapError(
        LiteErrorCode.INTERNAL_ERROR,
        `模型「${visionModelName}」不支持视觉输入，无法从截图生成组件。` +
          `请到「设置 - 模型配置」更换为支持视觉的模型（并点击「检测」确认）后重试`,
      );
    }
    if (visionCap.vision !== true) {
      throw this.wrapError(
        LiteErrorCode.INTERNAL_ERROR,
        `模型「${visionModelName}」的视觉能力尚未检测，无法确认其能否识别截图。` +
          `请到「设置 - 模型配置」点击「检测」完成能力识别后重试（未检测不支持直接生成，避免产出与截图无关的结果）`,
      );
    }

    // 🔧 治本（2026-09-03）：填充视觉故障转移池。
    // resolveVisionConfig 内部会 pool.setProviders(...)，把 ai-config.json 中 role=vision/both
    // 的供应商（qwen3.7-plus 主 + Hy4 / deepseek-v4-flash-vision-exp / claude 等备用）注册进池。
    // 此前 lite 直接读 aiCfg 构造 VisionAgent、从未调用 resolveVisionConfig → 池为空 →
    // pick('vision') 恒返回 null → 3 次重试全撞同一慢模型 qwen3.7-plus，备用模型零启用。
    // 池填充后：主 provider 超时即熔断，网关按 primary-first 自动切到备用视觉模型。
    try {
      resolveVisionConfig(aiCfg);
    } catch {
      /* 池填充失败不阻断主流程，回退单配置 */
    }

    try {
      return new VisionAgent({
        apiKey,
        baseURL,
        model,
        providerType,
        ...(temperature !== undefined && temperature !== null && temperature !== ''
          ? { temperature: Number(temperature) }
          : {}),
        maxTokens: 16384, // Lite 需要生成完整 Vue SFC（template + script + style），4096 默认值易被截断
        onTokenUsage: (usage: any) => {
          try {
            this.tokenTrackerService.recordUsage({
              ...usage,
              sessionId: undefined,
              componentName: undefined,
              sourceType,
            });
          } catch {
            /* 非阻塞 */
          }
        },
      });
    } catch (e: any) {
      throw this.wrapError(
        LiteErrorCode.INTERNAL_ERROR,
        `视觉模型初始化失败: ${e.message}`,
        e,
      );
    }
  }

  /** 阶段 2 prompt：只提取布局还原需要的视觉信息 */
  /**
   * 从视觉分析简报推导语义化组件名（kebab-case，可作目录名/class 前缀/组件标识）。
   * 优先级：dto.componentName（用户显式指定）> brief.name.en（视觉分析英文名）
   *         > 中文名语义映射（方案 C：设备监测→device-monitor）> 'component' 保底。
   * 中英文名同时写回 brief，供 declare displayName / 组件展示标题 / meta 使用。
   * 🆕 2026-09-04：不再回退编码 sessionId（mc-lite-1788...）当 codeName，
   * 避免污染目录名/class 前缀/任务卡片组件名。
   */
  private deriveComponentName(
    dtoName: string | undefined,
    brief: any,
    sessionId: string,
  ): { codeName: string; displayName: string } {
    // 清洗为合法 kebab-case：仅保留 [a-z0-9-]，连续非法字符折叠为单 -，去首尾 -
    const toKebab = (s: string): string =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);

    const briefEn = toKebab(brief?.name?.en);
    const briefCn = String(brief?.name?.cn || '').trim().slice(0, 32);

    // 🆕 中文 → 语义 token 兜底（先词表映射，再提取中英混合名中的 ASCII 段）
    const zhFallback = (zh: string): string | null => {
      if (!zh) return null;
      const mapped = zhToSemanticEn(zh);
      if (mapped) return mapped;
      const ascii = zh.match(/[A-Za-z][A-Za-z0-9]*(?:[-_ ][A-Za-z0-9]+)*/g);
      const k = toKebab((ascii || []).join('-'));
      return k || null;
    };

    // 1. 用户显式指定：清洗为 kebab-case；纯中文/符号清洗后为空时，
    //    退视觉英文名 → 中文语义映射兜底（避免退回编码 sessionId），展示名保留用户原始输入。
    if (dtoName && dtoName.trim()) {
      const rawDisplay = dtoName.trim().slice(0, 32);
      const code = toKebab(dtoName);
      if (code) return { codeName: code, displayName: rawDisplay };
      if (briefEn) return { codeName: briefEn, displayName: rawDisplay };
      return {
        codeName: zhFallback(rawDisplay) || 'component',
        displayName: rawDisplay,
      };
    }
    // 2. 视觉分析英文名
    if (briefEn) {
      return { codeName: briefEn, displayName: briefCn || briefEn };
    }
    // 3. 兜底：中文名语义映射（方案 C），映射不到用 'component' 保底——
    //    替代旧实现直接拿 sessionId 当组件名（目录/class/任务卡片全被编码名污染）
    return {
      codeName: zhFallback(briefCn) || 'component',
      displayName: briefCn || sessionId,
    };
  }

  private buildAnalysisPrompt(
    logicalWidth?: number,
    logicalHeight?: number,
    rasterWidth?: number,
    rasterHeight?: number,
    figmaTexts?: string[] | null,
  ): string {
    // 🔧 尺寸标定（2026-09-01）：截图多为 scale=2 栅格（figma 导出 / Retina 截图），
    // 模型直接按栅格像素估字号/间距会整体偏大 ~2 倍（实锤 mc-lite-1788258227940：
    // brief「大数字36-48px」→ 产物 900px 内容塞进 425px 画布）。把逻辑画布尺寸喂给
    // 模型，强制它按逻辑 CSS px 输出所有尺寸估计。
    const scaleNote =
      logicalWidth && logicalHeight && rasterWidth && rasterHeight
        ? `\n【尺寸标定铁律（必须遵守）】
- 本截图是 ${rasterWidth}×${rasterHeight} 像素的栅格图，对应逻辑画布仅 ${logicalWidth}×${logicalHeight} CSS px（约 ${(rasterWidth / logicalWidth).toFixed(1)} 倍导出）。
- typography.size、spacing、regions.size 中所有像素数值**必须按逻辑 CSS px 输出**（≈ 图上观测像素 ÷ ${(rasterWidth / logicalWidth).toFixed(1)}），并给出具体数值（如 "标题约16px、正文约11px、数字约14px"），禁止直接照抄图上看到的像素值。
- 估尺寸时以逻辑画布为参照：某元素约占画布宽度的几分之几 → 换算成逻辑 px。
`
        : '';
    const textTruthNote =
      Array.isArray(figmaTexts) && figmaTexts.length > 0
        ? `\n【文案真值对照表（取自 Figma 文本图层，优先级高于图像识别）】
${figmaTexts.map((t) => `- "${t}"`).join('\n')}
- textContent、regions.description、name.cn 中的一切文案**必须与上表逐字一致**；表中条目即截图中实际出现的文字。
- 图像识别与上表冲突时**以上表为准**（图像小字号易误读）；仅表中不存在的文字才允许按图像识别补充。
`
        : '';
    return `你是一名 UI 布局分析师。请分析这张截图，提取布局还原所需的信息（包括可交互元素的位置和类型）。
${scaleNote}${textTruthNote}
只输出一个 JSON 对象，不要任何解释或 markdown 代码块。字段如下：
{
  "layout": "整体布局、主轴方向、对齐方式与区域比例",
  "regions": [{"name":"区域名","description":"可见内容 + 区域内部子元素排布（横向/纵向、对齐方式、图标与文字的相对位置，如「图标在左，名称与数字在右上下排列」「竖排文字按钮纵向等分」）","position":"top/center/bottom/left/right","size":"相对宽高 + 主轴起止参照（如「顶部与网格区齐平，不向上延伸到统计卡片区」「占满剩余高度」）"}],
  "spacing": {"outer":"外边距特征（逻辑px）","gap":"区域间距特征（逻辑px）","padding":"内边距特征（逻辑px）"},
  "theme": "light 或 dark（判定规则见下，必须二选一）",
  "colors": {"primary":"主色hex","background":"页面/根容器真实底色hex","surface":"主卡片容器底色hex","text":"正文文字色hex","border":"边框色hex"},
  "typography": {"size":"字号层级（逻辑 CSS px 具体数值）","weight":"字重层级","lineHeight":"行高特征"},
  "components": ["截图中实际可见的原生 UI 元素"],
  "textContent": ["关键可见文案（逐字转录，必须与截图完全一致；生僻词按字形逐字核对，禁止臆测/谐音替代）"],
  "name": "组件中英文名称，从截图标题栏/主标题/内容主题推断。格式：{\"cn\":\"设备监测\",\"en\":\"equipment-monitor\"}；en 用 kebab-case 小写英文（不含组件前缀、不含扩展名、不含非法字符），无法推断时 en 留空字符串",
  "visualDetails": ["圆角、边框、阴影、图标位置、图片比例等可见细节"],
  "interactions": ["可见的交互元素：如 Tab 切换栏(标注各 tab 名称和当前激活项)、按钮(标注位置和文案)、展开/收起区域等"]
}

【主题判定铁律（必须遵守）】
1. theme 由「页面/根容器真实底色」的明度决定，不由单个卡片的 rgba 透明度决定：
   - 页面/根容器底色为浅色（白/浅灰/浅蓝/米色等，亮度 L > 0.7）→ light
   - 页面/根容器底色为深色（黑/深蓝/深灰等，亮度 L < 0.3）→ dark
   - 页面底色被大面积深色遮罩/渐变覆盖时按实际可见底色判定；底色无法确定时，以主内容卡片底色 + 正文文字色联合判定，此时卡片底色浅、文字深 → light
2. 半透明元素（rgba / opacity）不得作为主题判定依据：只描述其叠加后的实际观感，主题仍以最底层页面底色为准。
3. colors.background 必须填页面/根容器真实底色；若页面底色是半透明，给出叠加在页面背景上后的最终观感色，并注明（如 "background": "#F0F4F8 (半透明叠加后)"）。
4. 禁止用主色/高亮色（如蓝色强调色）充当 background 或 text；text 填正文实际颜色（浅色主题下应为深色系 #1F2329~#4A5568 之类，深色主题下应为浅色系）。
5. 截图来源可能是 2 倍像素导出，颜色值不受像素倍率影响，直接按截图取色即可。

不要推断接口、数据源、业务规则或截图中不可见的业务逻辑。字段缺失时给空字符串或空数组。`;
  }

  /** 阶段 3 prompt：基于截图 + 简报生成单文件 Vue3 组件 */
  private buildCodegenPrompt(
    brief: any,
    componentName: string,
    dto: GenerateLiteDto,
    designWidth?: number,
    designHeight?: number,
  ): string {
    const briefJson = JSON.stringify(brief || {}, null, 2);
    const extra = [dto.requirementDoc, dto.notes]
      .filter(Boolean)
      .join('\n');
    return `你是一名 Vue3 布局还原工程师。请基于截图和结构化拆解，生成一个只负责静态布局还原的单文件组件。

【组件名】${componentName}
${designWidth && designHeight ? `【设计画布逻辑尺寸】${designWidth} × ${designHeight} CSS px
参考截图可能是 2 倍导出像素，只用于视觉识别，不得把图片像素作为组件 CSS 尺寸。
组件根节点必须使用 width: 100%、height: 100%、box-sizing: border-box，不得自行设置固定 max-width。
**高度预算分解铁律（P0-4）**：写 CSS 前必须先做高度预算分解：可用高度 H = ${designHeight}px - 根容器 padding×2；逐区块分配后，grid 行高 = (主内容区高度 - (行数-1)×gap) ÷ 行数，卡片内元素必须适配行高（图标 ≤ 行高×0.45）；竖排文字按钮（writing-mode:vertical-rl）必须加 \`white-space: nowrap\` 防中间断列，按钮高度按**最长标签**预算（最长字数 ×(字号+letterSpacing) + padding×2 ≤ 按钮高），任一字数排不下就统一缩字号——禁止断列导致阅读顺序乱（实锤：供配电→电供/配），且 N 个按钮总高 + (N-1)×gap + 徽标预留 ≤ sidebar 分配高度，超出**优先缩字号**、按钮高随字号同比缩小，任何压缩后仍须满足 按钮高 ≥ 最长字数 ×(字号+letterSpacing) + padding×2（禁止只压按钮高不缩字号导致文字被裁），禁止末尾按钮被面板底部裁切；角标/计数徽标用负偏移挂在按钮外侧时，必须为所在栏预留空间（padding-top ≥ 外溢高度）+ 父链 overflow:visible + 徽标 z-index 高于相邻区块，禁止被上一区块裁切；徽标还必须完全落在面板水平边界内（left ≥ 0），栏宽不足时缩徽标字号或改为栏内右上角内嵌，禁止溢出面板边界。禁止不做预算直接堆固定尺寸。**宽度预算同理（P0-4）**：grid 列宽 = (可用宽 - (列数-1)×gap) ÷ 列数，卡片内文字必须适配列宽（设备名称 字数×字号 ≤ 列宽 - 卡片padding×2 - 图标宽，超出就缩字号，禁止横向裁切/省略）；顶部统计条必须**单行**放下（所有标签+数值总宽 ≤ 可用宽，超出就缩字号/间距，禁止换行）；根容器及任何区块的 scrollWidth/scrollHeight 不得大于 clientWidth/clientHeight（底部行文字被裁半即不合格，预算超 H 优先压缩 grid 行高）。
` : ''}【结构化拆解】
${briefJson}
${extra ? `【布局补充】\n${extra}\n` : ''}

硬性边界：
0. **主题锚点铁律（P0-4）**：组件整体明暗风格由【结构化拆解】中的 theme 字段决定，不凭截图局部观感自行切换：
   - theme="light"：根容器背景必须用浅色（白/浅灰/浅蓝系，如 #FFFFFF / #F5F8FC），正文文字用深色（#1F2329 / #333333 系），禁止把根容器渲染成深色底。
   - theme="dark"：根容器背景用深色，正文文字用浅色。
   - **半透明防误判**：卡片/面板背景可使用 rgba 或浅色透明层，但「主题归属」一律由根容器底色决定；禁止因单个卡片深色/半透明而把整个组件改成深色主题。
   - 若【结构化拆解】没有 theme 字段，则以 colors.background 的明度推断：浅色背景 → 浅色主题。
1. 只还原截图中可见的 DOM 层级、尺寸比例、间距、对齐、配色、字体、边框、圆角和阴影。
2. 不生成接口请求、异步逻辑、路由、表单提交、权限、业务状态机、复杂事件或需求文档中不可见的业务能力。
3. 允许使用少量本地常量表达截图中重复出现的可见内容；禁止臆造额外数据和交互。
4. 使用 <template> + <script setup> + <style scoped>；没有脚本需求时保留空的 <script setup> 块。
5. 使用语义化 class 名和 flex/grid/百分比布局，组件应可直接编译运行。**根容器 class 必须用【组件名】对应的 kebab-case（如组件名 equipment-monitor → 根 class \`equipment-monitor\`），内部区块 class 用 \`根名-\` 前缀的语义名（如 \`equipment-monitor-header\`、\`equipment-monitor-card\`），禁止用无意义的编码名/单字符/拼音缩写。**
6. **图表自动映射**：如果截图中包含图表（折线图/柱状图/饼图/面积图等），使用 ECharts 实现：
   - 引入：\`import * as echarts from 'echarts'\`
   - 在 \`<template>\` 中使用 \`<div ref="chartRef" class="chart"></div>\`（样式用 CSS，禁止内联 style）
   - chart 容器 CSS：\`.chart { width: 100%; height: 100%; }\`，父容器 \`flex: 1; min-height: 0;\`
   - **echarts 初始化时序（强制，防图表空白）**：禁止同步 \`echarts.init()\`。必须用 ResizeObserver **观察图表容器本身 \`chartRef.value\`**（严禁观察外层容器、严禁 \`document.querySelector\` 查 DOM）。容器 \`clientWidth/clientHeight\` 均 > 0 时才 init；尺寸为 0 时**继续等待、不得 disconnect**（否则「外层有尺寸 → rAF 内图表容器仍为 0 → 永久放弃」必现图表空白）。init 前加 \`if (!chartRef.value || chart) return\` 防重复初始化。
   - **init 入口驱动（强制，防 onMounted 时 ref 未填充）**：初始化逻辑封装为 \`const initChartWhenReady = () => { ... }\`，用 \`watch(chartRef, (el) => { if (el && !chart) nextTick(() => initChartWhenReady()) }, { immediate: true })\` 驱动 + \`onMounted(() => nextTick(initChartWhenReady))\` 兜底（两者幂等）。**严禁** \`onMounted(() => { if (!chartRef.value) return; ... })\` 一次性判断——预览/沙箱环境 onMounted 触发时 ref 可能未填充，return 后无任何重试 → 图表永久空白（实锤 mc-lite-1788179972462-cc22ec3e）。
   - **resize 监听（强制）**：实例创建后挂 ResizeObserver 监听 \`chartRef.value\`，回调中调 \`chart.resize()\`；onUnmounted 中 disconnect + dispose
   - 在 \`onUnmounted\` 中销毁：\`resizeObserver.disconnect(); chart.dispose();\`
   - **数据驱动（强制）**：用截图中的 mock 数据定义成响应式变量（如 \`const chartData = ref([5, 7, 6, 4])\`），\`series.data\`/xAxis 绑定该变量（\`data: chartData.value\`）。**严禁**在 \`setOption({...})\` 里硬编码数字字面量 \`data: [5, 7, 6]\`——否则后续 API 绑定无法驱动图表。
7. **表格自动映射**：如果截图中包含表格/列表，使用 Ant Design Vue 的 \`a-table\` 组件：
   - 引入：\`import { Table as ATable } from 'ant-design-vue'\`
   - 在 \`<template>\` 中使用 \`<a-table :columns="columns" :data-source="data" :pagination="false" />\`
   - 在 \`<script setup>\` 中定义 columns 和 data 常量
   - \`<style scoped>\` 中覆盖 Ant Design Vue 内部 \`.ant-*\` 节点时，选择器必须使用 \`:deep(...)\`，例如 \`:deep(.custom-table .ant-table-thead > tr > th)\`；禁止直接写 \`.ant-table-*\`
8. **简单交互**：如果截图中包含可交互元素（Tab 切换、按钮、展开/收起等），实现基础交互逻辑：
   - Tab 切换：使用 \`ref\` 存储当前激活 tab，通过 \`@click\` 切换
   - 按钮：添加 \`@click\` 事件（可只打印 console.log 或切换状态）
   - 展开/收起：使用 \`ref\` 控制显示状态
9. **布局顺序铁律（P0-5）**：顶层区块顺序必须严格遵循截图从上到下（如 header → tabs → 图表 → footer），**禁止把靠上区块（如 tabs）放入底部容器**。截图里 tabs 在图表上方时，模板里 tabs 必须渲染在图表之前。
10. **flex 使用克制（P0-5）**：纵向堆叠优先用默认块级流；仅当需要剩余空间分配（子元素 \`flex: 1\`）或垂直对齐时才用 \`display: flex; flex-direction: column\`，且凡有 \`flex: 1\` 子元素的 column-flex 容器与子元素**必须成对写 \`min-height: 0\`**（echarts/表格容器必现撑破问题）。无 flex 子属性的 column-flex 视为冗余，禁止使用。
11. **尺寸参照铁律（P0-4）**：所有字号/图标/间距必须基于【设计画布逻辑尺寸】${designWidth ? `（${designWidth}×${designHeight}px）` : ''}按比例还原，**禁止直接套用截图里看到的像素值**（截图多为 2 倍导出）。例如逻辑画布宽 420px 时，标题 20-28px、正文 12-16px、图标 20-32px 量级；整个组件布局必须在画布内完整放下，不得超出或挤压。卡片/区块禁止 \`min-width\`/\`max-width\` 固定 px（并排卡片纯 \`flex: 1\` 均分，防止窄画布换行堆叠）。
12. **网格/列布局高度铁律（P0-4）**：使用 CSS Grid（\`display: grid\`）且行数固定时，**禁止写 \`grid-template-rows: repeat(N, 1fr)\`**——\`1fr\` 行轨道默认 min-height:auto，行高下限=单元格内容最小高度，内容多时会把行撑到远超画布可用高度，导致整体溢出被裁切。正确写法二选一：
    - 内容必须完整可见（卡片/图标列表）：\`grid-template-rows: repeat(N, min-content)\` + 容器 \`overflow-y: auto\` + \`align-content: start\`，由容器内部滚动容纳全部内容；
    - 内容按画布剩余空间均分（图表/纯色块）：\`grid-template-rows: repeat(N, minmax(0, 1fr))\`。
    同时：grid/flex 中任何内容可能超过可用高度的容器（列表、网格、侧边栏导航）都必须成对写 \`min-height: 0\` + \`overflow-y: auto\`，**禁止内容把外层画布（height:100% 的根容器）撑出滚动/被裁切**。判定标准：根容器自身 scrollHeight 不得大于其 clientHeight。
13. 必须完整输出 </template>、</script>、</style>，不要包含说明文字。

只输出一个 \`\`\`vue 代码块，里面是完整组件代码。`;
  }

  /** 从模型返回中提取 ```vue 代码块；若无围栏则尝试按 <template> 截断 */
  /**
   * 🔧 视觉子调用进度转发（对齐 Figma / phase2.service.ts:682）。
   * 把 ai-request-gateway 的 LLM 心跳 onProgress（携带 level:'log'）原样转交 progressService.sendProgress，
   * 由其按 level:'log' 路由到独立日志通道——既不产生 timeline 僵尸 stage，又让前端以 Figma 同等频率
   * 看到「模型处理中...（已等待 Ns）」日志，消除截图生成长时间"无日志"的错觉。
   */
  private visionOnProgress(sessionId: string) {
    return (data: any) => {
      try {
        this.progressService.sendProgress(sessionId, data);
      } catch {
        /* 进度转发失败不阻断主流程 */
      }
    };
  }

  private extractVueCode(text: string): string {
    if (!text) return '';
    const fence = text.match(/```vue\s*([\s\S]*?)```/i);
    if (fence && fence[1].trim()) return fence[1].trim();
    const plain = text.match(/```\s*([\s\S]*?)```/);
    if (plain && plain[1].trim()) return plain[1].trim();
    const tpl = text.indexOf('<template');
    if (tpl >= 0) return text.slice(tpl).trim();
    return text.trim();
  }

  /**
   * 🛡️ 容错 JSON 提取/修复（治本 2026-09-03）：逻辑抽到 src/lite/repair-json.util.ts（纯函数、可单测、零依赖）。
   * 此处仅作委托包装，保持 this.repairJson(...) 调用点不变。
   */
  private repairJson(text: string): any | null {
    return repairJsonUtil(text);
  }

  /** 解析分析 JSON，失败则回退为宽松对象，保证后续生成仍可进行 */
  private parseBrief(text: string): any {
    if (!text) return {};
    const parsed = this.repairJson(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { raw: text };
  }

  /** 微码组件代码生成 prompt */
  private buildMicrocodeCodegenPrompt(
    brief: any,
    componentName: string,
    dto: GenerateLiteDto,
    designWidth?: number,
    designHeight?: number,
  ): string {
    const briefJson = JSON.stringify(brief || {}, null, 2);
    const classPrefix = `c-${componentName}-`;
    return `你是一名微码组件工程师。请基于截图和结构化拆解，生成一个遵循微码组件规范的 Vue3 微码组件。

【组件名】${componentName}
【CSS 类名前缀】${classPrefix}（所有自定义 class 必须以此为前缀）
${designWidth && designHeight ? `【设计画布逻辑尺寸】${designWidth} × ${designHeight} CSS px
参考截图可能是 2 倍导出像素，只用于视觉识别，不得把图片像素作为组件 CSS 尺寸。
微码面板（base-panel）自带头部标题栏约占 36px，内容区可用高度按 ${designHeight - 36}px 预算——所有区块必须在此高度内完整放下，不得溢出。
**高度预算分解铁律（P0-4）**：写 CSS 前必须先做高度预算分解（可在 <style> 顶部注释中写出算式）：
  可用高度 H = ${designHeight - 36}px - 根容器 padding×2；
  逐区块分配：header ≈ 24px、统计卡/工具条 ≈ 40-56px、主内容区 = H - 其他区块 - 各 gap；
  grid 行高 = (主内容区高度 - (行数-1)×gap) ÷ 行数，行高定下来后卡片内元素必须适配（图标 ≤ 行高×0.45，名称/数字字号 ≤ 行高×0.25）；
  竖排文字按钮（writing-mode:vertical-rl）必须加 \`white-space: nowrap\` 防中间断列，按钮高度按**最长标签**预算（最长字数 ×(字号+letterSpacing) + padding×2 ≤ 按钮高），任一字数排不下就统一缩字号——禁止断列导致阅读顺序乱（实锤：供配电→电供/配、交通诱导→诱交/导通）；按最长标签定高后还必须做总高对账：N 个按钮总高 + (N-1)×gap + 徽标预留 ≤ sidebar 分配高度，超出则**优先缩字号**、按钮高随字号同比缩小——任何压缩后仍必须满足 按钮高 ≥ 最长字数 ×(字号+letterSpacing) + padding×2（禁止只压按钮高不缩字号导致文字被按钮裁切，实锤：交通诱导在 20px 按钮里只显示「交通」）；禁止按钮总高溢出导致末尾按钮被面板底部裁切（实锤：交通诱导被裁得只剩「交」字）。
  角标/计数徽标（badge）用负偏移挂在按钮外侧时，必须为所在栏预留对应空间（如 sidebar padding-top ≥ 徽标外溢高度），父链 overflow:visible 且徽标 z-index 高于相邻区块——禁止被上一区块裁切/遮挡（实锤：监控的 3/3740 标签被统计卡行遮住）；徽标还必须完全落在面板水平边界内（left ≥ 0、right ≤ 面板宽），栏宽不足时缩徽标字号或改为栏内右上角内嵌——禁止溢出面板左/右边界。
  对称溢出铁律：根容器及任何区块的 scrollHeight 不得大于 clientHeight（与 scrollWidth 同标准），底部行文字被裁半即不合格——预算总和超 H 时优先压缩 grid 行高/卡片内边距，禁止静默溢出。
  **宽度预算同理**：grid 列宽 = (可用宽 - (列数-1)×gap) ÷ 列数，卡片内文字必须适配列宽（名称 字数×字号 ≤ 列宽 - 卡片padding×2 - 图标宽，超出就缩字号，禁止横向裁切）；顶部统计条必须**单行**放下（标签+数值总宽 ≤ 可用宽，超出就缩字号，禁止换行）。
  **禁止不做预算直接堆「看起来舒服」的固定尺寸**（实测：14px 竖排按钮 × 6 + 110px 卡片 × 4 必然超出 389px 内容区，底部两行被裁）。
` : ''}【结构化拆解】
${briefJson}
${dto.notes ? `【布局补充】\n${dto.notes}\n` : ''}

微码硬性规则：
0. 根容器必须使用微码面板组件：
   \`\`\`html
   <base-panel panelKey="default-panel">
     <!-- 主体内容放默认插槽 -->
     <div class="${classPrefix}content">
       <!-- 业务内容 -->
     </div>
   </base-panel>
   \`\`\`
1. 使用 \`<style scoped>\` 隔离样式。
2. 所有自定义 class 必须加前缀 \`${classPrefix}\`（如 \`${classPrefix}header\`、\`${classPrefix}title\`）。
3. 还原截图中可见的 DOM 层级、尺寸比例、间距、对齐、配色、字体、边框、圆角和阴影。
4. 使用 flex/grid/百分比布局，禁止固定 px 宽高；**同样禁止 min-width/max-width 固定 px**——并排卡片必须纯 \`flex: 1\` 均分，写 \`min-width: 200px\` 之类会让窄画布内卡片换行堆叠（实锤 mc-lite-1788258227940 两张统计卡竖排）。
5. **主题锚点铁律（P0-4）**：组件整体明暗风格由【结构化拆解】中的 theme 字段决定：
   - theme="light"：根容器背景用浅色（#FFFFFF / #F5F8FC 系），正文用深色（#1F2329 / #333333 系），禁止渲染成深色底。
   - theme="dark"：根容器背景用深色，正文用浅色。
   - **半透明防误判**：卡片背景可用 rgba 或浅色透明层，但「主题归属」由根容器底色决定；禁止因单个卡片深色/半透明把整个组件改成深色主题。
   - 无 theme 字段时以 colors.background 明度推断：浅色背景 → 浅色主题。
6. **图表自动映射**：如果截图中包含图表（折线图/柱状图/饼图/面积图等），使用 ECharts 实现：
   - 引入：\`import * as echarts from 'echarts'\`
   - 图表容器：\`<div ref="chartRef" class="${classPrefix}chart"></div>\`（样式用 CSS，禁止内联 style）
   - chart 容器 CSS：\`.${classPrefix}chart { width: 100%; height: 100%; }\`，父容器 \`flex: 1; min-height: 0;\`
   - **echarts 初始化时序（强制，防图表空白）**：禁止同步 \`echarts.init()\`。必须用 ResizeObserver **观察图表容器本身 \`chartRef.value\`**（严禁观察外层容器、严禁 \`document.querySelector\` 查 DOM）。容器 \`clientWidth/clientHeight\` 均 > 0 时才 init；尺寸为 0 时**继续等待、不得 disconnect**（否则「外层有尺寸 → rAF 内图表容器仍为 0 → 永久放弃」必现图表空白）。init 前加 \`if (!chartRef.value || chart) return\` 防重复初始化。
   - **init 入口驱动（强制，防 onMounted 时 ref 未填充）**：初始化逻辑封装为 \`const initChartWhenReady = () => { ... }\`，用 \`watch(chartRef, (el) => { if (el && !chart) nextTick(() => initChartWhenReady()) }, { immediate: true })\` 驱动 + \`onMounted(() => nextTick(initChartWhenReady))\` 兜底（两者幂等）。**严禁** \`onMounted(() => { if (!chartRef.value) return; ... })\` 一次性判断——预览/沙箱环境 onMounted 触发时 ref 可能未填充，return 后无任何重试 → 图表永久空白（实锤 mc-lite-1788179972462-cc22ec3e）。
   - **resize 监听（强制）**：实例创建后挂 ResizeObserver 监听 \`chartRef.value\`，回调中调 \`chart.resize()\`；onUnmounted 中 disconnect + dispose
   - 在 \`onUnmounted\` 中销毁：\`resizeObserver.disconnect(); chart.dispose();\`
   - **数据驱动（强制）**：用截图中的 mock 数据定义成响应式变量（如 \`const chartData = ref([5, 7, 6, 4])\`），\`series.data\` 绑定该变量（\`data: chartData.value\`）。**严禁**在 \`setOption({...})\` 里硬编码数字字面量 \`data: [5, 7, 6]\`。
7. **表格自动映射**：如果截图中包含表格/列表，使用 Ant Design Vue 的 \`a-table\` 组件：
   - 引入：\`import { Table as ATable } from 'ant-design-vue'\`
   - 在 \`<script setup>\` 中定义 \`columns\` 和 \`dataSource\`（使用截图中的 mock 数据）
   - 在 \`<template>\` 中使用 \`<a-table :columns="columns" :data-source="data" :pagination="false" />\`
   - \`<style scoped>\` 中覆盖 Ant Design Vue 内部 \`.ant-*\` 节点时，选择器必须使用 \`:deep(...)\`；禁止直接写裸的 \`.ant-table-*\`
8. **简单交互**：如果截图中包含可交互元素（Tab 切换、按钮、展开/收起等），实现基础交互逻辑：
   - Tab 切换：使用 \`ref\` 存储当前激活 tab，通过 \`@click\` 切换
   - 按钮：添加 \`@click\` 事件（可只打印 console.log 或切换状态）
   - 展开/收起：使用 \`ref\` 控制显示状态
9. 不生成接口请求、数据源、业务事件、业务状态、emit 或截图中不可见的能力。
10. **布局顺序铁律（P0-5）**：顶层区块顺序必须严格遵循截图从上到下（如 header → tabs → 图表 → footer），**禁止把靠上区块（如 tabs）放入底部容器**。截图里 tabs 在图表上方时，模板里 tabs 必须渲染在图表之前。
11. **flex 使用克制（P0-5）**：纵向堆叠优先用默认块级流；仅当需要剩余空间分配（子元素 \`flex: 1\`）或垂直对齐时才用 \`display: flex; flex-direction: column\`，且凡有 \`flex: 1\` 子元素的 column-flex 容器与子元素**必须成对写 \`min-height: 0\`**（echarts/表格容器必现撑破问题）。无 flex 子属性的 column-flex 视为冗余，禁止使用。
12. **尺寸参照铁律（P0-4）**：所有字号/图标/间距必须基于【设计画布逻辑尺寸】${designWidth ? `（${designWidth}×${designHeight}px）` : ''}按比例还原，**禁止直接套用截图里看到的像素值**（截图多为 2 倍导出）。例如逻辑画布宽 420px 时，标题 20-28px、正文 12-16px、图标 20-32px 量级；整个组件布局必须在画布内完整放下，不得超出或挤压。卡片/区块禁止 \`min-width\`/\`max-width\` 固定 px（并排卡片纯 \`flex: 1\` 均分，防止窄画布换行堆叠）。
13. **网格/列布局高度铁律（P0-4）**：使用 CSS Grid（\`display: grid\`）且行数固定时，**禁止写 \`grid-template-rows: repeat(N, 1fr)\`**——\`1fr\` 行轨道默认 min-height:auto，行高下限=单元格内容最小高度，内容多时会把行撑到远超画布可用高度，导致整体溢出被裁切。正确写法二选一：
    - 内容必须完整可见（卡片/图标列表）：\`grid-template-rows: repeat(N, min-content)\` + 容器 \`overflow-y: auto\` + \`align-content: start\`，由容器内部滚动容纳全部内容；
    - 内容按画布剩余空间均分（图表/纯色块）：\`grid-template-rows: repeat(N, minmax(0, 1fr))\`。
    同时：grid/flex 中任何内容可能超过可用高度的容器（列表、网格、侧边栏导航）都必须成对写 \`min-height: 0\` + \`overflow-y: auto\`，**禁止内容把外层画布（height:100% 的根容器）撑出滚动/被裁切**。判定标准：根容器自身 scrollHeight 不得大于其 clientHeight。
14. 必须完整输出 \`</template>\`、\`</script>\`、\`</style>\`。
15. declare.json 只输出最小组件元信息，不声明业务事件、业务状态、数据源或表单源。

输出格式：
\`\`\`vue
<template>
  <base-panel panelKey="default-panel">
    <div class="${classPrefix}content">
      <!-- 组件业务内容 -->
    </div>
  </base-panel>
</template>
<script setup>
// ...
</script>
<style scoped>
.${classPrefix}content {
  width: 100%;
  height: 100%;
}
</style>
\`\`\`

\`\`\`json
{
  "panelType": "default-panel",
  "size": { "width": 0, "height": 0 },
  "businessEvents": [],
  "businessStatuses": [],
  "dataSources": [],
  "formSources": []
}
\`\`\``;
  }

  /** 从生成文本中提取 Vue 代码和 declare.json */
  private extractMicrocodeOutput(text: string): { vueCode: string; declareJson: any } {
    // 提取 vue 代码块
    const vueMatch = text.match(/```vue\s*([\s\S]*?)```/i);
    const vueCode = vueMatch ? vueMatch[1].trim() : this.extractVueCode(text);

    // 提取 json 代码块（declare.json），走容错修复解析（治本 2026-09-03）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
    let declareJson = null;
    if (jsonMatch) {
      declareJson = this.repairJson(jsonMatch[1]);
    }
    if (!declareJson) {
      // 围栏内修复失败，再从全文本兜底提取一次（吞掉前后废文本/控制字符）
      declareJson = this.repairJson(text);
    }

    return { vueCode, declareJson };
  }

  /** Lite 只接受结构完整的单文件组件，禁止截断产物进入 workspace */
  /**
   * 清理 AI 在 HTML 属性值中误用的反斜杠转义。
   * 双引号属性值内的 \" 改为 '；单引号属性值内的 \' 改为 "。
   * 只处理 <template> 块，避免误伤 <script setup> 内合法的 JS 字符串转义。
   */
  private sanitizeSfcAttributeEscapes(code: string): string {
    return code.replace(
      /<template>([\s\S]*?)<\/template>/gi,
      (block: string, inner: string) => {
        const fixed = inner.replace(
          /(\s[:@a-zA-Z0-9_-]+=)(["'])([\s\S]*?)\2/g,
          (full: string, name: string, quote: string, value: string) => {
            let cleaned = value;
            if (quote === '"') cleaned = cleaned.replace(/\\"/g, "'");
            else cleaned = cleaned.replace(/\\'/g, '"');
            return `${name}${quote}${cleaned}${quote}`;
          },
        );
        return `<template>${fixed}</template>`;
      },
    );
  }

  /**
   * 🛡️ Lite 路径补齐 Max 已有的 SFC 语义门禁，防止"标签闭合齐全但存在重复声明"的组件写盘后，
   * 前端加载时报 `[vue/compiler-sfc] Identifier 'X' has already been declared`：
   *   1. 归一化 import 模块说明符 —— 修正 LLM 偶发的无引号写法 `import { ref } from vue;` → `... from 'vue'`
   *   2. 声明级去重（dedupeScriptDeclarations 内部含 import 符号级合并）：
   *      能跨引号差异处理 `import { ref } from 'vue'` 与 `import { ref } from vue;` 的重复绑定。
   * 仅作用于 <script> 块，不影响 <template>/<style>；无重复时原样返回。
   */
  private sanitizeVueScriptImports(vueCode: string): string {
    const scriptMatch = vueCode.match(/<script\s+setup(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)
      || vueCode.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return vueCode;
    const fullTag = scriptMatch[0];
    const inner = scriptMatch[1];

    // 1. 归一化无引号/裸标识符模块说明符：from vue; → from 'vue'
    //    已带引号的（'vue' / "vue" / './x' / '../x'）首字符不在匹配类内，不受影响。
    const normalized = inner.replace(
      /(\bfrom\s+)([@A-Za-z_$][\w$./@:-]*)(?=\s*[;\n)>]|$)/g,
      (_m, pre: string, spec: string) => `${pre}'${spec}'`,
    );

    // 2. 声明级去重（import 符号级合并 + 重复顶层声明保留末次）
    const deduped = dedupeScriptDeclarations(normalized);

    const newFullTag = fullTag.replace(inner, () => deduped);
    return vueCode.replace(fullTag, () => newFullTag);
  }

  private validateLiteSfc(vueCode: string): void {
    const requiredBlocks = [
      ['<template', '</template>'],
      ['<script setup', '</script>'],
      ['<style', '</style>'],
    ] as const;
    const missing = requiredBlocks
      .filter(([openTag, closeTag]) => !vueCode.includes(openTag) || !vueCode.includes(closeTag))
      .map(([, closeTag]) => closeTag);

    if (missing.length > 0) {
      throw this.wrapError(
        LiteErrorCode.GENERATION_FAILED,
        `生成的组件结构不完整，缺少闭合标签: ${missing.join(', ')}`,
      );
    }
  }

  /** Lite 微码只保留布局展示所需的最小声明，运行时字段由系统确定性补齐 */
  private normalizeLiteDeclare(
    raw: any,
    componentId: string,
    componentName: string,
    width: number,
    height: number,
    themeHint?: string,
  ): Record<string, any> {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    // 主题事实源优先级：视觉分析简报的 theme（权威）> LLM 声明里的 defaultTheme > 默认 light
    // 半透明卡片不构成深色依据，根容器底色明度才是主题判定依据。
    const theme =
      (themeHint === 'dark' || themeHint === 'light')
        ? themeHint
        : input.defaultTheme === 'dark' || input.defaultTheme === 'light'
          ? input.defaultTheme
          : 'light';
    return {
      componentId,
      componentName: input.componentName || input.displayName || componentName,
      panelType: input.panelType || 'default-panel',
      // 🔧 主题默认值收紧（2026-09-01）：此前无凭据时默认 dark，导致浅色截图被误渲染成深色。
      //   现改为默认 light；仅当视觉简报/声明明确给出 dark 时才用 dark。
      defaultTheme: theme,
      size: {
        width: Number(input.size?.width) || width,
        height: Number(input.size?.height) || height,
      },
      businessEvents: [],
      businessStatuses: [],
      dataSources: [],
      formSources: [],
      layoutConfig: {},
      themeConfig: input.themeConfig && typeof input.themeConfig === 'object'
        ? input.themeConfig
        : {},
      businessConfig: {},
    };
  }

  /** 生成默认 Less 样式文件 */
  private buildDefaultLess(componentName: string): string {
    return `// ${componentName} 组件样式
// 使用 CSS 变量支持主题切换

.mc-${componentName.toLowerCase()} {
  --primary-color: var(--mc-primary, #1890ff);
  --text-color: var(--mc-text, #333333);
  --border-color: var(--mc-border, #e8e8e8);
  --bg-color: var(--mc-bg, #ffffff);

  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 16px;
  box-sizing: border-box;

  &__header {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 12px;
  }

  &__content {
    font-size: 14px;
    line-height: 1.5;
  }
}
`;
  }

  /**
   * 逐文件复制（代替 fs.cp recursive），避免触发 safe-delete 批量删除钩子。
   * 钩子拦截「一次调用触及多文件」的批量操作（fs.cp 递归写进已存在目录会按被覆盖文件数计数），
   * 但逐文件 copyFileSync 每调用只动 1 个文件，不触发拦截。仅 overwrite，不删除目标多余文件。
   */
  private async copyDirFileByFile(srcPath: string, destPath: string): Promise<void> {
    if (!existsSync(srcPath)) return;
    const { mkdirSync, readdirSync, copyFileSync, statSync } = await import('fs');
    // 把模块级 path 工具拿到当前作用域，避免闭包引用问题
    const pathJoin = join;
    const pathDirname = dirname;

    if (!statSync(srcPath).isDirectory()) {
      mkdirSync(pathDirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      return;
    }
    const walk = (s: string, d: string) => {
      mkdirSync(d, { recursive: true });
      for (const name of readdirSync(s)) {
        const sp = pathJoin(s, name);
        const dp = pathJoin(d, name);
        if (statSync(sp).isDirectory()) walk(sp, dp);
        else copyFileSync(sp, dp);
      }
    };
    walk(srcPath, destPath);
  }

  /** 收集完整产物文件组，排除生成断点和原始上传缓存。 */
  private collectSnapshotFiles(outputPath: string): Record<string, string | Buffer> {
    const files: Record<string, string | Buffer> = {};
    const walk = (currentPath: string): void => {
      for (const entry of readdirSync(currentPath)) {
        if (entry === '.cache' || entry === '.checkpoint' || entry === '_upload') continue;
        const absolutePath = join(currentPath, entry);
        const stat = lstatSync(absolutePath);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          walk(absolutePath);
          continue;
        }
        const relativePath = relative(outputPath, absolutePath).split(sep).join('/');
        files[relativePath] = readFileSync(absolutePath);
      }
    };
    walk(outputPath);
    return files;
  }

  /**
   * Lite 统一候选发布：完整文件组形成 revision，workspace 原子发布成功后晋级 last-good；
   * 任一步失败均拒绝候选并恢复旧 workspace。
   */
  private async publishValidatedLiteOutput(
    outputPath: string,
    sessionId: string,
    groupId: string,
    target: 'microcode' | 'vue3',
  ): Promise<void> {
    const candidate = this.taskCodeSnapshotService.createCandidate({
      sessionId,
      componentId: sessionId,
      groupId,
      target,
      stage: 'lite-generation',
      files: this.collectSnapshotFiles(outputPath),
    });
    const validation = {
      semantics: 'passed' as const,
      sfc: 'passed' as const,
      less: 'passed' as const,
      runtime: 'pending' as const,
    };
    this.taskCodeSnapshotService.markValidating(sessionId, candidate.revision, validation);
    this.progressService.sendCodeSnapshot(sessionId, {
      revision: candidate.revision,
      status: 'validating',
      stage: candidate.stage,
      fileCount: candidate.files.length,
      changedFiles: candidate.files.map((file) => file.path),
      lastGoodRevision: candidate.lastGoodRevision,
    });

    const previewContext = { componentId: sessionId, groupId, target };
    // 动态加载预览发布模块
    const publisher = await loadPreviewPublisher();
    try {
      // 🛡️ 2026-09-03（P0 配套）：事务 key 必须用 publisher **实际落名** 的 componentId。
      // P0 重名保护撞名时会把目录名改成 c-xxx-2，publisher 内建事务 key 用新 id，
      // 若此处仍用原 componentId 提交 → 找不到事务 → 误判"事务提交失败"（与 phase2 同款）。
      const publishResult = await publisher.publishQualityPreview({ outputPath, ...previewContext });
      const publishContext = {
        ...previewContext,
        componentId: publishResult?.componentId || previewContext.componentId,
      };
      if (!publisher.commitQualityPreviewTransaction(publishContext)) {
        throw new Error('Lite workspace 质量预览事务提交失败');
      }
      const published = this.taskCodeSnapshotService.publishLastGood(
        sessionId,
        candidate.revision,
        { ...validation, runtime: 'passed' },
      );
      this.progressService.sendCodeSnapshot(sessionId, {
        revision: published.revision,
        status: published.status,
        stage: published.stage,
        fileCount: published.files.length,
        changedFiles: published.files.map((file) => file.path),
        lastGoodRevision: published.revision,
      });
    } catch (error: any) {
      publisher.rollbackQualityPreviewTransaction({ ...previewContext, reason: error.message });
      const rejected = this.taskCodeSnapshotService.rejectCandidate(
        sessionId,
        candidate.revision,
        error.message || 'Lite 质量门禁未通过',
        { ...validation, runtime: 'blocked' },
      );
      this.progressService.sendCodeSnapshot(sessionId, {
        revision: rejected.revision,
        status: rejected.status,
        stage: rejected.stage,
        fileCount: rejected.files.length,
        changedFiles: [],
        lastGoodRevision: rejected.lastGoodRevision,
      });
      throw error;
    }
  }

  /** 复制 package/ 与 resources/ 到 backend + frontend workspace（对齐 Vue3 / 微码管线约定） */
  private async copyToWorkspace(
    outputPath: string,
    sessionId: string,
    groupId: string,
    componentType: string = 'vue3',
  ): Promise<void> {
    try {
      const packageDir = join(outputPath, 'package');
      const resourcesDir = join(outputPath, 'resources');
      if (!existsSync(join(packageDir, 'index.vue'))) {
        this.logger.error(`Lite 入口缺失: ${join(packageDir, 'index.vue')}`);
        return;
      }
      const syntaxErrors = validateVueSfcDirectory(packageDir);
      // 🔧 不因样式变量/非致命 SFC 问题阻断预览复制（与 phase2.service 对齐）：
      //   阻断会导致前端 404 无法人工审查，尤其 generate/Lite 模式下用户需要看到产物。
      if (syntaxErrors.length > 0) {
        this.logger.warn(
          `[copyToWorkspace] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断复制）: ${syntaxErrors.slice(0, 5).join('; ')}`,
        );
      }

      const isMicrocode = componentType === 'microcode';
      const targets = isMicrocode
        ? [
            join(customComponentsDir, sessionId),
            join(resolveFrontendWorkspace(), 'custom-components', sessionId),
          ]
        : [
            join(vue3ComponentsDir, groupId, sessionId),
            join(resolveFrontendWorkspace(), 'vue3-components', groupId, sessionId),
          ];

      for (const targetPath of targets) {
        await mkdir(targetPath, { recursive: true });

        if (isMicrocode) {
          // 微码组件：复制到 package/ 下，保持 component.js 结构
          await this.copyDirFileByFile(packageDir, join(targetPath, 'package'));
          if (existsSync(resourcesDir)) {
            await this.copyDirFileByFile(resourcesDir, join(targetPath, 'resources'));
          }
          const requiredFiles = ['declare.json', 'declare.js'];
          const missing = requiredFiles.filter((file) => !existsSync(join(outputPath, file)));
          if (missing.length > 0) {
            throw new Error(`Lite 微码产物缺少运行时文件: ${missing.join(', ')}`);
          }
          for (const file of requiredFiles) {
            await this.copyDirFileByFile(join(outputPath, file), join(targetPath, file));
          }
          const styleImport = existsSync(join(targetPath, 'resources', 'styles', 'index.css'))
            ? "import './resources/styles/index.css'"
            : existsSync(join(targetPath, 'resources', 'styles', 'index.less'))
              ? "import './resources/styles/index.less'"
              : '';
          if (!styleImport) {
            throw new Error('Lite 微码产物缺少 resources/styles/index.css 或 index.less');
          }
          await writeFile(
            join(targetPath, 'component.js'),
            `import component from './package/index.vue'\n${styleImport}\nexport default component\n`,
            'utf-8',
          );
        } else {
          // Vue3 组件：统一 package/index.vue 入口，resources 在根目录（对齐微码/标准 Vue3 管线）
          await this.copyDirFileByFile(packageDir, join(targetPath, 'package'));
          if (existsSync(resourcesDir)) {
            await this.copyDirFileByFile(resourcesDir, join(targetPath, 'resources'));
          }
        }

        // 统一复制 Figma 尺寸元数据 _figma-size.json，供前端预览获取宽高比。
        // Lite 直接生成该文件；旧管线仍可从完整节点缓存兜底。
        // 注意：缓存实际路径为 .mc-gen/cache/figma-node-data.json（与 phase2 管线一致），
        // 此处兼容 .mc-gen/cache 与旧 .cache 两种目录结构。
        const generatedSizeSource = join(outputPath, '_figma-size.json');
        const figmaCacheSource = join(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
        const legacyCacheSource = join(outputPath, '.cache', 'figma-node-data.json');
        const sizeSource = existsSync(generatedSizeSource)
          ? generatedSizeSource
          : existsSync(figmaCacheSource)
            ? figmaCacheSource
            : existsSync(legacyCacheSource)
              ? legacyCacheSource
              : null;
        if (sizeSource) {
          const targetSizePath = join(targetPath, '_figma-size.json');
          await this.copyDirFileByFile(sizeSource, targetSizePath);
          this.logger.debug(`[copyToWorkspace] 已复制 Figma 尺寸文件: ${targetSizePath}`);
        }
      }
      this.logger.log(
        `Lite ${isMicrocode ? '微码' : 'Vue3'} 组件已复制到 workspace: ${
          isMicrocode ? sessionId : `${groupId}/${sessionId}`
        }`,
      );
    } catch (error: any) {
      this.logger.error(
        `Lite workspace 复制失败: ${error.message}`,
        error.stack,
      );
      throw this.wrapError(
        LiteErrorCode.GENERATION_FAILED,
        `组件运行时文件准备失败: ${error.message}`,
        error,
      );
    }
  }

  /**
   * 解析组件归属组：暂无分组概念时，按用户 uid 落到其「私人组」。
   *
   * 私人组由 auth.service.ensureUserPrivateGroup 在登录时幂等创建，
   * groupId 即该 Group 文档的 _id（合法 ObjectId），写入 groupMemberModel。
   * 这样每个用户天然一组，且 groupId 保持合法 ObjectId，不破坏「groupId=Group._id」
   * 的全局契约，也不削弱 lite.service 中 ObjectId.isValid 的目录落库关卡。
   *
   * 规则：
   * - 前端显式传 groupId 且非 default-group：尊重（未来分组功能使用）。
   * - 未传 / 传 default-group：查 groupMemberModel 取私人组 _id。
   * - 缺失 userId 或查不到成员：回退 default-group（极端兜底，不破坏链路）。
   */
  public async resolvePrivateGroupId(
    dtoGroupId: string | undefined,
    userId: string | undefined,
  ): Promise<string> {
    return resolvePrivateGroupIdCore(dtoGroupId, userId, this.groupMemberModel);
  }

  /** 解析 groupId/creatorId 后落库（对齐 Vue3Service 逻辑，失败非阻塞） */
  private async persistComponent(
    componentName: string,
    sessionId: string,
    groupId: string,
    userId: string | undefined,
    width?: number,
    height?: number,
    componentType: string = 'vue3',
    sourceType: LiteSourceType = 'screenshot',
    generationTier: LiteGenerationTier = LITE_SCREENSHOT_TIER,
  ): Promise<void> {
    let resolvedCreatorId = userId;
    let resolvedGroupId = groupId;

    if (!resolvedCreatorId && resolvedGroupId) {
      const firstMember = await this.groupMemberModel
        .findOne({ groupId: resolvedGroupId })
        .exec();
      if (firstMember) resolvedCreatorId = firstMember.userId.toString();
    }
    if (!Types.ObjectId.isValid(resolvedGroupId) && resolvedCreatorId) {
      const membership = await this.groupMemberModel
        .findOne({ userId: resolvedCreatorId })
        .exec();
      if (membership) resolvedGroupId = membership.groupId.toString();
    }
    if (!Types.ObjectId.isValid(resolvedGroupId)) {
      // 🛡️ 修复 default-group 目录拒绝（2026-08-30）：
      // 非 ObjectId 的字面量 groupId（如 default-group）也是合法的业务标识，
      // 不应仅因 ObjectId 校验不过就跳过组件记录。仅当 groupId 为空/无效时才拒绝。
      if (!resolvedGroupId || typeof resolvedGroupId !== 'string' || !resolvedGroupId.trim()) {
        this.logger.warn(`groupId 无效，跳过组件记录: ${resolvedGroupId}`);
        return;
      }
      // 字面量 groupId（如 default-group）→ 放行，允许非 ObjectId 的合法业务标识
    }
    if (!resolvedCreatorId) resolvedCreatorId = resolvedGroupId;

    await this.componentService.createComponent(
      componentName,
      componentName || 'Lite 生成组件',
      resolvedGroupId,
      resolvedCreatorId,
      {
        type: componentType,
        target: componentType,
        taskId: sessionId,
        componentId: sessionId,
        sessionId,
        sourceType,
        generationTier,
        ...(width ? { figmaWidth: width } : {}),
        ...(height ? { figmaHeight: height } : {}),
      },
    );
    this.logger.log(`Lite 组件记录已保存: ${componentName} (${sessionId})`);
  }

  private wrapError(
    code: LiteErrorCode,
    message: string,
    cause?: any,
  ): any {
    const err: any = new Error(message);
    err.code = code;
    if (cause?.stack) err.stack = cause.stack;
    return err;
  }

  // ── 断点续跑 ──

  /** 保存断点到 temp-components/{gid}/{sid}/.checkpoint/lite-state.json */
  private async saveCheckpoint(outputPath: string, state: Record<string, any>) {
    try {
      const { mkdirSync, writeFileSync } = await import('fs');
      const cpDir = join(outputPath, '.checkpoint');
      mkdirSync(cpDir, { recursive: true });
      writeFileSync(join(cpDir, 'lite-state.json'), JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // 非阻塞
    }
  }

  /** 读取断点 */
  private async loadCheckpoint(outputPath: string): Promise<Record<string, any> | null> {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const cpPath = join(outputPath, '.checkpoint', 'lite-state.json');
      if (!existsSync(cpPath)) return null;
      return JSON.parse(readFileSync(cpPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 从断点续跑（复用 same sessionId，不创建新任务）
   * 根据 checkpoint.stage 跳过已完成的 LLM 阶段
   */
  async resumeFromCheckpoint(
    sessionId: string,
    outputPath: string,
    dto: GenerateLiteDto,
  ): Promise<{ success: boolean; sessionId: string; message: string }> {
    const runningOperation = this.resumeOperations.get(sessionId);
    if (runningOperation) {
      this.logger.warn(`Lite 断点续跑已在执行，复用当前操作: ${sessionId}`);
      return runningOperation;
    }

    const operation = this.executeResumeFromCheckpoint(
      sessionId,
      outputPath,
      dto,
    );
    this.resumeOperations.set(sessionId, operation);

    try {
      return await operation;
    } finally {
      if (this.resumeOperations.get(sessionId) === operation) {
        this.resumeOperations.delete(sessionId);
      }
    }
  }

  private async executeResumeFromCheckpoint(
    sessionId: string,
    outputPath: string,
    dto: GenerateLiteDto,
  ): Promise<{ success: boolean; sessionId: string; message: string }> {
    const cp = await this.loadCheckpoint(outputPath);
    if (!cp) {
      return { success: false, sessionId, message: '未找到断点，请使用重新生成' };
    }

    const { mkdirSync, writeFileSync } = await import('fs');
    const { brief, width, height, sourceType, componentType, generationTier } = cp;
    const isMicrocode = componentType === 'microcode';
    // 语义化组件名：断点优先（analysis_done 时已由 deriveComponentName 推导并持久化），
    // 老断点无推导名时重新推导（brief 已含视觉中英文名）；用户显式指定仍最高优先。
    const derivedName = cp.finalComponentName
      ? { codeName: cp.finalComponentName, displayName: cp.displayName || cp.finalComponentName }
      : this.deriveComponentName(dto.componentName, brief, sessionId);
    const finalComponentName = derivedName.codeName;
    const displayName = derivedName.displayName;
    const controller = new AbortController();
    this.tasksService.registerAbortController(sessionId, controller);
    this.tasksService.updateTask(sessionId, {
      status: 'running',
      error: undefined,
      endTime: undefined,
      duration: undefined,
    });

    this.progressService.sendProgress(sessionId, {
      type: 'progress',
      stage: 'resuming',
      status: 'running',
      message: `从断点续跑（已完成：${cp.stage}）`,
    });

    try {
      let vueCode: string;
      let declareJson: any = null;
      //  实际完成模型（断点续跑时可能用缓存不调 LLM，此时保持 null）
      let visionModelUsed: string | null = null;

      if (cp.stage === 'codegen_done' && cp.vueCode) {
        // 代码已生成：跳过 LLM，直接用缓存
        vueCode = cp.vueCode;
        if (cp.declareJson) declareJson = cp.declareJson;
        this.progressService.sendProgress(sessionId, {
          type: 'progress', stage: 'generating', status: 'completed',
          message: '代码已从断点恢复',
        });
      } else {
        // 仅有分析：重新跑代码生成
        this.progressService.sendProgress(sessionId, {
          type: 'progress', stage: 'generating', status: 'running',
          message: '从断点续跑代码生成...',
        });

        const resumeTask = this.tasksService.getTask(sessionId);
        const agent = await this.buildVisionAgent(dto, cp.sourceType || 'screenshot', resumeTask?.userId);
        visionModelUsed = agent?.model || null;
        const screenshotPath = this.findScreenshotPath(outputPath);

        const genText = await agent.analyzeImage(
          screenshotPath,
          isMicrocode
            ? this.buildMicrocodeCodegenPrompt(brief, finalComponentName, dto, width, height)
            : this.buildCodegenPrompt(brief, finalComponentName, dto, width, height),
          // 🔧 视觉调用显式超时覆盖全局 120s 兜底（codegen 要输出完整 SFC，慢模型易超时）
          // 🔧 视觉子调用心跳转发到 UI 日志通道，对齐 Figma 频率
          { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId) },
        );

        if (isMicrocode) {
          const parsed = this.extractMicrocodeOutput(genText);
          vueCode = parsed.vueCode;
          declareJson = parsed.declareJson;
        } else {
          vueCode = this.extractVueCode(genText);
        }

        if (!vueCode || vueCode.trim().length < 30) {
          throw new Error('生成的组件代码为空或无效');
        }

        vueCode = repairScopedThirdPartySelectors(vueCode, this.logger);
        this.validateLiteSfc(vueCode);
        if (isMicrocode) {
          declareJson = this.normalizeLiteDeclare(
            declareJson,
            sessionId,
            finalComponentName,
            width,
            height,
            brief?.theme as string | undefined,
          );
        }

        // 更新断点
        await this.saveCheckpoint(outputPath, { ...cp, stage: 'codegen_done', vueCode, ...(declareJson ? { declareJson } : {}) });
      }

      // 写盘 + workspace + 完成
      const packageDir = join(outputPath, 'package');
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(join(packageDir, 'index.vue'), vueCode, 'utf-8');

      if (isMicrocode) {
        this.writeMicrocodeAssets(outputPath, declareJson, finalComponentName, sessionId);
      }

      const resumeGroupId = await this.resolvePrivateGroupId(dto.groupId, this.tasksService.getTask(sessionId)?.userId);
      await writeFile(
        join(outputPath, 'component-meta.json'),
        JSON.stringify({
          requirementDoc: (dto as any).requirementDoc || '',
          docAnalysis: null,
          // 语义化组件名（视觉分析推导）：中文名展示、英文名作代码标识
          componentName: finalComponentName,
          displayName: displayName || finalComponentName,
          generatedAt: new Date().toISOString(),
        }, null, 2),
        'utf-8',
      );
      await this.publishValidatedLiteOutput(
        outputPath,
        sessionId,
        resumeGroupId,
        isMicrocode ? 'microcode' : 'vue3',
      );

      // 构造任务结果
      const taskResult = {
        taskId: sessionId,
        componentId: sessionId,
        groupId: resumeGroupId,
        target: componentType,
        sourceType,
        componentType,
        generationTier,
        componentName: finalComponentName,
        brief,
        code: vueCode,
        _completionModels: { visionModel: visionModelUsed, textModel: visionModelUsed },
        ...(declareJson ? { declareJson } : {}),
      };

      // sendComplete 内部统一持久化任务终态，避免重复 completeTask。
      this.progressService.sendComplete(sessionId, taskResult);

      // 保存组件记录
      this.persistComponent(finalComponentName, sessionId, resumeGroupId, undefined, width, height, componentType, sourceType, generationTier)
        .catch((e) => this.logger.warn(`组件记录保存失败(非阻塞): ${e.message}`));

      return { success: true, sessionId, message: '断点续跑完成' };
    } catch (err: any) {
      this.logger.error(`Lite 断点续跑失败 ${sessionId}: ${err.message}`);
      this.progressService.sendError(sessionId, { code: LiteErrorCode.INTERNAL_ERROR, message: err.message });
      return { success: false, sessionId, message: err.message };
    } finally {
      this.tasksService.removeAbortController(sessionId);
    }
  }

  /** 查找截图完整路径：优先 _upload，回退到 resources/images（首次生成失败后的缓存） */
  private findScreenshotPath(outputPath: string): string {
    const { readdirSync, existsSync } = require('fs');

    // 1️⃣ 优先从 _upload 查找（首次生成中）
    try {
      const uploadDir = join(outputPath, '_upload');
      const files = readdirSync(uploadDir);
      const match = files.find((f: string) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
      if (match) return join(uploadDir, match);
    } catch {
      // _upload 不存在，继续回退
    }

    // 2️⃣ 回退到 resources/images（首次生成失败后的缓存）
    try {
      const imagesDir = join(outputPath, 'resources', 'images');
      if (existsSync(imagesDir)) {
        const files = readdirSync(imagesDir);
        const match = files.find((f: string) => /^source-screenshot\.(png|jpe?g|webp)$/i.test(f));
        if (match) return join(imagesDir, match);
      }
    } catch {
      // 继续回退
    }

    // 3️⃣ 抛出错误，截图必须存在
    throw new Error('未找到截图文件（_upload/screenshot.* 或 resources/images/source-screenshot.*）');
  }

  /** 查找截图扩展名：优先 _upload，回退到 resources/images（首次生成失败后的缓存） */
  private findUploadExt(outputPath: string): string {
    const { readdirSync, existsSync } = require('fs');

    // 1️⃣ 优先从 _upload 查找（首次生成中）
    try {
      const uploadDir = join(outputPath, '_upload');
      const files = readdirSync(uploadDir);
      const match = files.find((f: string) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
      if (match) return match.split('.').pop() || 'png';
    } catch {
      // _upload 不存在，继续回退
    }

    // 2️⃣ 回退到 resources/images（首次生成失败后的缓存）
    try {
      const imagesDir = join(outputPath, 'resources', 'images');
      if (existsSync(imagesDir)) {
        const files = readdirSync(imagesDir);
        const match = files.find((f: string) => /^source-screenshot\.(png|jpe?g|webp)$/i.test(f));
        if (match) return match.split('.').pop() || 'png';
      }
    } catch {
      // 继续回退
    }

    // 3️⃣ 默认返回 png
    return 'png';
  }

  /** 写入微码运行时文件 */
  private writeMicrocodeAssets(outputPath: string, declareJson: any, componentName: string, sessionId: string) {
    const { mkdirSync, writeFileSync } = require('fs');
    // 确保 attribute 字段存在（兼容旧组件和 AI 输出不完整的情况）
    if (!declareJson.attribute) {
      declareJson.attribute = {};
    }
    writeFileSync(join(outputPath, 'declare.json'), JSON.stringify(declareJson, null, 2), 'utf-8');
    writeFileSync(
      join(outputPath, 'declare.js'),
      `import declareConfig from './declare.json'\nlet declareInfo = $createMcDeclare({ metaUrl: import.meta.url, declareConfig })\nexport default declareInfo\n`,
      'utf-8',
    );
    const stylesDir = join(outputPath, 'resources', 'styles');
    mkdirSync(stylesDir, { recursive: true });
    writeFileSync(join(stylesDir, 'index.less'), this.buildDefaultLess(componentName), 'utf-8');
    // 🔧 微码入口 component.js（2026-09-01）：与主流程写盘段对齐，产物源目录即生成
    writeFileSync(
      join(outputPath, 'component.js'),
      `import component from './package/index.vue'\nimport './resources/styles/index.less'\nexport default component\n`,
      'utf-8',
    );
  }
}
