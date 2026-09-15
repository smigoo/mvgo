/**
 * Microcode Engineer - 微码工程师
 * 职责：生成符合微码规范的Vue组件代码
 * 输入：layoutStructure + visualElements + styleMappings
 * 输出：完整的组件文件集合
 */

import { BaseAgent } from '../agents/base-agent.js';
import * as microcodeParser from './microcode/code-parser.js';
import * as microcodeHealer from './microcode/code-healer.js';
import * as microcodeWriter from './microcode/file-writer.js';
import * as microcodePrompt from './microcode/prompt-builder.js';
import * as microcodeValidator from './microcode/code-validator.js';
import * as microcodeGenerator from './microcode/code-generator.js';
import * as microcodeResources from './microcode/resource-mounter.js';
import * as resourceMountPlan from './microcode/resource-mount-plan.js';
// P1-Slice2（增量补丁式更新）：分块快照推送器 —— 先合并再推送，杜绝并行 worker 交错导致快照回退
import { pushChunkSnapshot } from './microcode/chunk-snapshot-pusher.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../logger/index.js';
import { dataDir, backendRoot } from '../../config/backend-root.js';
import { getBuildVersion } from '../utils/build-version.js';
import {
  coerceLLMText,
  getMaxTokens,
  getModelMaxOutputTokens,
} from '../utils/model-config.js';
import { buildModelSuggestion } from '../utils/model-suggestion.js';
import { buildSectionHeightsMap, buildSectionLayoutFacts } from '../utils/figma-section-heights.js';
import {
  collectLeafSections,
  formatSectionTreeForPrompt,
  findSectionById,
  dedupeDuplicateSections,
  assignSectionComponentNames,
} from '../utils/section-tree.js';
import {
  buildAllConstraintReinforcements,
  buildLayoutConstraintReinforcement,
  buildResourceConstraintReinforcement,
  buildStyleConstraintReinforcement,
} from '../utils/constraint-reinforcement.js';
import { robustJSONParse } from '../utils/json-parser.js';
import {
  stripLlmTailGarbageFromFiles,
  stripLlmTailGarbage,
} from '../utils/llm-tail-garbage.js';
// 🛡️ 2026-09-13：`invokeWithTimeout` 死 import 已移除——微码 LLM 调用点早前已下沉到
// microcode/code-generator.js（分块生成器），此处仅剩 import 无任何调用（死接线）。
import { generateDeclareJson as _templateDeclareJson } from '../templates/component-template.js';
import {
  validateVueScriptSemantics,
  dedupeScriptImports,
  dedupeScriptDeclarations,
  dedupeMcComponentBuilder,
  extractComponentTagNames,
  VUE_BUILTIN_COMPONENTS,
  normalizeObjectStringKeysInVue,
} from '../utils/sfc-semantics.js';
import {
  injectChartMinHeight as _injectChartMinHeightPure,
  deduplicateBackgroundImages as _deduplicateBackgroundImagesPure,
  fixBackgroundImageSize as _fixBackgroundImageSizePure,
  validateContainerSize as _validateContainerSizePure,
  validateResourceUsage as _validateResourceUsagePure,
  autoFixSubComponentSize as _autoFixSubComponentSizePure,
  inferChartMinHeight as _inferChartMinHeightPure,
  injectChartMinHeightIntoClass,
  createChartClassBlockIfAbsent,
  stripZeroMinHeightForClass,
} from '../utils/post-process.js';
import {
  validateVueSfc,
  extractLessGlobalVars,
} from '../utils/sfc-syntax-validation.js';
import {
  repairScopedThirdPartySelectors,
  ensureFlexDirection,
  ensureFlexDirectionInVueSfc,
} from '../utils/css-sanitizer.js';
import { buildRetryPrompt } from '../utils/retry-prompt.js';
import { buildSectionContentContract } from '../utils/section-content-guard.js';
import {
  assessStatRowConfidence,
  healStatRowMemberPairing,
} from '../utils/inline-row-assembler.js';
import { enforceInputBudget } from '../utils/input-budget.js';
import { healLessSource } from '../validators/less-compile-gate.js';
import {
  validateResourceAttribution,
  generateAttributionGuidance,
  stripCrossSectionResourceBindings,
} from '../validators/resource-attribution-validator.js';
import {
  buildResourceManifest,
  buildContracts,
  resolveSectionKey,
} from '../utils/resource-manifest.js';
import {
  getIndexVueChunkBudgets,
  getMaxIndexVueChunkBudget,
} from './microcode/chunk-budget.js';
import { resolveEchartsType, normalizeSeriesInSource, normalizeChartAxesInSource, buildChartTypeTruthSet } from '../utils/chart-type-guard.js';
import {
  audit as auditManifest,
  auditSelfConsistency,
} from '../utils/manifest-auditor.js';
import {
  stripResourcePropsFromDefineProps,
} from '../utils/props-wiring-guard.js';
import { assessNumericLiteralRewrite } from '../utils/numeric-literal-guard.js';
import {
  injectResourceImports,
  resolveResourceDomMapping,
  extractResourceVarNames,
  validateCssUrlsInWorkspace,
  buildResourceUsageCorpus,
  isResourceUsedInCorpus,
  validateSubcomponentResourceDeps,
  healUnavailableResourceRefs,
  ensureRuntimeLibraryImports,
  pruneUnmountedResourceImports,
} from '../utils/resource-import-guard.js';
import { isSessionLocked } from '../utils/session-lock-registry.js';
import { healMissingFlexContainers, healGridContainer, normalizeFlexSourceConflicts, normalizeFlexSiblingScale } from '../utils/flex-sibling-guard.js';
import { formatResourceMapping } from '../utils/resource-mapping-formatter.js';
// 🛡️ 层③（2026-09-11）：模板类名统一补前缀（CODE-020 确定性自愈）
import { fixMissingClassPrefixes } from '../utils/class-prefix-fixer.js';
// 🛡️ 治本（2026-09-11）：内容根容器高度归一（flex 填充 → height:100%，宿主 .pannel-content 为 block）
import { normalizeRootContainerLayout, detectContentRootClass } from '../utils/root-container-normalizer.js';

/**
 * 🛡️ 层①配套（2026-09-11 · c-device-monitor-1fduq67s 实锤）：把模板 PascalCase 子组件标签
 * 并入子组件生成候选清单（原地去重）。
 *
 * 背景：层①确定性模板按 effectiveSections 生成全部子组件标签（<SwitchSection /> 等），
 * 但 LLM script 段可能只 import 部分 → _detectSubComponents 仅按 import 反推 → 模板标签
 * 对应的子组件文件永不生成 → 悬空标签（渲染断裂/白块）。vue3-engineer 已有同款修法，
 * 此处对齐复用 extractComponentTagNames（已排除 Vue 内置组件与模板白名单）。
 *
 * @param {string[]} subComps _detectSubComponents 产出的路径清单（package/components/X.vue）
 * @param {string} indexVueContent index.vue 内容
 */
function _unionTemplateTagSubComponents(subComps, indexVueContent) {
  if (!Array.isArray(subComps) || !indexVueContent) return;
  // 🛡️ 2026-09-11（0ca84358 实锤）：改用共享边界法提取模板区 —— lazy `</template>` 被
  // 具名插槽提前闭合截断，插槽后主内容标签（Switch/Tabs/Main）全部漏 union →
  // 子组件文件永不生成（「子组件并行生成完成: 1 个」事故）。
  const templateBody = extractSfcTemplate(indexVueContent);
  if (!templateBody) return;
  for (const tag of extractComponentTagNames(templateBody)) {
    const p = `package/components/${tag}.vue`;
    if (!subComps.includes(p)) subComps.push(p);
  }
}

// 🆕 2026-09-04：组件语义命名（唯一 componentId = c-<语义段>-<sessionId 尾 8 hex>，
// CSS class 前缀/onload 事件与带 hash 的 componentId 解耦用 classPrefixOf）
import {
  buildComponentId,
  classPrefixOf,
  semanticSegmentOf,
  semanticTokenFrom,
  isEncodedSessionId,
  zhToSemanticEn,
  resolveComponentIdCheckpoint,
  applyDeclareCheckpoint,
  sanitizeComponentId,
} from '../utils/component-naming.js';
// 🛡️ 2026-09-03（管线 A 方案）：写盘前把子组件类样式收敛进 common.less
import { consolidateSubComponentClasses } from '../utils/style-class-consolidator.js';
import { collectClassFacts } from '../utils/class-facts.js';
import { normalizeClassNameDialect } from '../utils/class-dialect-normalizer.js';
import { extractSfcTemplate } from '../utils/sfc-template-extractor.js';
import { stripDanglingComponentRefs } from '../utils/section-coverage-guard.js';
import {
  extractSections,
  extractElements,
  formatFigmaStyleData,
  formatFigmaStructureOnly,
  filterElementStyleMapForTemplate,
  formatVisualStyle,
} from '../utils/figma-format.js';
import { resolveRequestPolicy } from '../utils/ai-request-gateway.js';
import { getProviderPool } from '../utils/provider-pool.js';
import {
  buildSharedSections,
  buildConcerns,
  buildFigmaStage,
  formatAssetsList,
  trimConstraintsForContext,
} from '../utils/prompt-loader.js';
// 🛡️ P1-3（2026-08-30）：挂载点评分单一事实源（去重 + 兜底共用，杜绝 R8 两套逻辑打架）
import {
  scoreMountTarget,
  inferComponentPrefix,
} from '../utils/mount-target-scoring.js';
// 🛡️ P1-5（2026-08-30）：chunk-meta.files 多段映射（读写两侧共用，杜绝 R10 后写覆盖前写）
import {
  isIndexVuePath,
  normalizeFileSegments,
  upsertFileSegment,
  planSegmentMerge,
} from '../utils/chunk-meta-files.js';
// 🛡️ P1-4（2026-08-30）：坏文件隔离降级的决策层（纯函数，可单测）
import { planBadFileIsolation } from '../utils/bad-file-isolation.js';
// 🛡️ P2-1（2026-08-30）：背景尺寸四件套推断（纯函数，可单测；修 R11 覆盖率不足与 repeat 误判）
import {
  inferBackgroundStyle,
  isCoveringBackground,
} from '../utils/background-size-inference.js';

/**
 * 🎨 主题包装文件固定模板（单一事实源）
 *
 * ⚠️ 关键背景（2026-08-26 治本修复）：
 * 旧架构由 index.less 只 @import dark.less / light.less，两者又用 `&.dark { @import '../common.less' }`
 * 把 common.less 的全部规则包进 `.dark` / `.light` 作用域。但宿主 base-panel 与前端预览
 * **从不给组件根注入 .dark / .light 类**，编译产物 `.dark .c-xxx` 在真实 DOM 上 0 命中
 * → 所有微码组件样式（背景/边框/圆角/图标尺寸/内部布局）100% 失效，表现为「布局在但全白/裸奔」。
 *
 * 新架构：index.less 在**根作用域**先调用默认主题 mixin 再导入 common.less（保证无主题类时样式生效），
 * dark.less / light.less 保留为「宿主未来注入主题类时的高特异性覆盖层」，由 index.less 决定是否引入。
 */
const THEME_WRAPPER_TEMPLATES = {
  dark: `// 主题覆盖层：仅当宿主给组件根注入 .dark 类时生效（特异性高于根作用域默认主题）
&.dark {
  .common();
  .theme-dark();
  @import (multiple) '../common.less';
}
`,
  light: `// 主题覆盖层：仅当宿主给组件根注入 .light 类时生效（特异性高于根作用域默认主题）
&.light {
  .common();
  .theme-light();
  @import (multiple) '../common.less';
}
`,
};

/**
 * 是否在 index.less 中额外引入 .dark/.light 覆盖层。
 * 默认 true（2026-09-03 起）：mc-check v1.0.20 M4-5 硬性要求 index.less 按
 * themeConfig.list[].key 引入对应 .less（themes/dark.less、themes/light.less），
 * 默认不引入会导致每个组件 M4-5 检查失败（实锤 mc-max-1788413641452 等 7 error）。
 * 代价：宿主未注入主题类时覆盖层为死规则、CSS 体积 ×3——规范合规优先；
 * 如需回退旧行为（不引入），设 env MC_EMIT_THEME_OVERRIDES=0。
 */
const EMIT_THEME_OVERRIDES = process.env.MC_EMIT_THEME_OVERRIDES !== '0';

/**
 * 🛡️ P0-5（2026-08-29）：宿主外壳标签黑名单 —— 兜底背景/图标挂载的**禁区**。
 *
 * 背景（mc-max-1788056145870-6e65dc88 实锤）：微码组件的模板根是宿主提供的外壳
 * <base-panel>（header 固定 38px、自带背景 #edf4fb，见
 * frontend/src/components/@mv-business-panels/default-panel/index.vue）。
 * 当「关键词匹配」与「区域容器兜底」双双落空时，旧的根容器兜底会把资源挂到这个外壳上：
 * 295×27 的 tabs 条背景（bg-7890）被 backgroundSize:'100% 100%' 拉满整个面板（含 header），
 * 产出 Figma 与 UI 设计上根本不存在的大背景。
 *
 * 根因：外壳不是组件自己的根容器，它是宿主提供的装饰框架——往它上面挂业务背景，
 * 等于在别人的相框里贴自己的照片；且一旦挂上去就是 100% 100% 拉伸，尺寸必然错。
 *
 * 策略：命中即**放弃挂载**（返回 null，调用方跳过并打 WARN），把资源留在「未使用」状态
 * 交给 RES-UNUSED 门禁明确报错 + 重试指导。宁可明确失败，也不静默产出肉眼可见的错误背景。
 */
const HOST_SHELL_TAG_RE = /^(base-panel|mc-panel)(-[a-z0-9]+)*$/i;

// 🛡️ P0（2026-09-08）：跨重试轮次的 componentId 检查点。
// 每次 normalizeDeclareJson 首次归一化后持久化，后续重试轮次优先从检查点恢复，
// 防止 LLM 不同轮次输出不同 raw componentId 导致前缀/componentId 漂移。
const _componentIdCheckpoints = new Map();

export class MicrocodeEngineer extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'microcode-engineer',
      description: '微码组件代码生成器',
      model: config.model || '',
      temperature: config.temperature || 0,
      maxTokens: config.maxTokens || getMaxTokens(config.model, 16000),
      ...config,
    });

    //模型分级路由：简单块可走轻量模型（env: LLM_LITE_MODEL 或 config.liteModel）
    this.liteModel = config.liteModel || process.env.LLM_LITE_MODEL || null;

    // ─── 约束/规范文档（一次加载，多处引用）──────────────────────────
    // 加载结果存入 this.constraints，以下文件在 buildCodePrompt / buildStylePrompt
    // 中通过 this.constraints['<path>'] 读取内容注入 prompt。
    // 新增/删除文件时需同步更新对应的引用点。
    this.constraints = this.loadReferenceFiles([
      'references/ai-generation-constraints.md',
      'references/patterns/code-patterns.md',
      'references/specs/declare-json.md',
      'references/specs/style-guide.md',
      'references/rules/stage-common.md',
      'references/rules/stage-figma-rules.md',
      'references/prompts/figma.md',
      // 样式标准（Phase 1）
      'references/standards/vue-style-standard.md',
      'references/standards/less-naming-convention.md',
    ]);

    //  组件类型标识（微码 / vue3）—— 用于区分面板外壳过滤策略
    this.componentType = 'microcode';

    // logger 实例属性：子类 vue3-engineer 可在构造器覆盖标签
    this.logger = createLogger({ name: 'microcode-engineer' });

    // 输出格式警告常量（避免重复拼接）
    this.OUTPUT_FORMAT_WARNING_BRIEF =
      '- **⚠️ 分隔符格式要求同前述 coreAndChecklist 段**（`// === 文件路径 ===` 仅标记文件开始，禁止在代码注释/分节中使用）';

    this.logger.info('Microcode Engineer 已初始化', {
      componentType: this.componentType,
    });

    // 绑定方法以保持this上下文（修复 _parseDelimitedFormat is not a function 错误）
    this.parseCodeOutput = this.parseCodeOutput.bind(this);
    this.parseOutput = this.parseOutput.bind(this);
  }

  /**
   *  评估组件复杂度
   * 用于动态调整prompt详细程度
   */

  assessComplexity(layoutStructure) {
    return microcodePrompt.assessComplexity(layoutStructure);
  }

  /**
   *#9a: 预估 index.vue 输出规模（启发式 token 估计）
   * 用于在生成前直接选择分块粒度，避免首个长调用中途截断、已生成 token 全废。
   * 返回 { tokens, tier, elementCount, maxDepth, sectionCount, charts, interactions }
   *   tier ∈ 's' | 'm' | 'l' | 'xl'
   */
  estimateIndexVueSize(input = {}) {
    return microcodePrompt.estimateIndexVueSize(input);
  }

  /**
   *#9a: 判断 package/index.vue 是否应分段生成，并在生成前直接选定粒度。
   * 返回 { split, reason, scriptSplit, sizeTier, estTokens }
   *   - split: 是否拆分 index.vue（template + script 分两批）
   *   - scriptSplit: 超大组件再把 <script> 拆为「状态 / 行为」两段（避免单段超长截断）
   *   - sizeTier: 预估规模等级 's'|'m'|'l'|'xl'
   */
  shouldSplitIndexVue(complexity, input = {}) {
    return microcodePrompt.shouldSplitIndexVue(complexity, input);
  }

  /**
   * 构建代码生成提示词
   */
  buildCodePrompt(input, chunkSpec) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildCodePrompt(input, chunkSpec, options);
  }

  /**
   *  type-aware shared 段裁剪
   * 双层裁剪：① 文件级（按 <!-- shared-file: ... --> 标记整块移除无关规范文件）
   *          ② section 级（按节标题正则移除，原逻辑保留）
   */
  _trimSharedForFileType(shared, filter) {
    return microcodePrompt.trimSharedForFileType(shared, filter, {
      logger: this.logger,
    });
  }

  /**
   * 🧩 方案 2：自检清单按文件类型裁剪
   * 主组件（index.vue）：完整自检清单
   * 子组件（component.vue）：移除主组件专属规则（$mcComponentBuilder / panelKey / declare.json）
   * 样式文件（template/script）：仅保留样式相关自检
   */
  _buildChecklistByType(fileType, input) {
    return microcodePrompt.buildChecklistByType(fileType, input, {
      componentType: this.componentType,
    });
  }

  /**
   *S8: 需求文档设计注入块（doc-analysis.json → prompt，机械转换，零业务词）
   * 注入四维：events / dataBinding / config(businessConfig+cssVariableConfig) / interactions
   * 不注入 uiElements（元素覆盖率校验在 L0-B 进行，保持 prompt 精简）
   */
  _buildDocDesignBlock(docAnalysis) {
    return microcodePrompt.buildDocDesignBlock(docAnalysis);
  }

  /**
   * 生成组件代码
   */
  async generateCode(input) {
    this.logger.info('开始生成组件代码（自适应分块生成模式）', {
      stage: input.stage,
    });

    // 可读性优化：class 前缀使用短语义前缀（如 f0abee / env-overview），
    // 取代 c-mc-max-<时间戳>-<随机串>- 这类超长且不可读的前缀。
    // 仅影响 class 前缀与 prompt 占位符；componentId（mc-max-... 实例 ID）寻址不受影响。
    if (input && !input._classPrefixApplied) {
      input = {
        ...input,
        componentName: this._deriveClassPrefix(input),
        _classPrefixApplied: true,
      };
    }

    // 🆕 方案 A（2026-08-31）：防止「进程中断/被杀 → chunk 级快照缺 resources/styles/* → 预览报无意义错误」
    // 在 generateCode 最早期预置「最小可编译样式集」骨架（同步纯函数，不依赖 LLM 结果）。
    // - 仅当 resources/styles/index.less 尚不存在时写：续跑/断点续跑磁盘已有真实样式时不覆盖（骨架盖真实会破坏产物）。
    // - LLM 后续生成的同名样式文件会自然覆盖（writeFiles 幂等覆盖，唯一跳过是 isUserPatched）。
    // - 进程在样式分块（theme-vars/common 由 LLM 分块生成）前被杀 → 磁盘已自洽可编译
    //   → phase2.service.ts:mergeFromDisk(outputPath/resources/styles) 并入候选快照 → 中断任务也能预览。
    if (input.outputPath && !input.isRevision) {
      try {
        const idxLessPath = join(input.outputPath, 'resources/styles/index.less');
        if (!existsSync(idxLessPath)) {
          const brightness = input.backgroundBrightness || 'dark';
          await this.writeFiles(this._buildBootstrapStyleFiles(brightness, input), input.outputPath);
          this.logger.info('🩹 预置最小可编译样式骨架（方案A·中断容错）', { brightness });
        }
      } catch (bootstrapErr) {
        this.logger.warn('⚠️ 预置样式骨架失败（非阻断）', {
          error: bootstrapErr?.message,
        });
      }
    }

    // 🎯 方案2: 模型能力匹配提示 - 检查组件复杂度是否超出当前模型能力
    const estimateResult = this.estimateIndexVueSize(input);
    // 🛡️ 修复：BaseAgent 不设 this.config（只有 this.model），原 this.config.model 会抛
    // "Cannot read properties of undefined (reading 'model')"。统一改用 this.model（BaseAgent line 28 已建）。
    const currentModel = this.model || '';
    const suggestion = buildModelSuggestion(
      estimateResult.tokens,
      currentModel,
    );

    // 🎯 治本（2026-09-10）：容量校验必须基于「真实 index.vue 分块预算」，而非整组件一次性估算。
    // 进度编号 5/7 不是等权 token 分母；必须与 code-generator.generateIndexVue 共用同一预算函数，
    // 覆盖 medium 的 template+script 路径，以及 xl 的 state/lifecycle/charts 路径。
    const runCapacityCheck = (splitDecision) => {
      const chunkBudgets = getIndexVueChunkBudgets(splitDecision);
      const maxChunk = getMaxIndexVueChunkBudget(splitDecision);
      const chunkCount = chunkBudgets.length;
      const perCallTokens = maxChunk.estTokens;
      const requestedMaxTokens = maxChunk.requestedMaxTokens;
      const overPerCall = requestedMaxTokens > suggestion.currentLimit;
      if (!suggestion.needUpgrade) return; // 未超限，直接放行
      const canHardFail = suggestion.identified && suggestion.limitKnown;
      if (canHardFail && overPerCall) {
        // 分块后单段仍超出模型上限 → 真超限，硬报错
        this.logger.warn('⚠️ 组件复杂度超出当前模型能力', {
          estimatedTokens: estimateResult.tokens,
          perCallTokens,
          requestedMaxTokens,
          chunkCount: chunkBudgets.length,
          maxChunk: maxChunk.segmentType,
          currentModel,
          currentLimit: suggestion.currentLimit,
          recommendedTier: suggestion.recommendedTier,
        });
        if (input.onProgress) {
          input.onProgress({
            stage: '模型能力检查',
            message: '组件复杂度较高，建议升级模型或简化设计',
            status: 'warning',
            details: {
              suggestion: suggestion.message,
              estimatedTokens: estimateResult.tokens,
              perCallTokens,
              requestedMaxTokens,
              maxChunk: maxChunk.segmentType,
              chunkCount: chunkBudgets.length,
              currentLimit: suggestion.currentLimit,
              overBy: requestedMaxTokens - suggestion.currentLimit,
            },
          });
        }
        const error = new Error('组件复杂度超出当前模型能力');
        error.code = 'MODEL_CAPACITY_EXCEEDED';
        error.suggestion = suggestion;
        throw error;
      }
      if (!canHardFail) {
        // 能力未识别 / 真实上限未知：不硬报错，提示去「模型能力测试」识别
        this.logger.warn('⚠️ 模型能力未识别，跳过容量硬报错，提示用户去测试', {
          estimatedTokens: estimateResult.tokens,
          perCallTokens,
          chunkCount: chunkBudgets.length,
          maxChunk: maxChunk.segmentType,
          currentModel,
          assumedLimit: suggestion.currentLimit,
          capabilitySource: suggestion.capabilitySource,
        });
        if (input.onProgress) {
          input.onProgress({
            stage: '模型能力检查',
            message:
              '当前模型能力未识别（不在内置能力表，且未运行过「模型能力测试」），无法确认是否超出输出上限。已按保守默认上限放行生成；建议先在「模型设置」运行「模型能力测试」识别真实上限，复杂组件再据此判断是否需升级模型。',
            status: 'warning',
            details: {
              estimatedTokens: estimateResult.tokens,
              perCallTokens,
              chunkCount: chunkBudgets.length,
              maxChunk: maxChunk.segmentType,
              assumedLimit: suggestion.currentLimit,
              capabilitySource: suggestion.capabilitySource,
              identified: suggestion.identified,
              limitKnown: suggestion.limitKnown,
              action: 'test-model-capability',
            },
          });
        }
      } else {
        // 已分块且单段在容量内：放行生成
        // 实证：mc-max-1789036112943 整组件 44860 tokens，按真实预算最大块 template≈0.1*44860≈4486 < 32768 → 放行
        this.logger.info('🧩 组件已分块，单段 token 在模型容量内，放行生成', {
          perCallTokens,
          requestedMaxTokens,
          maxChunk: maxChunk.segmentType,
          chunkCount: chunkBudgets.length,
          currentLimit: suggestion.currentLimit,
        });
      }
    };

    const {
      _l0CodeRetryGuidance,
      techStackHints,
      _selfOptimization,
      layoutStructure,
      docAnalysis,
      outputPath,
      targetFiles,
      reviseTarget,
      subComponentPlan,
    } = input;

    // 强制子组件清单（来自结构规划阶段 subcomponent-planner）
    // 新结构：{ effectiveSections: [{id, responsibility, elementCount, title}], isForced, minFiles, reason }
    // - isForced=true 时 prompt 强约束 LLM 按 section.id 各建一个独立文件
    // - isForced=false 时仅作为建议（让 LLM 自行裁量）
    // - 命名权交给 LLM（planner 不再产出 name）
    // 🛡️ 接管（P1）：优先消费 Context Assembler 裁决的 componentPlan（单一事实源），fallback 到 legacy。
    const _genPlan = input.generationInput?.componentPlan;
    const subPlan =
      _genPlan && typeof _genPlan === 'object'
        ? _genPlan
        : subComponentPlan && typeof subComponentPlan === 'object'
          ? subComponentPlan
          : {
              effectiveSections: [],
              isForced: false,
              minFiles: 0,
              reason: '未传入 subComponentPlan',
            };
    // 🛡️ 治本（2026-09-14 · c-device-monitor-485d724d 实锤）：planner 双重解释去重**单点收口**。
    // 裂缝：buildDeterministicIndexTemplate / resolvePlanSections 已过 dedupeDuplicateSections，
    // 但此处直接取 subPlan.effectiveSections → 同一事实两处消费、只有一处去重 →
    // 模板骨架只挂 1 个子组件，而 prompt/子组件生成仍按 3 个（Switch/Tabs/Main）各生成一份 →
    // 重复内容 + 视口挤出。统一在「取用点」去重，与 prompt-builder 同源。
    const effectiveSections = dedupeDuplicateSections(subPlan.effectiveSections || []) || [];

    // 🎯 A' Phase 5: 叶子遍历（布局容器不占 .vue 槽，只做纵向包裹）
    const leafSections = collectLeafSections(effectiveSections);

    // 🎯 阶段 B 结构层接管（2026-09-15）：构建「子组件名 → 确定性统计行配对」映射。
    // 真机证伪（mc-1789429951534-63bf998c）：命令式 prompt 对成员左右序/标题数值互换无效，
    // LLM 写子组件模板仍按自身判断猜配对。故在子组件写盘前用 facts 确定性对齐 stat 卡片文本。
    // 仅对 assessStatRowConfidence 判 high 的统计行 section 生效；命名与 index.vue 确定性模板
    // （buildDeterministicIndexTemplate）共用 assignSectionComponentNames，保证同名映射。
    const statRowHealMap = new Map();
    if (input.figmaNodeData) {
      const _nameOf = assignSectionComponentNames(effectiveSections);
      for (const sec of leafSections) {
        const r = assessStatRowConfidence(sec, input.figmaNodeData);
        if (r.verdict === 'high') {
          const compName = _nameOf.get(String(sec.id));
          if (compName) statRowHealMap.set(compName, r.members);
        }
      }
    }

    // 🎯 Phase 2 方案1: 内部子组件（来自增强子组件拆分）
    const internalSubcomponents = subPlan.internalSubcomponents || [];

    //  按问题类别只修目标文件
    // 仅在“修订模式 + 给定目标文件 + 非全量修订”时启用：只让 LLM 重新生成 targetFiles，
    // 其余文件从磁盘读取现有内容并保留，避免再次全量重做浪费模型调用与时间。
    const targetFileSet = new Set(
      Array.isArray(targetFiles) && targetFiles.length ? targetFiles : [],
    );
    const isPartialRevision =
      !!input.isRevision &&
      targetFileSet.size > 0 &&
      reviseTarget &&
      reviseTarget !== 'full';
    const diskContent = (rel) => {
      if (!outputPath) return null;
      try {
        return readFileSync(join(outputPath, rel), 'utf-8');
      } catch {
        return null;
      }
    };
    if (isPartialRevision) {
      this.logger.info('🎯 P1: 部分修订模式，仅重做目标文件，其余从磁盘保留', {
        targetFiles: [...targetFileSet],
        reviseTarget,
      });
    }
    const complexity = this.assessComplexity(layoutStructure);
    const splitDecision = this.shouldSplitIndexVue(complexity, input);
    this.logger.info('🧩 组件复杂度评估', {
      complexity,
      stage: input.stage,
      splitIndexVue: splitDecision.split,
      splitReason: splitDecision.reason,
      scriptSplit: splitDecision.scriptSplit,
      sizeTier: splitDecision.sizeTier,
      estTokens: splitDecision.estTokens,
      // 🎯 Phase 2 方案1: 添加内部子组件信息（叶子计数，容器不占槽）
      effectiveSections: leafSections.length,
      internalSubcomponents: internalSubcomponents.length,
      totalSubcomponents:
        leafSections.length + internalSubcomponents.length,
    });

    // 🎯 治本：分块决策算完后，按「分块后单次调用 token」重做容量校验（替代前置整组件硬报错）
    runCapacityCheck(splitDecision);

    //S8: 需求文档设计注入块（机械转换一次构建，所有分块共享）
    const docDesignBlock = this._buildDocDesignBlock(docAnalysis);
    if (docDesignBlock) {
      this.logger.info('📄 需求文档设计注入块已构建', {
        events: docAnalysis?.events?.length || 0,
        apis: docAnalysis?.dataBinding?.apis?.length || 0,
        businessConfig: docAnalysis?.businessConfig?.length || 0,
        blockChars: docDesignBlock.length,
      });
    }

    const allFiles = {};
    const chunkDebug = [];
    // 🛡️ 分块阶段产生的自动修复记录（尾部垃圾剥离 / P1-4 坏文件隔离降级等）。
    // ⚠️ 此前本方法内 `fixes.push(...)`（TAIL-GARBAGE 分支）引用的是**未声明的变量** ——
    //    generateCode 里从来没有 `const fixes`，一旦触发就是 ReferenceError，
    //    反而把「本可确定性自愈」的分支变成整轮失败。这里显式声明并随结果返回，
    //    由 execute() 合并进 autoFixes 供前端展示。
    const chunkFixes = [];

    //断点续跑：若存在代码生成分块 checkpoint（.mc-gen/cache/code-chunks/），
    // 先恢复已完成块的文件内容，跳过这些块的 LLM 调用（从断点继续）
    if (outputPath) {
      try {
        const { readFileSync: _rfs, existsSync: _es } = await import('fs');
        const { join: _join } = await import('path');
        const chunkDir = _join(outputPath, '.mc-gen', 'cache', 'code-chunks');
        const metaPath = _join(chunkDir, 'chunk-meta.json');
        if (_es(metaPath)) {
          const meta = JSON.parse(_rfs(metaPath, 'utf-8'));
          if (meta && meta.files && typeof meta.files === 'object') {
            let restoredCount = 0;
            for (const [relPath, entryRaw] of Object.entries(meta.files)) {
              // 🛡️ P1-5：兼容旧单值格式（string）与新段数组格式，统一归一化后按 index 升序读取
              const segs = normalizeFileSegments(entryRaw).filter(
                (s) => s.file,
              );
              const loaded = [];
              for (const s of segs) {
                const fileTarget = _join(chunkDir, s.file);
                if (!_es(fileTarget)) continue;
                // 🛡️ 恢复 ≠ 可信（#1 附带修复）：落盘的 chunk 可能携带 LLM 尾部围栏+说明
                // 垃圾（mc-max-1787920512973 实锤：重试轮恢复污染 chunk → 同错再炸 →
                // 预算耗尽）。恢复时同样做确定性尾部剥离。
                const { content } = stripLlmTailGarbage(
                  relPath,
                  _rfs(fileTarget, 'utf-8'),
                );
                loaded.push({ ...s, content });
              }
              if (loaded.length === 0) continue;

              if (loaded.length === 1) {
                const only = loaded[0].content;
                // 🛡️ P1-5：历史 chunk-meta 由「后写覆盖前写」产生，单值可能只剩脚本段。
                // 缺 <template> 的 index.vue 不是合法 SFC；恢复它会让后续 chunk 误判
                // 「已生成」而跳过 → template 永久丢失。宁可不恢复，交给重新生成。
                if (isIndexVuePath(relPath) && !/<template[\s>]/i.test(only)) {
                  this.logger.warn(
                    '⚠️ P1-5 断点续跑：index.vue 缓存段缺少 <template>，放弃恢复（交由重新生成）',
                    { relPath, file: loaded[0].file },
                  );
                  continue;
                }
                allFiles[relPath] = only;
                restoredCount++;
                continue;
              }

              // 多段：按角色拼接
              const plan = planSegmentMerge(relPath, loaded);
              if (plan.kind === 'index-vue') {
                if (!plan.ok || !plan.template) {
                  this.logger.warn(
                    '⚠️ P1-5 断点续跑：index.vue 分块缺少 template 段，放弃恢复（交由重新生成）',
                    { relPath, segments: loaded.map((s) => s.file) },
                  );
                  continue;
                }
                const scriptContent = this._mergeScriptParts(
                  ...plan.scriptParts.map((s) => s.content),
                );
                const assembled = this._assembleIndexVue(
                  plan.template.content,
                  scriptContent,
                  input,
                );
                if (assembled) {
                  allFiles[relPath] = assembled;
                  restoredCount++;
                }
              } else {
                allFiles[relPath] = plan.order.map((s) => s.content).join('\n');
                restoredCount++;
              }
            }
            if (restoredCount > 0) {
              this.logger.info(
                `🔄 断点续跑: 已恢复 ${restoredCount} 个已生成文件，跳过已完成分块`,
                {
                  completedBlocks: (meta.completed || []).length,
                },
              );
            }
          }
        }
      } catch (err) {
        this.logger.warn(`断点续跑恢复分块失败: ${err.message}`);
      }
    }

    //  程序化提取的模板 class 名列表，用于 CSS batch 硬约束 + 校验自动修复
    let classNamesList = [];

    //并行子组件生成：chunk-meta.json 是共享文件，用链式锁串行化其读改写，避免并发竞态
    let metaWriteChain = Promise.resolve();

    //瘦身：全局技术栈规则按 chunk 类型裁剪——declare/style 块不需要表单/表格细节，避免每块都背整段
    const appendGlobalGuidance = (p, fileType) => {
      // 🛡️ 上下文裁决约束（trustVerdict/currentIssues，权威优先，置于最前）
      const _trustGuidance = this._buildTrustGuidance(input.generationInput);
      if (_trustGuidance) p += _trustGuidance;
      if (docDesignBlock) p += docDesignBlock; //S8: 文档设计注入（位于重试/技术栈之前，权威依据优先展示）
      if (_l0CodeRetryGuidance) p += _l0CodeRetryGuidance;
      // 🛡️ 资源归属指导（方案5）：上一轮漏用背景时，本轮注入权威归属，避免背景漏用/挂错 section。
      if (input._attributionGuidance) p += input._attributionGuidance;

      // 子组件强制清单（来自 subcomponent-planner 节点）
      // - isForced=true：按 section.id 强制拆 N 个文件，文件名/组件名由你定
      // - isForced=false：仅建议
      // 🔧 2026-08-27 #275 修复：原条件 `fileType === 'code'` 恒 false（_getChunkFileType 从不返回 'code'，
      //   只返回 vue/declare/style/mixed）→ 强制拆分清单从未注入任何分块 prompt → planner 说"强制拆分"
      //   但模型完全不知道 → 全部 section 堆进 index.vue（90k tokens + 无子组件产物）。
      //   改为 code/vue 均注入（template/script 段是生成 index.vue 的主体，必须看到拆分要求）。
      // 🎯 Phase 2 方案1: 集成内部子组件拆分
      if (
        leafSections.length > 0 &&
        (fileType === 'code' || fileType === 'vue')
      ) {
        if (subPlan.isForced) {
          p += `\n\n## 🚨 强制子组件拆分（必须遵守）\n\n`;
          p += `**强制原因**：${subPlan.reason}\n\n`;

          // 计算总文件数：叶子 section + 内部子组件（布局容器不占 .vue 槽）
          const totalSubcomponents =
            leafSections.length + internalSubcomponents.length;

          p += `本组件**必须**拆分为 **${totalSubcomponents}** 个独立子组件文件：\n`;
          p += `- **${leafSections.length}** 个叶子 section 级子组件（每个叶子各一个文件；布局容器不单独生成 .vue；list/grid 折叠 section 只算 1 个文件）\n`;
          if (internalSubcomponents.length > 0) {
            p += `- **${internalSubcomponents.length}** 个内部子组件（section 内部拆分）\n`;
          }
          p += `\n文件名和组件名由你根据语义自行命名（PascalCase），但**数量和对应关系不得缩减**。\n`;
          p += `🚨 **重复卡片必须 v-for**：type=list|grid 或 collapsed=true 的 section，只生成 **1 个 item 模板** + \`v-for\`，**禁止**拆成 DeviceCard1..N / Deco1..N。COMP-001 按模板计数。\n\n`;

          p += `**叶子 Section 级子组件清单**：\n`;
          leafSections.forEach((sec, idx) => {
            p += `${idx + 1}. \`${sec.id}\` — ${sec.responsibility}`;
            if (sec.title) p += `（原标题「${sec.title}」）`;
            if (sec.elementCount) p += `，含 ${sec.elementCount} 个元素`;

            // 🎯 Phase 2 方案1: 显示复杂度信息
            if (sec.complexityScore !== undefined) {
              p += `，复杂度评分 ${sec.complexityScore}`;
            }

            p += `\n`;

            const listLike =
              sec.collapsed === true ||
              sec.renderHint === 'v-for' ||
              ((sec.type === 'list' || sec.type === 'grid') &&
                (Number(sec.itemCount) > 1 ||
                  (Array.isArray(sec.items) && sec.items.length > 1)));
            if (listLike) {
              const n =
                Number(sec.itemCount) ||
                (Array.isArray(sec.items) ? sec.items.length : 0);
              p += `   🚨 本 section 是 ${sec.type || 'list'}，含 ${n} 个同构 item。只生成 **1 个** 子组件文件（item 模板），用 \`v-for\` 渲染 ${n} 项。**禁止**拆成 DeviceCard1..${n} 或多个独立 .vue。\n`;
            }

            // 🎯 Phase 2 方案1: 显示该 section 的内部子组件
            if (
              sec.internalSubcomponents &&
              sec.internalSubcomponents.length > 0
            ) {
              p += `   → 该 section 需进一步拆分为 ${sec.internalSubcomponents.length} 个内部子组件：\n`;
              sec.internalSubcomponents.forEach((sub, subIdx) => {
                p += `      ${subIdx + 1}. ${sub.responsibility} (${sub.reason})\n`;
                if (sub.props && sub.props.length > 0) {
                  p += `         Props: ${sub.props.join(', ')}\n`;
                }
                if (sub.emits && sub.emits.length > 0) {
                  p += `         Emits: ${sub.emits.join(', ')}\n`;
                }
              });
            }
          });

          // 🎯 Phase 2 方案1: 如果有内部子组件，提供详细说明
          if (internalSubcomponents.length > 0) {
            p += `\n**内部子组件详细说明**：\n`;

            // 按 parentSectionId 分组
            const groupedBySection = {};
            for (const sub of internalSubcomponents) {
              const sectionId = sub.parentSectionId;
              if (!groupedBySection[sectionId]) {
                groupedBySection[sectionId] = [];
              }
              groupedBySection[sectionId].push(sub);
            }

            for (const [sectionId, subcomps] of Object.entries(
              groupedBySection,
            )) {
              const parentSection = findSectionById(
                effectiveSections,
                sectionId,
              );
              const sectionTitle = parentSection?.title || sectionId;

              p += `\n📦 **${sectionTitle}** (${sectionId}) 的内部子组件：\n`;

              subcomps.forEach((sub, idx) => {
                p += `\n${idx + 1}. **${sub.type}** — ${sub.responsibility}\n`;
                p += `   拆分原因：${sub.reason}\n`;

                if (sub.props && sub.props.length > 0) {
                  p += `   Props 定义：\n`;
                  sub.props.forEach((prop) => {
                    if (prop === 'chartData') {
                      p += `   - \`${prop}\`: Array - 图表数据\n`;
                    } else if (prop === 'chartConfig') {
                      p += `   - \`${prop}\`: Object - 完整的 echarts 配置\n`;
                    } else {
                      p += `   - \`${prop}\`: 根据业务需求定义\n`;
                    }
                  });
                }

                if (sub.emits && sub.emits.length > 0) {
                  p += `   Emits 定义：\n`;
                  sub.emits.forEach((evt) => {
                    if (evt === 'legendClick') {
                      p += `   - \`${evt}\`: 图例点击事件\n`;
                    } else if (evt === 'dataZoom') {
                      p += `   - \`${evt}\`: 数据缩放事件\n`;
                    } else if (evt === 'action') {
                      p += `   - \`${evt}\`: 交互操作事件\n`;
                    } else {
                      p += `   - \`${evt}\`: 根据业务需求定义\n`;
                    }
                  });
                }

                // 图表组件特殊说明
                if (sub.type === 'chart-component') {
                  p += `   要求：\n`;
                  p += `   - 使用 echarts 渲染图表\n`;
                  p += `   - 根元素设置 width: 100%; height: 100%;\n`;
                  p += `   - 监听 chartData 和 chartConfig 变化，自动更新图表\n`;
                  p += `   - 图表交互事件通过 emit 传递给父组件\n`;
                }
              });
            }
          }

          p += `\n**关键约束**：\n`;
          p += `- 每个**叶子** section 必须对应一个独立的 \`package/components/{YourName}.vue\` 文件\n`;
          p += `- 标「容器」的节点只做纵向 flex 包裹，禁止为其单独建文件、禁止把 children 打平到根模板\n`;
          p += `- 每个内部子组件也必须是独立的 \`package/components/{YourName}.vue\` 文件\n`;
          p += `- \`package/index.vue\` 必须 import 所有叶子子组件，并按嵌套树组装（容器的子组件出现在该容器对应的 DOM 内）\n`;
          p += `- section 级子组件 import 其内部子组件并在 template 中引用\n`;
          p += `- 严禁将多个叶子 section 合并到同一个文件\n`;
          p += `- 严禁省略任何叶子 section 的子组件或内部子组件\n`;

          // 🎯 Phase 2 方案1: 布局元数据提示（只对叶子；容器不计高度槽）
          const sectionsWithLayout = leafSections.filter(
            (s) => s.layoutMetadata,
          );
          if (sectionsWithLayout.length > 0) {
            p += `\n**布局协调提示**：\n`;
            sectionsWithLayout.forEach((sec) => {
              if (sec.layoutMetadata) {
                const meta = sec.layoutMetadata;
                p += `- \`${sec.id}\` 使用 flex-direction: ${meta.direction}`;
                if (meta.gap > 0) p += `，gap: ${meta.gap}px`;
                if (meta.height > 0) {
                  // 🚨 2026-09-07（0907 审计 L1）：统一 flex 事实源——内容区块 grow 用
                  // 归一化系数（meta.flexGrow，平均值=1，比例=设计稿高度比），
                  // 禁止把像素高度写进 grow（如 flex: 220 1 0 是量纲混淆）。
                  if (meta.flexGrow > 0) {
                    p += `，区块高度约 ${meta.height}px（务必用 \`flex: ${meta.flexGrow} 1 0; min-height: 0\`，其中 ${meta.flexGrow} 是按 Figma 高度归一化的 flex-grow 弹性系数，**禁止**把像素高度写进 grow 如 \`flex: ${meta.height} 1 0\`）`;
                  } else {
                    p += `，区块高度约 ${meta.height}px（务必用 \`flex: 1 0 ${meta.height}px; min-height: 0\`，其中 1 是 flex-grow 弹性系数、${meta.height}px 是 flex-basis 基准高度，**禁止**把像素高度写成 flex-grow 如 \`flex: ${meta.height} 1 0\`）`;
                  }
                }
                p += `\n`;
              }
            });
          }
        } else {
          p += `\n\n💡 **建议拆分子组件**（非强制）：以下叶子 section 建议你按功能拆为独立 \`package/components/*.vue\`，可酌情合并：\n`;
          const suggestTree = formatSectionTreeForPrompt(effectiveSections);
          if (suggestTree) p += `${suggestTree}\n`;
          leafSections.forEach((sec) => {
            p += `- \`${sec.id}\` — ${sec.responsibility}${sec.title ? `（原标题「${sec.title}」）` : ''}`;
            if (sec.complexityScore !== undefined) {
              p += `，复杂度 ${sec.complexityScore}`;
            }
            if (sec.collapsed || sec.renderHint === 'v-for') {
              p += `（1 个模板 + v-for，禁止拆成 N 个文件）`;
            }
            p += `\n`;
          });
        }

        // 🎯 2026-09-14 治本·阶段1：per-section 内容归属契约（无条件生效）。
        // 事实源 = Figma 子树文本 + bbox.x（utils/section-content-guard#buildSectionContentContract）。
        // 从源头防两类 LLM 段错误：左右镜像（横向 section 成员按 x 序）+ 借邻居内容（跨 section 复制文本）。
        const contentContract = buildSectionContentContract(
          subPlan,
          input.figmaNodeData,
        );
        if (contentContract.length > 0) {
          p += `\n**内容归属契约（每个 section 只渲染自己子树内的文本，禁止借用其它 section 的文本）**：\n`;
          for (const c of contentContract) {
            if (c.members) {
              // 横向 section：成员级配对，按 x 从左到右（标题↔数值成对，杜绝配对错乱）
              const memberLines = c.members.map(
                (m, i) =>
                  `   ${i + 1}. 标题「${m.title ?? ''}」 数值「${m.value ?? ''}」${m.x != null ? ` (x≈${m.x})` : ''}`,
              );
              if (c.deterministic) {
                // 🎯 阶段 B：高置信确定性配对（系统已配好，禁止重排/互换）
                p += `- \`${c.id}\`（横向 row，**成员配对已由系统确定性确定，禁止互换标题/数值、禁止左右调换、严格按此顺序渲染**）：\n${memberLines.join('\n')}\n`;
              } else {
                p += `- \`${c.id}\`（横向 row，成员从左到右）：\n${memberLines.join('\n')}\n`;
              }
            } else {
              const ordered = [...c.texts].sort(
                (a, b) => (a.x ?? 0) - (b.x ?? 0),
              );
              const items = ordered
                .map((t) => `${t.text}${t.x != null ? `(x≈${t.x})` : ''}`)
                .join('、');
              p += `- \`${c.id}\`（${c.title || c.direction}）：${items}\n`;
            }
          }
          p += `\n**铁律**：文本必须出现在归属它的 section 对应组件内；横向（row）section 按成员序号从左到右排列，且每个成员的「标题」「数值」必须成对放对（标题=位置小字、数值=大字，禁止互换）；禁止把某个 section 的文本写到另一个 section 的组件里。\n`;
        }

        // 🆕 V2（2026-09-01）：section 尺寸比例强制规则（无条件生效，无论是否强制拆分）
        // 事故 2 根因：tabs 等附属 section 挤压主图表，LLM 对附属区写死 height:100% 或对内容区不写 min-height:0。
        // 策略：附属区（tabs/toolbar/nav/footer）用 Figma 实测固定高，主内容区 flex:1 min-height:0。
        const sectionsWithHeight = leafSections.filter(
          (s) => s.layoutMetadata?.height > 0,
        );
        if (sectionsWithHeight.length > 0) {
          p += `\n##🚨 Section 尺寸比例强制规则（必须遵守）\n\n`;
          p += `**实测高度来源**：Figma 设计稿 absoluteBoundingBox.height，以下数值为像素真值。\n\n`;
          p += `| Section | 类型 | Figma 高度 | 必须使用的 CSS |\n|---------|------|------------|----------------|\n`;
          for (const sec of sectionsWithHeight) {
            const h = Math.round(sec.layoutMetadata.height);
            const grow = sec.layoutMetadata.flexGrow > 0 ? sec.layoutMetadata.flexGrow : 0;
            const isAccessory = /^(tabs|toolbar|nav|footer|header|stats)$/i.test(sec.responsibility) ||
              /tab|工具|导航|底部|标题|统计/i.test(sec.responsibility);
            // 🚨 2026-09-07（0907 审计 L1）：主内容区优先用归一化 grow 系数（等比分配），
            // 无系数时回退 basis=像素写法；附属区固定像素不参与分配。
            const cssRule = isAccessory
              ? `flex: 0 0 ${h}px; height: ${h}px`
              : grow > 0
                ? `flex: ${grow} 1 0; min-height: 0`
                : `flex: 1 0 ${h}px; min-height: 0`;
            const typeLabel = isAccessory ? '附属区' : '主内容';
            p += `| \`${sec.id}\` | ${typeLabel} | ${h}px | \`${cssRule}\` |\n`;
          }
          p += `\n**铁律**：\n`;
          p += `- 附属区（tabs/工具栏/导航/标题/统计条）必须用 \`flex: 0 0 <Figma高度>px\` 或 \`height: <Figma高度>px\`，**不得**用 flex:1 或 height:100%\n`;
          p += `- 主内容区必须用表格中给定的 flex 写法（grow 为归一化系数时禁止改成像素值，如 \`flex: ${'131'} 1 0\` 是量纲混淆），**禁止**省略 min-height:0（否则 flex 子元素溢出时容器不收缩）\n`;
          p += `- **禁止**附属区的 flex-grow 值 > 主内容区的 flex-grow 值（即附属区不得"抢"主内容区的剩余空间）\n`;
          p += `- 根容器必须用 \`display: flex; flex-direction: column\`，子 section 按上述比例分配\n`;
        }
      }

      // 默认技术栈规则（无论是否有 @xxx 标记都生效）
      p += '\n\n##默认技术栈规则（强制）\n\n';
      if (fileType === 'declare') {
        // 声明文件只需知道技术栈基调，不需要表单/表格/图表细节
        p +=
          '本项目已全局注册 ant-design-vue（`<a-xxx>`）与 ECharts。Figma 节点名标注 `@antd/xxx` / `@echarts/xxx` 时按标注匹配。\n';
      } else if (fileType === 'style') {
        // 样式块需要 antd 覆盖规则，但不需要表单组件选型表
        p +=
          '本项目已全局注册 ant-design-vue（`<a-xxx>`）。图表使用 ECharts。\n\n';
        p += this._antdDeepIntro();
        p +=
          '```less\n/* ✅ 正确 */\n:deep(.ant-input) { background: transparent; }\n:deep(.ant-select-selector) { background: transparent; }\n:deep(.ant-table-thead) { background: rgba(0,0,0,0.3); }\n:deep(.ant-btn) { border-radius: 4px; }\n\n/* ❌ 错误 — scoped 下不生效 */\n.ant-input { background: transparent; }\n```\n\n';
      } else {
        // 代码块（index.vue/子组件）：完整规则
        p +=
          '本项目已全局注册 ant-design-vue，组件中直接使用 `<a-xxx>` 标签即可，无需 import。\n\n';
        p += '| 场景 | 默认技术栈 | 说明 |\n|------|-----------|------|\n';
        p +=
          '| 表单组件（输入框/下拉/日期/开关/单选/多选） | ant-design-vue | `<a-input>` / `<a-select>` / `<a-date-picker>` / `<a-switch>` / `<a-radio-group>` / `<a-checkbox-group>` |\n';
        p += '| 数据表格 | ant-design-vue | `<a-table>` |\n';
        p += '| 弹窗 | ant-design-vue | `<a-modal>` |\n';
        p += '| 标签页 | ant-design-vue | `<a-tabs>` + `<a-tab-pane>` |\n';
        p += '| 按钮 | ant-design-vue | `<a-button>` |\n';
        p += '| Tab 切换 | 原生 `<div @click>` 或 `<a-tabs>` | 胶囊/标签样式切换，禁止用 `<button>` |\n';
        p +=
          '| 图表 | ECharts | `echarts.init()` + `ResizeObserver` + `watch(chartRef)` |\n\n';
        p +=
          'Figma 节点名标注 `@antd/xxx` 时按标注匹配对应组件；未标注时按上表默认规则选择技术栈。\n\n';
        p +=
          '⚠️ **禁止使用原生 `<button>` 元素**：所有可点击交互元素统一使用 `<a-button>`（按钮场景）或 `<div @click>`（Tab 切换/图标按钮/自定义控件），原生 `<button>` 会带入浏览器默认边框/背景样式，破坏视觉还原。\n\n';
        p += this._antdDeepIntro();
        p +=
          '```less\n/* ✅ 正确 */\n:deep(.ant-input) { background: transparent; border-color: var(--border-color); }\n:deep(.ant-select-selector) { background: transparent; }\n:deep(.ant-table-thead) { background: rgba(0,0,0,0.3); }\n:deep(.ant-table-tbody > tr > td) { border-bottom: 1px solid var(--border-color); }\n:deep(.ant-btn) { border-radius: 4px; }\n\n/* ❌ 错误 — scoped 下不生效 */\n.ant-input { background: transparent; }\n```\n\n';
      }

      if (techStackHints && techStackHints.length > 0) {
        p += '\n##Figma 技术栈标记\n\n';
        p +=
          'Figma 设计文件中包含以下技术栈标记，请优先使用对应的库和组件：\n\n';
        techStackHints.forEach((hint) => {
          p += `- **${hint.library}**${hint.component ? ` / ${hint.component}` : ''}\n`;
          p += `  节点：${hint.nodeName}\n`;
        });
        p += '\n请根据组件描述匹配对应的技术栈。\n';
      }

      // 🆕 技术栈节点样式处理规则（视觉识别驱动）
      if (fileType === 'code' || fileType === 'style') {
        p += '\n\n##技术栈节点样式处理规则（重要）\n\n';
        p +=
          '对于标注了 **@技术栈** 的节点（如 `@ant/select`、`@echarts/bar`），遵循以下规则：\n\n';

        p += '### ✅ 必须保留的容器样式\n\n';
        p += '通过视觉识别提取**容器级别**的样式属性：\n\n';
        p +=
          '1. **背景**：`background` / `background-image`（纯色/渐变/背景图）\n';
        p += '2. **边框**：`border` / `border-radius`（边框和圆角）\n';
        p += '3. **阴影**：`box-shadow`（容器阴影）\n';
        p += '4. **尺寸**：`width` / `height`（容器尺寸）\n';
        p += '5. **间距**：`padding`（容器内边距）\n';
        p += '6. **透明度**：`opacity`（容器透明度）\n\n';

        p += '### ❌ 不要还原的内部样式\n\n';
        p += '- **不要**深入子节点还原样式（组件内部由库控制）\n';
        p +=
          '- **不要**还原组件库内部的样式（如 input 的内边距、hover 效果）\n';
        p += '- **不要**还原内部布局（flex、gap 等由组件库控制）\n';
        p += '- **不要**还原内部文字样式（由组件库控制）\n';
        p += '- **不要**使用装饰性图片资源（如下拉箭头、选项图标）\n\n';

        p += '### 🚫 不要使用 deep 样式穿透\n\n';
        p +=
          '对于以下技术栈，**不要使用 `:deep()` / `/deep/` / `::v-deep`**：\n\n';
        p +=
          '- **UI 组件库**：`@ant` / `@antd` / `@element` / `@el` / `@vant` / `@naive` / `@arco`\n';
        p += '- **图表库**：`@echarts` / `@chart` / `@g2` / `@highcharts`\n';
        p += '- **地图库**：`@amap` / `@bmap` / `@mapbox` / `@leaflet`\n\n';

        p += '**原因**：\n';
        p += '1. 这些组件库自带完整样式系统\n';
        p += '2. 自定义组件已有 `scoped` 隔离\n';
        p += '3. 使用 `deep` 可能破坏组件库的样式逻辑\n\n';

        p += '### 代码生成示例\n\n';
        p += '**✅ 正确示例**（容器样式 + 不使用 deep）：\n\n';
        p += '```vue\n';
        p += '<template>\n';
        p += '  <div class="form-wrapper">\n';
        p += '    <a-form :model="formData">\n';
        p += '      <a-form-item label="用户名">\n';
        p += '        <a-input v-model:value="formData.username" />\n';
        p += '      </a-form-item>\n';
        p += '    </a-form>\n';
        p += '  </div>\n';
        p += '</template>\n\n';
        p += '<style scoped lang="less">\n';
        p += '.form-wrapper {\n';
        p += '  /* ✅ 容器样式：从 Figma 视觉识别提取 */\n';
        p += '  background: #f5f5f5;\n';
        p += '  border-radius: 8px;\n';
        p += '  padding: 24px;\n';
        p += '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);\n';
        p += '  \n';
        p += '  /* ✅ 不使用 deep，让组件保持原生样式 */\n';
        p += '}\n';
        p += '</style>\n';
        p += '```\n\n';

        p += '**❌ 错误示例**（使用 deep 覆盖组件库）：\n\n';
        p += '```vue\n';
        p += '<!-- 不要这样做 -->\n';
        p += '<style scoped lang="less">\n';
        p += '.form-wrapper {\n';
        p += '  background: #f5f5f5;\n';
        p += '  \n';
        p += '  /* ❌ 错误：不要用 deep 覆盖 antd 内部样式 */\n';
        p += '  :deep(.ant-form-item-label) {\n';
        p += '    color: #333333;\n';
        p += '    font-size: 14px;\n';
        p += '  }\n';
        p += '  \n';
        p += '  :deep(.ant-input) {\n';
        p += '    background: #ffffff;\n';
        p += '    border: 1px solid #d9d9d9;\n';
        p += '  }\n';
        p += '}\n';
        p += '</style>\n';
        p += '```\n\n';
      }

      if (_selfOptimization?.promptAugmentation) {
        p += '\n\n## 🧠 自优化增强（基于历史运行数据）\n\n';
        p += _selfOptimization.promptAugmentation + '\n';
      }
      return p;
    };

    // 通用：执行单个分块（middleBuilder 决定"任务要求+输出格式"段落）
    // 📊 方案 4（2026-09-07）：性能监控 —— 记录每个 chunk 的开始/完成时间、耗时、
    // 累计耗时、预估剩余时间，通过 SSE 推送给前端，便于用户感知进度和排查慢 chunk。
    const _perfMonitor = {
      startTime: Date.now(),
      chunks: [],
      totalChunks: 0,
      completedChunks: 0,
    };
    const runChunk = async (chunk, middleBuilder) => {
      const _chunkStartMs = Date.now();
      const _chunkLabel = chunk.title || (chunk.files || []).join('、') || 'unknown';

      // 📡 性能监控：推送 chunk 开始事件
      if (input.onProgress) {
        input.onProgress({
          stage: 'chunk-start',
          status: 'info',
          message: `🚀 开始生成【${_chunkLabel}】（第 ${(_perfMonitor.completedChunks + 1)}/${_perfMonitor.totalChunks || '?'} 块）`,
        });
      }

      //暂停检查：每个分块生成前等恢复（pauseChecker 由 phase2.service 注入）
      const pauseStatus = await this._awaitIfPaused(input.pauseChecker);
      if (pauseStatus === 'cancelled') {
        throw new Error('任务已被用户取消');
      }

      //  部分修订 —— 非目标文件从磁盘保留，跳过 LLM 生成
      if (isPartialRevision) {
        const touchesTarget = (chunk.files || []).some((f) =>
          targetFileSet.has(f),
        );
        if (!touchesTarget) {
          let primed = false;
          for (const f of chunk.files || []) {
            if (allFiles[f] != null) continue;
            const c = diskContent(f);
            if (c != null) {
              allFiles[f] = c;
              primed = true;
            }
          }
          // 文件均已在内存中（已生成或已从磁盘读取）→ 跳过；
          // 若某文件既不在内存也不在磁盘（新引用子组件等），仍交给 LLM 生成，避免缺失。
          if (primed || (chunk.files || []).every((f) => allFiles[f] != null)) {
            this.logger.info('⏩ P1: 跳过未变更文件（从磁盘保留）', {
              files: chunk.files,
            });
            return {
              files: {},
              debug: { skipped: true, reason: 'not-target' },
            };
          }
        }
      }

      // 🛡️ R12（2026-08-30）：断点续跑——检查 meta.completed，已完成的分块直接从磁盘恢复，
      // 跳过 LLM 调用。此前 meta.completed 只写不读，日志「跳过已完成分块」是假陈述，
      // 每次重跑都会全量生成所有分块（恢复内容只当上下文，不跳过生成）。
      // 🛡️ 修复（2026-08-31）：L0-B 重试时，如果有修复指导，需要重新生成目标文件
      if (outputPath && chunk.index != null) {
        const { readFileSync: _rfs, existsSync: _es } = await import('fs');
        const { join: _j } = await import('path');
        const _chunkDir = _j(outputPath, '.mc-gen', 'cache', 'code-chunks');
        const _chunkMetaPath = _j(_chunkDir, 'chunk-meta.json');
        const blockKey = `${chunk.index || 0}-${(chunk.files || []).join(',')}`;

        // 🆕 检查是否在 L0-B 重试流程中
        const isL0BRetry = input._l0CodeRetryGuidance || input._pendingRetry;
        // 🛡️ D 步双保险：字段历史命名 targetFiles / _reviseFiles 两者都认（graph 侧传 targetFiles）
        const retryTargetFiles = input._reviseFiles || input.targetFiles || [];

        // 🆕 判断当前 chunk 是否需要重新生成
        let shouldRegenerate = false;
        if (isL0BRetry) {
          // 如果有明确的目标文件列表，检查当前 chunk 是否包含目标文件
          if (retryTargetFiles.length > 0) {
            shouldRegenerate = (chunk.files || []).some((f) =>
              retryTargetFiles.includes(f),
            );
          } else {
            // 全局重试：重新生成所有代码分块（declare.json 除外）
            const isCodeChunk = (chunk.files || []).some(
              (f) => f.endsWith('.vue') || f.endsWith('.less'),
            );
            shouldRegenerate = isCodeChunk;
          }
        }

        if (_es(_chunkMetaPath) && !shouldRegenerate) {
          try {
            const _meta = JSON.parse(_rfs(_chunkMetaPath, 'utf-8'));
            if (
              _meta &&
              Array.isArray(_meta.completed) &&
              _meta.completed.includes(blockKey)
            ) {
              const recovered = {};
              let allRecovered = true;
              for (const f of chunk.files || []) {
                const safeName = f.replace(/[^a-zA-Z0-9._-]/g, '_');
                const target = _j(_chunkDir, `${chunk.index || 0}-${safeName}`);
                if (_es(target)) {
                  recovered[f] = _rfs(target, 'utf-8');
                } else {
                  allRecovered = false;
                  break;
                }
              }
              if (allRecovered && Object.keys(recovered).length > 0) {
                this.logger.info(
                  `⏩ R12: 跳过已完成分块 ${blockKey}（从磁盘恢复 ${Object.keys(recovered).length} 个文件）`,
                );
                return {
                  files: recovered,
                  debug: { skipped: true, reason: 'checkpoint-resumed' },
                };
              }
              // 文件不完整（可能被清理），清除 meta 中的 completed 记录，重新生成
              if (!allRecovered) {
                this.logger.warn(
                  `⚠️ R12: 已完成分块 ${blockKey} 的文件不完整，重新生成`,
                );
                _meta.completed = _meta.completed.filter((k) => k !== blockKey);
                try {
                  const { writeFileSync: _wfs } = await import('fs');
                  _wfs(_chunkMetaPath, JSON.stringify(_meta, null, 2), 'utf-8');
                } catch (_) {
                  /* ignore */
                }
              }
            }
          } catch (e) {
            this.logger.warn(
              `R12: 读取 chunk-meta.json 失败，跳过断点续跑检查: ${e.message}`,
            );
          }
        }
      }

      //文件类型感知：不同文件类型使用不同的 prompt 构建器，减少无关约束
      const fileType = this._getChunkFileType(chunk);
      let prompt;
      if (fileType === 'declare') {
        prompt = this._buildDeclareChunkPrompt(input, chunk);
      } else if (fileType === 'style') {
        prompt = this._buildStyleChunkPrompt(input, chunk);
        // 🛡️ style 分块输入预算硬门限：超长 Prompt（此前 76k 字符 ≈31.8k tokens）会拖到 180s 超时。
        // 精简 figmaStyleTree/visualElements 后仍超 45k 字符时，按段落裁剪冗余规范段。
        // enforceInputBudget 的 KEEP_ANY 保留含「目标文件/必须输出/关键约束/⚠️/===」的关键契约段，
        // elementStyleMap 与 classNamesList 段均含「⚠️/必须」关键词，不会被误删。
        const MAX_STYLE_PROMPT_CHARS = 45000;
        if (prompt.length > MAX_STYLE_PROMPT_CHARS) {
          const _budget = enforceInputBudget(
            prompt,
            Math.ceil(MAX_STYLE_PROMPT_CHARS / 2.4),
          );
          if (_budget.report.trimmed) {
            this.logger.warn('🛡️ style 分块输入预算裁剪', {
              files: chunk.files,
              report: _budget.report,
            });
            prompt = _budget.prompt;
          }
        }
      } else {
        // 🧩 SubcomponentContract：子组件分块可用 scopedInput 携带"只与本子组件相关"的事实
        //（figma 子树 / elementStyleMap 子集 / layout sections 子集），替代全量 input —— 省 60%+ token。
        // 未提供时行为与原先完全一致（fail-open）。
        const effInput = chunk.scopedInput
          ? { ...input, ...chunk.scopedInput }
          : input;
        // 🔧 2026-08-27 #275：chunkSpec 必须携带 segmentType —— buildCodePrompt 内部据此对
        //   template 段切换 figma 结构摘要 + elementStyleMap 资源子集（瘦身 60%）。
        //   旧代码只传 {middle, sharedFilter}，segmentType 恒 undefined → 摘要分支从未触发（实测 237KB 未变小）。
        prompt = this.buildCodePrompt(effInput, {
          middle: middleBuilder.call(this, chunk, effInput),
          sharedFilter: chunk.segmentType,
          segmentType: chunk.segmentType,
        });
      }
      prompt = appendGlobalGuidance(prompt, fileType);
      // 📊 P0-A：分块 Prompt 体积观测（不记录正文）
      const promptChars = prompt.length;
      this.logger.info('📊 分块 Prompt 体积', {
        fileType,
        files: chunk.files,
        segmentType: chunk.segmentType,
        promptChars,
        estInputTokens: Math.ceil(promptChars / 2.4),
      });
      // 📡 分块级文件生命周期：点亮当前正在生成的文件（前端 fileStates 逐文件跟踪）
      input.onProgress?.({
        fileLifecycle: {
          phase: 'modeling',
          summary: `正在生成：${chunk.title || (chunk.files || []).join('、')}`,
          files: (chunk.files || []).map((f) => ({
            path: f,
            state: 'working',
          })),
        },
      });
      let res = await this._generateSingleChunk(prompt, chunk, input);
      // 🛡️ P0 防护：_generateSingleChunk 异常路径可能返回 undefined/不完整对象
      // 统一兜底为空对象，避免 "Cannot read properties of undefined (reading 'debug'/'error')"
      res = res && typeof res === 'object' ? res : { files: {}, debug: {} };
      chunkDebug.push(res.debug || {});

      //断点续跑：每块生成完成后增量落盘（只追加本块产生的文件，不覆盖已有块）
      // 并行场景下 chunk-meta.json 是共享文件 → 用 metaWriteChain 链式锁串行化读改写
      const writeChunkCheckpoint = async () => {
        if (outputPath && res.files && Object.keys(res.files).length > 0) {
          try {
            const { mkdirSync, writeFileSync } = await import('fs');
            const { join } = await import('path');
            const chunkDir = join(
              outputPath,
              '.mc-gen',
              'cache',
              'code-chunks',
            );
            mkdirSync(chunkDir, { recursive: true });
            const chunkMetaPath = join(chunkDir, 'chunk-meta.json');
            // 读取现有 meta（续跑时保留已完成块记录）
            let meta = {
              completed: [],
              total: chunk.total || 0,
              updatedAt: Date.now(),
            };
            try {
              const { readFileSync, existsSync } = await import('fs');
              if (existsSync(chunkMetaPath)) {
                const prev = JSON.parse(readFileSync(chunkMetaPath, 'utf-8'));
                if (prev && Array.isArray(prev.completed)) meta = prev;
              }
            } catch {
              /* ignore */
            }

            // 逐文件写入本块产物（safeName 保留相对路径语义，续跑时据此恢复）
            const blockFiles = {};
            for (const [filePath, content] of Object.entries(res.files)) {
              const safeName = filePath.replace(/[^a-zA-Z0-9._-]/g, '_');
              const fileTarget = join(
                chunkDir,
                `${chunk.index || 0}-${safeName}`,
              );
              writeFileSync(fileTarget, String(content), 'utf-8');
              blockFiles[filePath] = `${chunk.index || 0}-${safeName}`;
            }
            // 记录本块完成（去重）
            const blockKey = `${chunk.index || 0}-${(chunk.files || []).join(',')}`;
            if (!meta.completed.includes(blockKey)) {
              meta.completed.push(blockKey);
            }
            // 🛡️ P1-5：多段文件（package/index.vue 的 template/script 各段）按 index 升序维护**段数组**。
            // 旧实现是 `Object.assign(meta.files, blockFiles)` 单值覆盖 —— 后写覆盖前写，
            // 使 meta.files['package/index.vue'] 只剩最后一段（脚本/图表段）→ 断点续跑恢复成
            // 「只有 <script> 没有 <template>」的残片，且后续 chunk 见 allFiles[f] != null
            // 判定「已生成」而跳过 → template 永久丢失（组件二 mc-max-1788065992847 实锤）。
            if (!meta.files) meta.files = {};
            for (const [filePath, fileName] of Object.entries(blockFiles)) {
              upsertFileSegment(meta.files, filePath, {
                index: chunk.index || 0,
                file: fileName,
                segmentType: chunk.segmentType || '',
                scriptPart: chunk.scriptPart || '',
              });
            }
            meta.updatedAt = Date.now();
            writeFileSync(
              chunkMetaPath,
              JSON.stringify(meta, null, 2),
              'utf-8',
            );
            this.logger.info(
              `💾 代码生成分块已落盘: ${chunk.index || 0} (${Object.keys(res.files).length} 个文件)`,
            );
          } catch (err) {
            this.logger.warn(`分块落盘失败: ${err.message}`);
          }
        }
      };
      metaWriteChain = metaWriteChain.then(writeChunkCheckpoint);
      await metaWriteChain;

      // 📡 分块完成：文件状态点亮 + 增量发布候选快照（代码 Tab 逐文件可见，不再整组空等）
      if (res.files && Object.keys(res.files).length > 0) {
        input.onProgress?.({
          fileLifecycle: {
            phase: 'writing',
            summary: `已生成：${Object.keys(res.files).join('、')}`,
            files: Object.keys(res.files).map((f) => ({
              path: f,
              state: 'modified',
            })),
          },
        });
        // P1-Slice2：先 Object.assign 合并进 allFiles，再推送「累积全量」。
        // 旧实现在此处直接推 `{ ...allFiles, ...res.files }`（调用时刻求值），而调用方的
        // Object.assign 发生在 runChunk **之外**（1330/1367 行），两者之间隔着 await 边界。
        // 子组件并行（并发 2~3）时会交错：后推送的 revision 缺掉先完成 worker 的文件，
        // createCandidate 又把指针指向新 revision → 预览/产物「回退」（之前的不见了）。
        await pushChunkSnapshot({
          allFiles,
          resFiles: res.files,
          onFilesReady: input.onFilesReady,
          stage: 'microcode-engineer',
          logger: this.logger,
        });
      }

      // 📊 方案 4：性能监控 —— 记录 chunk 完成耗时，推送累计进度
      const _chunkDurationMs = Date.now() - _chunkStartMs;
      _perfMonitor.completedChunks++;
      _perfMonitor.chunks.push({
        label: _chunkLabel,
        segmentType: chunk.segmentType || 'unknown',
        durationMs: _chunkDurationMs,
        success: !!(res && Object.keys(res.files || {}).length > 0),
      });
      if (input.onProgress) {
        const _elapsedMs = Date.now() - _perfMonitor.startTime;
        const _avgMs = _elapsedMs / _perfMonitor.completedChunks;
        const _remaining = (_perfMonitor.totalChunks || 0) - _perfMonitor.completedChunks;
        const _etaMs = _avgMs * Math.max(0, _remaining);
        input.onProgress({
          stage: 'chunk-complete',
          status: 'info',
          message: `✅ 【${_chunkLabel}】完成（耗时 ${(_chunkDurationMs / 1000).toFixed(1)}s），累计 ${Math.round(_elapsedMs / 1000)}s，预估剩余 ${Math.round(_etaMs / 1000)}s`,
        });
      }
      this.logger.info('📊 chunk 性能统计', {
        label: _chunkLabel,
        segmentType: chunk.segmentType,
        durationMs: _chunkDurationMs,
        completed: _perfMonitor.completedChunks,
        total: _perfMonitor.totalChunks,
        elapsedMs: Date.now() - _perfMonitor.startTime,
      });

      return res;
    };

    // 🆕 方案 3（2026-08-31）：资源映射提前解析，供子组件「编译前置校验」使用。
    // ⚠️ 必须定义在 genSubComponents **之外**（generateCode 主干作用域）：
    //    - 子组件 worker 通过闭包读取（1246 附近的 _validateSubcomponentResourceDeps）
    //    - 1620 行之后的代码生成主干同样要读它
    //    若放进 genSubComponents 函数体内部，主干将失去定义 →
    //    ReferenceError: effectiveMapping is not defined（mc-max-1788164636144-38637208 实锤）。
    // 行为与原先 1620 行的 resolveResourceDomMapping 一致（in-memory 优先，磁盘兜底）。
    const effectiveMapping = resolveResourceDomMapping(
      input.resourceDomMapping,
      input.outputPath,
    );

    // 🔗 0907 L7 闭环（2026-09-09）：fileSectionMap 必须定义在 genSubComponents **之外**（generateCode 主干作用域）。
    // 同 effectiveMapping（见上方 L1332-1338 注释的实锤教训 mc-max-1788164636144）：
    //   - 子组件 worker 通过闭包写入（见 1567/1574 行 chunk→section 精确归属）
    //   - 2266 行的资源归属校验（validateResourceAttribution）在 generateCode 主干读取它
    // 若放在 genSubComponents 内部 → 主干读取时 ReferenceError: fileSectionMap is not defined
    // （本次 mc-max-...-9b66f2fe / mc-max-...-ff99b1ac 复现，与 effectiveMapping 同款根因）。
    // 仅在资源确实按 section 收窄时才有值；为空时 L7 自动 fail-open 回退启发式。
    const fileSectionMap = {};

    // 🆕 Loop 0.5：由 effectiveMapping 预构建 Working Manifest（含 sections / resources / contracts[]）。
    // contracts[] 在子组件归属（fileSectionMap，line ~1589）填完后由 buildContracts 补算。
    const workingManifest = buildResourceManifest(
      effectiveMapping || input.resourceDomMapping || [],
    );

    //并行子组件生成：子组件之间互相独立（仅依赖 index.vue 上下文），并发生成大幅提速。
    // 并发度默认 3（env: SUBCOMP_CONCURRENCY），每块独立校验/重试/落盘，互不影响。
    // 🔒 动态封顶：子组件并行 worker 的并发不得超过 AI 网关全局槽位（resolveRequestPolicy().requestConcurrency），
    // 否则单个微码任务内部并发请求会超过全局上限 → 多余 worker 排队 → 120s 队列超时失败。
    const genSubComponents = async (subComps, startIndex) => {
      if (!subComps || subComps.length === 0) return;

      // 🆕 方案 2（2026-09-07）：子组件分组生成
      // 将子组件按功能相似性分组（数据展示类/操作类/导航类/通用类），同组子组件
      // 共享上下文（如相同的 figma 父节点区域），减少重复 token。
      // 分组策略：按子组件路径的父目录分组（同目录下的子组件通常功能相关）。
      // 例如：components/charts/BarChart.vue + components/charts/PieChart.vue → 同组
      const _groupSubcomponents = (paths) => {
        const groups = new Map();
        for (const p of paths) {
          // 提取子组件所在目录（如 components/charts → 'charts'）
          const parts = p.split('/');
          const dir = parts.length > 2 ? parts[parts.length - 2] : 'root';
          if (!groups.has(dir)) groups.set(dir, []);
          groups.get(dir).push(p);
        }
        // 如果分组数 > 子组件数/2，说明分组太散，不如不分组（直接全并发）
        if (groups.size > Math.ceil(paths.length / 2)) {
          return [{ name: 'all', paths }];
        }
        return Array.from(groups.entries()).map(([name, ps]) => ({
          name,
          paths: ps,
        }));
      };

      const subGroups = _groupSubcomponents(subComps);
      const groupSummary = subGroups.length > 1
        ? `（分 ${subGroups.length} 组：${subGroups.map(g => `${g.name}(${g.paths.length})`).join(', ')}）`
        : '';

      // 文件生命周期：子组件并发生成（支持多个活动文件，不虚构单个活动文件）
      input.onProgress?.({
        fileLifecycle: {
          phase: 'modeling',
          summary: `正在并行生成 ${subComps.length} 个子组件${groupSummary}`,
          files: subComps.map((path) => ({ path, state: 'working' })),
        },
      });

      // 📊 性能监控：记录分组信息（便于事后分析分组效果）
      if (subGroups.length > 1) {
        this.logger.info('📦 子组件分组生成', {
          total: subComps.length,
          groups: subGroups.map(g => ({ name: g.name, count: g.paths.length })),
        });
      }

      // 🔀 空串根因治理：并发默认降到 2（原 3）。并发 3 时子组件并行请求易触发 provider 限流
      // 返回空串（empty_string_input），导致 4 次空串重试。降到 2 降低限流概率，配合空串换 provider 双保险。
      const envSubcompConcurrency = Math.max(
        1,
        parseInt(process.env.SUBCOMP_CONCURRENCY || '2') || 2,
      );
      const gatewayConcurrency = resolveRequestPolicy().requestConcurrency || 1;
      const CONCURRENCY = Math.max(
        1,
        Math.min(envSubcompConcurrency, gatewayConcurrency),
      );
      const total = startIndex + subComps.length;
      const indexContent = allFiles['package/index.vue'] || '';

      // 🆕 方案 2：按组构建 chunks，同组子组件共享 scopedInput 缓存
      // 同组子组件通常引用相同的 figma 父节点区域，缓存 scopedInput 避免重复计算
      const _scopedInputCache = new Map();
      const chunks = [];
      let chunkIdx = 0;
      // 🔗 0907 L7 闭环（2026-09-09）：精确 chunk→section 归属表（path → Manifest 权威 key）。
      // worker 归集子组件时据 scopedInput._sectionRef 解析填入（见 1567/1574 行），
      // 最终喂给 L7 防御门禁（2266 行读取 fileSectionMap，已提升至 generateCode 主干作用域）。
      // 替换原「引用资源数最多的 section 为主」启发式（复杂 tab layout 易误判主 section → 合法引用被 BLOCK）。
      // 仅在资源确实按 section 收窄时才有值；为空时 L7 自动 fail-open 回退启发式。
      for (const group of subGroups) {
        for (const subPath of group.paths) {
          // 🧩 SubcomponentContract：本子组件专属事实（figma 子树/elementStyleMap 子集/sections 子集），
          // 替代全量重复的 215KB figmaNodeData —— 预计单块 -60%+ tokens；匹配失败自动回退全量（保真）。
          // 🆕 方案 2：同组子组件共享 scopedInput（按目录缓存，减少重复构建）
          const cacheKey = group.name;
          if (!_scopedInputCache.has(cacheKey)) {
            _scopedInputCache.set(
              cacheKey,
              this._buildSubcomponentScopedInput(subPath, indexContent, input),
            );
          }
          const scopedInput = _scopedInputCache.get(cacheKey);
          const tagName = subPath
            .split('/')
            .pop()
            .replace(/\.vue$/, '');
          const usage = this._extractUsageSnippet(tagName, indexContent);
          chunks.push({
            title: '子组件 ' + subPath,
            files: [subPath],
            index: startIndex + chunkIdx,
            total,
            // 子组件按 component 类型裁剪 shared 规范段（省 token，移除 $mcComponentBuilder 等主组件专属规范）
            segmentType: 'component',
            scopedInput,
            // 🆕 方案 2：记录所属分组（便于性能监控和日志追踪）
            groupName: group.name,
            // usage 摘要替代全量 index.vue：子组件只需知道父组件如何使用自己（props/插槽/布局位置）
            contextFiles: usage
              ? [
                  {
                    path: `package/index.vue（${tagName} 使用处摘要）`,
                    content: usage,
                  },
                ]
              : [{ path: 'package/index.vue', content: indexContent }],
          });
          chunkIdx++;
        }
      }
      let cursor = 0;
      // 📊 性能监控：记录每个 chunk 的开始/完成时间、累计耗时
      const _perfStats = {
        startTime: Date.now(),
        chunks: [],
        completedCount: 0,
      };
      const worker = async () => {
        while (cursor < chunks.length) {
          const chunk = chunks[cursor++];
          const chunkStart = Date.now();
          const resSub = await runChunk(chunk, this._buildChunkMiddle);
          const chunkDuration = Date.now() - chunkStart;
          _perfStats.chunks.push({
            title: chunk.title,
            groupName: chunk.groupName,
            duration: chunkDuration,
            success: !!(resSub && Object.keys(resSub.files || {}).length > 0),
          });
          _perfStats.completedCount++;
          // 📡 性能监控：推送每个 chunk 完成后的累计耗时和预估剩余时间
          if (input.onProgress) {
            const elapsed = Date.now() - _perfStats.startTime;
            const avgDuration = elapsed / _perfStats.completedCount;
            const remaining = chunks.length - _perfStats.completedCount;
            const eta = Math.round(avgDuration * remaining / 1000);
            input.onProgress({
              stage: 'subcomponent-progress',
              status: 'info',
              message: `✅ 【${chunk.title}】完成（${(chunkDuration / 1000).toFixed(1)}s），累计 ${Math.round(elapsed / 1000)}s，预估剩余 ${eta}s`,
            });
          }
          const safeResSub =
            resSub && typeof resSub === 'object'
              ? resSub
              : { files: {}, debug: {} };
          // 🔧 CODE-001/CODE-002 修复：子组件 <style> 自动补齐 lang="less" scoped + @import index.less
          for (const [f, c] of Object.entries(safeResSub.files || {})) {
            if (
              typeof f === 'string' &&
              f.includes('/components/') &&
              f.endsWith('.vue') &&
              typeof c === 'string'
            ) {
              let fixed = this._ensureSubComponentStyleAttrs(c);
              fixed = this._ensureSubComponentStyleImport(fixed);
              fixed = this._injectChartMinHeight(fixed);
              // 🎯 Phase 2 方案7: 自动修复子组件尺寸约束
              fixed = _autoFixSubComponentSizePure(fixed);

              // 🎯 阶段 B 结构层接管：确定性统计行配对对齐（跳过 LLM 的配对猜测）。
              // 仅对 assessStatRowConfidence 判 high 的统计行子组件生效；严格前置校验
              // 不满足即 no-op，不误伤其它子组件。配对事实源 = Figma 子树文本 + bbox.x。
              const _statTag = f.split('/').pop().replace(/\.vue$/, '');
              const _statMembers = statRowHealMap.get(_statTag);
              if (_statMembers) {
                const _healed = healStatRowMemberPairing(fixed, _statMembers);
                if (_healed.changed) {
                  fixed = _healed.content;
                  this.logger.info(
                    `🎯 阶段B 统计行配对确定性对齐: ${f}`,
                    { pairs: _statMembers.map((m) => `${m.title}→${m.value}`) },
                  );
                }
              }

              // 🔁 层② 反转（2026-09-11）：子组件资源「defineProps prop → 本地 import」。
              // 反转 P0/D 旧契约（资源只归主组件、子组件 defineProps 接收 + 父透传）：该契约要求
              // LLM 在主组件写盘时把资源 props 全量透传给子组件，实测反复漏传 → CODE-019 BLOCK →
              // 全量重写重试仍漏 → 3×BLOCK 不收敛；且与层①「系统确定性生成 index.vue 模板骨架」
              // （生成的子组件标签不带 props）根本冲突。
              // 新契约：**子组件自己 import 自己用到的资源**，父组件不再需要透传，CODE-019 检测面归零。
              // 顺序关键：必须先删 prop（否则 collectDeclaredBindings 记为「已声明」→ 下方
              // injectResourceImports 撞名复核拒绝注入 import → 资源静默 undefined）；删除后由下方
              // 默认分支（去掉 skipResourceVars）扫描模板实际引用并注入本地 import。
              try {
                const _sp = stripResourcePropsFromDefineProps(fixed, effectiveMapping)
                if (_sp.changed) {
                  fixed = _sp.content
                  this.logger.info(`🔁 子组件资源契约反转(去 prop 待本地 import): ${f}`, {
                    removed: _sp.removed,
                  })
                }
              } catch (spErr) {
                this.logger.warn('🔁 子组件资源 prop 剥离异常（非阻断）', {
                  error: spErr?.message || String(spErr),
                })
              }

              // 🆕 方案 1: 子组件资源自动注入（2026-08-31）
              // R0-1（2026-09-01）：统一走 resource-import-guard 的 injectResourceImports
              // （单一事实源）。子组件位于 package/components/，relBase 为 ../../resources/images/。
              // 🔁 层② 反转（2026-09-11）：子组件资源变量**改回本地 import**（上方已剥离同名 prop），
              // 故不再传 skipResourceVars:true，走默认分支扫描模板实际引用的资源变量并注入 import。
              fixed = injectResourceImports(
                fixed,
                effectiveMapping,
                '../../resources/images/',
              );

              // 🆕 方案 3: 编译前置校验（2026-08-31）
              // 在写入前检查资源依赖完整性
              // R0-2（2026-09-01）：补传 effectiveMapping（此前漏传第 3 参 → 校验恒空转）
              const validation = this._validateSubcomponentResourceDeps(
                fixed,
                f,
                effectiveMapping,
              );
              if (!validation.valid) {
                this.logger.warn(`⚠️ 子组件资源依赖校验失败: ${f}`, {
                  errors: validation.errors,
                });
              }

              if (fixed !== c) {
                safeResSub.files[f] = fixed;
                this.logger.info(
                  `🔧 子组件自动修复 style 属性/import/min-height/尺寸约束: ${f}`,
                );
              }
            }
          }
          Object.assign(allFiles, safeResSub.files || {});
        }
      };
      // 🔗 0907 L7 闭环（2026-09-09）：子组件文件精确归属。
      // 用 chunk 携带的 scopedInput._sectionRef（L6 资源过滤命中时的 section 标识）
      // 解析成 Manifest 权威 key 写入 fileSectionMap；未命中 section（无 ref）则跳过
      // （该项由 L7 启发式兜底，不阻断）。
      const _subCompManifest = buildResourceManifest(
        effectiveMapping || input.resourceDomMapping || [],
      );
      for (const chunk of chunks) {
        try {
          const subFile = (chunk?.files || [])[0];
          if (!subFile) continue
          // 🎯 0907 治本②（2026-09-09）：优先用 L6 收窄后资源的权威 ownerSectionId（已是细化 key，
          // 如 slot-con/Group 2136637321 / slot-当日总流量）。同一 chunk 的 scoped 资源若归属同一
          // 细化 key（同卡片/同具名 section），该 key 即该子组件文件的精确归属，直接喂给 L7 精确模式。
          const scoped = Array.isArray(chunk?.scopedInput?.resourceDomMapping)
            ? chunk.scopedInput.resourceDomMapping
            : [];
          const ownerKeys = Array.from(
            new Set(scoped.map((m) => m?.ownerSectionId).filter(Boolean)),
          );
          if (ownerKeys.length === 1) {
            fileSectionMap[subFile] = ownerKeys[0];
            continue;
          }
          // 兜底：具名 section（traffic/env 真实 slot 路径），用 _sectionRef 解析回 Manifest key。
          const ref = chunk?.scopedInput?._sectionRef;
          if (ref) {
            const secKey = resolveSectionKey(_subCompManifest, ref.title || ref.id);
            if (secKey) fileSectionMap[subFile] = secKey;
          }
        } catch {
          /* 归属解析失败不阻断（L7 启发式兜底） */
        }
      }
      // 🆕 Loop 0.5：fileSectionMap 填完后，由 Working Manifest 生成 contracts[]（不反推 defineProps）。
      // contracts[] 供 Loop 1 写盘 import 收窄（不再 forceAll 全量）与 autoWire 强制接线。
      workingManifest.contracts = buildContracts(workingManifest, fileSectionMap);
      if (workingManifest.contracts.length > 0) {
        this.logger.info('🆕 Working Manifest contracts 已生成', {
          count: workingManifest.contracts.length,
          files: workingManifest.contracts.map((c) => c.file),
        });
      }
      const workers = [];
      for (let i = 0; i < Math.min(CONCURRENCY, chunks.length); i++)
        workers.push(worker());
      await Promise.all(workers);
      this.logger.info(
        `⚡ 子组件并行生成完成: ${subComps.length} 个（并发 ${Math.min(CONCURRENCY, subComps.length)}）`,
      );
    };

    // 🎨 P1 style 拆分：common.less 与 theme-vars.less 拆为两个独立分块（顺序生成，通用路径，三条复杂度分支共用）。
    // 依据：双文件单请求连续 2 个任务同位 180s 超时（输出体积过大是主因）。拆分后：
    //   - 单请求输出减半，超时概率显著下降；
    //   - 各分块独立 180s 预算 + 独立 provider 重试，失败只重试失败分块；
    //   - theme-vars 先行（定义颜色变量/主题 mixin），common.less 后行并以其为上下文，
    //     保证 common.less 引用的变量名与 theme-vars 定义一致（不改变视觉产物）。
    // 部分修订（isPartialRevision）天然兼容：runChunk 对非目标文件分块自动跳过并从磁盘补齐。
    const runStyleChunks = async (idx, styleCtx, classList) => {
      const THEME_VARS_PATH = 'resources/styles/themes/theme-vars.less';
      const COMMON_LESS_PATH = 'resources/styles/common.less';

      const chunkTheme = {
        title: '主题变量',
        files: [THEME_VARS_PATH],
        index: idx,
        total: idx + 1,
        contextFiles: [],
        classNamesList: [],
        segmentType: 'style',
      };
      const resTheme = await runChunk(chunkTheme, this._buildChunkMiddle);
      const safeResTheme =
        resTheme && typeof resTheme === 'object'
          ? resTheme
          : { files: {}, debug: {} };
      Object.assign(allFiles, safeResTheme.files || {});

      // theme-vars 内容可能来自本次生成，也可能来自部分修订/断点续跑的磁盘回填（runChunk 已写入 allFiles）
      const themeVarsContent = allFiles[THEME_VARS_PATH] || '';
      const commonCtx = [];
      if (themeVarsContent) {
        commonCtx.push({ path: THEME_VARS_PATH, content: themeVarsContent });
      }
      for (const cf of styleCtx || []) commonCtx.push(cf);

      const chunkCommon = {
        title: '业务样式',
        files: [COMMON_LESS_PATH],
        index: idx + 1,
        total: idx + 1,
        contextFiles: commonCtx,
        classNamesList: classList || [],
        segmentType: 'style',
      };
      const resCommon = await runChunk(chunkCommon, this._buildChunkMiddle);
      const safeResCommon =
        resCommon && typeof resCommon === 'object'
          ? resCommon
          : { files: {}, debug: {} };
      Object.assign(allFiles, safeResCommon.files || {});
    };

    try {
      // 📊 方案 4：性能监控 - 预估总 chunk 数（用于计算 ETA）
      // 初始预估值，后续在子组件检测后会更新
      if (splitDecision.split && complexity !== 'medium') {
        const scriptChunks = splitDecision.scriptSplit ? 2 : 1;
        _perfMonitor.totalChunks = 1 + scriptChunks + 2; // declare + index.vue + style(2)，子组件后续追加
      } else if (complexity === 'medium') {
        _perfMonitor.totalChunks = 4; // declare(1) + index.vue(1) + style(2)
      } else {
        _perfMonitor.totalChunks = 2; // declare(1) + index.vue(1)
      }
      this.logger.info('📊 性能监控初始化', {
        totalChunks: _perfMonitor.totalChunks,
        complexity,
        scriptSplit: !!splitDecision.scriptSplit,
      });

      if (splitDecision.split && complexity !== 'medium') {
        // ═══ 统一分块路径：complex / simple-risky 共用（medium 回滚实验：恢复整文件优先）═══
        // index.vue 默认拆为 <template> + <script> 两段；超大组件（scriptSplit）再把 script 拆为 状态/行为 两段（#9a）
        this.logger.info('🧩 分块生成组件（统一路径）', {
          complexity,
          splitReason: splitDecision.reason,
          scriptSplit: !!splitDecision.scriptSplit,
          sizeTier: splitDecision.sizeTier,
          estTokens: splitDecision.estTokens,
        });

        // 批1: declare.json（🛡️ P0：带降级兜底）
        const chunkD = {
          title: '声明文件',
          files: ['declare.json'],
          index: 1,
          total: 6,
          contextFiles: [],
          segmentType: 'declare',
        };
        const resD = await this._safeGenerateDeclareJson(
          runChunk,
          input,
          chunkD,
        );
        const safeResD =
          resD && typeof resD === 'object' ? resD : { files: {}, debug: {} };
        Object.assign(allFiles, safeResD.files || {});

        // 批2-4: index.vue（template + script，超大组件 script 拆两段）
        const indexVue = await this._generateIndexVue(runChunk, input, {
          splitDecision,
          allFiles,
        });
        if (indexVue) {
          allFiles['package/index.vue'] = indexVue;
        }

        // 批5: 子组件（据 index.vue import 引用动态补生成，并行）
        const subComps = this._detectSubComponents(
          allFiles['package/index.vue'] || '',
        );
        // 🛡️ 层①配套（2026-09-11 · c-device-monitor-1fduq67s 实锤）：确定性模板按 effectiveSections
        // 生成全部子组件标签，但 LLM script 段可能只 import 部分 → _detectSubComponents 仅按 import
        // 反推 → 模板标签对应的子组件文件永不生成 → 悬空标签（渲染断裂/白块）。与 vue3-engineer
        // 同款修法对齐：把模板 PascalCase 标签并入候选清单（extractComponentTagNames 已排除 Vue 内置）。
        _unionTemplateTagSubComponents(subComps, allFiles['package/index.vue'] || '');
        // 📊 方案 4：更新总 chunk 数（子组件检测完成后）
        _perfMonitor.totalChunks += subComps.length;
        await genSubComponents(subComps, 5);
        const idx = 5 + subComps.length;

        // 批6: 样式（🎨 P1 拆分：theme-vars 先行 + common 后行，均回填 Vue 上下文保证 class 命名一致）
        //  程序化提取模板 class 名，注入为硬约束
        const extractedSplit = this._extractTemplateClassNames(
          allFiles,
          input.componentName,
        );
        classNamesList = extractedSplit.fullList;

        const styleCtxSplit = this._collectVueContextFiles(allFiles);
        await runStyleChunks(idx, styleCtxSplit, classNamesList);
      } else if (complexity === 'medium') {
        // ═══ 回滚实验：medium 恢复"整文件优先"策略 ═══
        this.logger.info('⚡ 回滚实验：medium 组件恢复整文件优先', {
          splitReason: splitDecision.reason,
          sizeTier: splitDecision.sizeTier,
          estTokens: splitDecision.estTokens,
        });

        // 批1: declare.json
        const chunkD = {
          title: '声明文件',
          files: ['declare.json'],
          index: 1,
          total: 3,
          contextFiles: [],
          segmentType: 'declare',
        };
        const resD = await this._safeGenerateDeclareJson(
          runChunk,
          input,
          chunkD,
        );
        const safeResD =
          resD && typeof resD === 'object' ? resD : { files: {}, debug: {} };
        Object.assign(allFiles, safeResD.files || {});

        // 批2: index.vue 整文件优先，截断才降级拆分
        try {
          const chunkI = {
            title: '主组件',
            files: ['package/index.vue'],
            index: 2,
            total: 3,
            contextFiles: [
              { path: 'declare.json', content: allFiles['declare.json'] || '' },
            ],
          };
          const resI = await runChunk(chunkI, this._buildChunkMiddle);
          const safeResI =
            resI && typeof resI === 'object' ? resI : { files: {}, debug: {} };
          Object.assign(allFiles, safeResI.files || {});
        } catch (truncErr) {
          this.logger.warn(
            '⚠️ 回滚实验：medium 组件 index.vue 整文件截断，降级为 template/script 拆分',
            { error: truncErr.message },
          );
          const fallbackSplit = { ...splitDecision };
          const indexVue = await this._generateIndexVue(runChunk, input, {
            splitDecision: fallbackSplit,
            allFiles,
          });
          if (indexVue) {
            allFiles['package/index.vue'] = indexVue;
          }
        }

        // 批3: 子组件（并行）
        const subComps = this._detectSubComponents(
          allFiles['package/index.vue'] || '',
        );
        // 🛡️ 层①配套（2026-09-11）：模板标签并入候选清单（详见 complex 分支注释）
        _unionTemplateTagSubComponents(subComps, allFiles['package/index.vue'] || '');
        await genSubComponents(subComps, 3);
        const idx = 3 + subComps.length;

        // 批4: 样式（🎨 P1 拆分：theme-vars 先行 + common 后行）
        const extractedMedium = this._extractTemplateClassNames(
          allFiles,
          input.componentName,
        );
        classNamesList = extractedMedium.fullList;

        const styleCtxAllVueMed = this._collectVueContextFiles(allFiles);
        await runStyleChunks(idx, styleCtxAllVueMed, classNamesList);
      } else {
        // ═══ 简单低风险：decl + index 两批（不拆分 index.vue）═══
        this.logger.info(
          '⚡ 简单组件：低风险，保留 declare + index.vue 两批生成',
          {
            reason: splitDecision.reason,
            sizeTier: splitDecision.sizeTier,
            estTokens: splitDecision.estTokens,
          },
        );

        const chunkA = {
          title: '主组件 + 声明',
          files: ['declare.json', 'package/index.vue'],
          index: 1,
          total: 2,
          contextFiles: [],
        };
        const resA = await runChunk(chunkA, this._buildChunkMiddle);
        const safeResA =
          resA && typeof resA === 'object' ? resA : { files: {}, debug: {} };
        Object.assign(allFiles, safeResA.files || {});

        const subComps = this._detectSubComponents(
          allFiles['package/index.vue'] || '',
        );
        // 🛡️ 层①配套（2026-09-11）：模板标签并入候选清单（详见 complex 分支注释）
        _unionTemplateTagSubComponents(subComps, allFiles['package/index.vue'] || '');
        await genSubComponents(subComps, 2);
        const idx = 2 + subComps.length;

        //  程序化提取模板 class 名
        const extractedSimple = this._extractTemplateClassNames(
          allFiles,
          input.componentName,
        );
        classNamesList = extractedSimple.fullList;

        const styleCtxAllVueSim = this._collectVueContextFiles(allFiles);
        await runStyleChunks(idx, styleCtxAllVueSim, classNamesList);
      }

      // 🔍 诊断：保存分块聚合响应（便于排查真实 LLM 输出 / 截断）
      try {
        const debugDir = dirname(input.outputPath || backendRoot);
        if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true });
        const debugPath = join(debugDir, 'debug-microcode-ai-response.txt');
        writeFileSync(
          debugPath,
          JSON.stringify(
            { mode: 'chunked-adaptive', complexity, chunks: chunkDebug },
            null,
            2,
          ),
          'utf-8',
        );
        this.logger.info('🔍 [诊断] 分块 AI 响应已保存', {
          path: debugPath,
          chunkCount: chunkDebug.length,
          complexity,
        });
      } catch (e) {
        this.logger.warn('保存调试文件失败', { error: e.message });
      }

      // 合并后全量截断检测
      const truncationIssues = this._detectFileTruncation(allFiles);

      // 🛡️ P1-3: declare.json 截断时跳过 JSON 修复链，直接模板兜底
      // declare.json 是配置文件，截断后走 JSON 修复链（_repairJSON）成功率极低且浪费时间，
      // 直接用模板兜底更快更可靠。其他文件的截断仍需报错。
      const declareTruncationIssues = truncationIssues.filter((issue) =>
        issue.includes('declare.json'),
      );
      const otherTruncationIssues = truncationIssues.filter(
        (issue) => !issue.includes('declare.json'),
      );

      if (declareTruncationIssues.length > 0) {
        this.logger.warn(
          '⚠️ declare.json 被截断，跳过 JSON 修复链直接模板兜底',
          { issues: declareTruncationIssues },
        );
        const fallbackDeclare = _templateDeclareJson({
          componentId: this._normalizeComponentId(input.componentName),
          componentName: input.componentName || '未知组件',
          nodeData: {},
          backgroundBrightness: input.backgroundBrightness || 'dark',
        });
        allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2);
      }

      if (otherTruncationIssues.length > 0) {
        this.logger.error('🚨 分块合并后仍存在文件截断（非 declare.json）', {
          truncationIssues: otherTruncationIssues,
        });
        throw new Error(
          `LLM 输出文件不完整：${otherTruncationIssues.join('；')}`,
        );
      }

      // 🛡️ 刀 12（2026-09-13）：**跨侧基名对齐必须早于「类名交叉校验 + 兜底 stub 生成」**。
      // 缺陷链：模板与样式源由两次独立 LLM 调用产出 → 同一元素落到两个基名上
      // （实测 mc-1789305950498-6a45b6f2：模板 c-device-monitor-tab / --active，
      //   样式 .c-device-monitor-tab-item / .c-device-monitor-tab-item--active）
      // → 交叉校验报「模板 class 未定义」→ 兜底按 elementStyleMap 补**只含布局属性**的 stub
      //   → 告警被遮掉，但设计样式（背景色/圆角/内边距/字重/激活态底色）**永不生效**。
      // 对齐后立刻重算 classNamesList：否则仍拿旧名单校验新模板，会为旧名补出死 stub。
      // 同时把 R1/R2 方言归一提早到这里（写盘出口那次保留作幂等兜底），
      // 使「交叉校验 → 兜底」看到的就是最终类名，避免 stub 被后续归一变死（历史 C4 噪声来源）。
      try {
        const _dialect = normalizeClassNameDialect(allFiles);
        if (_dialect.changes.length > 0) {
          for (const [k, v] of Object.entries(_dialect.files)) allFiles[k] = v;
          classNamesList = this._extractTemplateClassNames(
            allFiles,
            input.componentName,
          ).fullList;
          this.logger.info('🛡️ 类名对齐（刀 12 跨侧基名 + R1/R2 方言）', {
            count: _dialect.changes.length,
            crossSide: _dialect.changes.filter((ch) => ch.rule === 'R4').length,
            samples: _dialect.changes.slice(0, 3),
          });
        }
      } catch (e) {
        this.logger.warn(`类名对齐失败，按原样继续校验: ${e?.message || e}`);
      }

      // 🛡️ 刀 18（2026-09-14）：紧接类名对齐之后 —— 它会把 `:class="{ active: … }"` 的
      // **对象键**也当类名改写（`active` → `c-x-switch-item--active`），带连字符的裸键
      // 不是合法 JS 标识符 → SFC 解析失败 → P1-4 把整个子组件剔除。
      // 此处把这类裸键统一补引号，收口在「改写器之后、校验之前」。
      try {
        let keyFixes = 0;
        for (const [k, v] of Object.entries(allFiles)) {
          if (!k.endsWith('.vue') || typeof v !== 'string') continue;
          const healed = microcodeHealer.healUnquotedObjectKeysInVue(v);
          if (healed !== v) {
            allFiles[k] = healed;
            keyFixes += 1;
          }
        }
        if (keyFixes > 0) {
          this.logger.warn(
            `🛡️ 已为 ${keyFixes} 个 .vue 补全绑定表达式对象键引号（防连字符裸键致 SFC 解析失败）`,
          );
        }
      } catch (e) {
        this.logger.warn(`对象键引号补全失败，按原样继续: ${e?.message || e}`);
      }

      // 🛡️ 刀 19（2026-09-14）：LLM 偶发把**数据对象的键**写成类名
      // （`{ 'c-device-monitor-error': '5' }` 配 `{{ item.error }}`）→ 取值恒 undefined
      // → 文字/数字凭空消失。语法合法、类名真实存在 → L0-B 与契约层都拦不住，
      // 只能拿「模板实际访问的 .prop」当事实源做确定性还原。
      try {
        let dataKeyFixes = 0;
        for (const [k, v] of Object.entries(allFiles)) {
          if (!k.endsWith('.vue') || typeof v !== 'string') continue;
          const healed = microcodeHealer.healClassPrefixedDataKeys(v);
          if (healed !== v) {
            allFiles[k] = healed;
            dataKeyFixes += 1;
          }
        }
        if (dataKeyFixes > 0) {
          this.logger.warn(
            `🛡️ 已为 ${dataKeyFixes} 个 .vue 还原被写成类名的数据键（防模板取值恒空）`,
          );
        }
      } catch (e) {
        this.logger.warn(`数据键还原失败，按原样继续: ${e?.message || e}`);
      }

      // 🛡️ 刀 20（2026-09-14）：父容器缺 display:flex → 子组件根的 flex 值全部失效
      // → 本应「左 Tab + 右内容」的骨架塌成纵向堆叠、内容被挤出视口（CSS 合法、门禁全绿）。
      // 检测与修复全部复用 FLEX-003 的兄弟组事实源（parseVueTemplate + flexIndex + compRoots）。
      try {
        const _flexFix = healMissingFlexContainers(
          Object.entries(allFiles).map(([path, content]) => ({ path, content })),
          this.logger,
        );
        if (_flexFix.fixed.length > 0 || _flexFix.warnings.length > 0) {
          for (const fx of _flexFix.fixed) {
            allFiles[fx.path] = _flexFix.files.find((x) => x.path === fx.path)?.content ?? allFiles[fx.path];
          }
          this.logger.warn(`🛡️ 刀 20 flex 容器补全：${JSON.stringify(_flexFix.fixed)}，警告: ${JSON.stringify(_flexFix.warnings)}`);
        }
      } catch (e) {
        this.logger.warn(`flex 容器补全失败，按原样继续: ${e?.message || e}`);
      }

      // 🛡️ 刀 22-grid（2026-09-14）：设备网格本应是 N 列 grid，LLM 却写成
      //   `display: flex; flex-wrap: wrap; ... width: calc(25% - …)`（c-device-monitor-54038a3a 实锤）。
      // 事实源 = planner effectiveSections 透传的 gridColumns（与 prompt/约束层同源，绝不臆测列数）。
      // 结构判定（不靠类名硬编码）：父容器子项同质/带等宽意图 + 父当前是 flex 或缺失 display →
      // 确定性改写为 `display: grid; grid-template-columns: repeat(N, 1fr)` 并清掉子项百分比宽度。
      try {
        const gridCandidates = (dedupeDuplicateSections(effectiveSections || []) || [])
          .map((s) => Number(s?.gridColumns ?? s?.body?.gridColumns ?? NaN))
          .filter((n) => Number.isFinite(n) && n >= 2);
        if (gridCandidates.length > 0) {
          const _gridFix = healGridContainer(
            Object.entries(allFiles).map(([path, content]) => ({ path, content })),
            { gridColumnsList: gridCandidates },
            this.logger,
          );
          if (_gridFix.fixed.length > 0 || _gridFix.warnings.length > 0) {
            for (const fx of _gridFix.fixed) {
              allFiles[fx.path] = _gridFix.files.find((x) => x.path === fx.path)?.content ?? allFiles[fx.path];
            }
            this.logger.warn(`🛡️ 刀 22 设备网格 grid 治愈：${JSON.stringify(_gridFix.fixed)}，警告: ${JSON.stringify(_gridFix.warnings)}`);
          }
        }
      } catch (e) {
        this.logger.warn(`设备网格 grid 治愈失败，按原样继续: ${e?.message || e}`);
      }

      //  Class 名交叉校验（模板 vs common.less）+ 自动修复
      const validationResult = this._validateClassNames(
        allFiles,
        input.componentName,
        classNamesList,
        input.elementStyleMap,
      );
      const classMismatches = validationResult.mismatches;
      if (classMismatches.length > 0) {
        this.logger.warn('⚠️ Class name mismatches (template vs common.less)', {
          count: classMismatches.length,
          sample: classMismatches.slice(0, 5),
        });
        // 透出 warning 到前端进度流
        // P0-①（2026-09-01）：mismatches 现含正向（模板→样式，可 fallback 修复）与
        // 反向（样式→模板，reverse:true，仅提示）两类，计数与文案须拆开，避免误导。
        const forwardCount = classMismatches.filter((m) => !m.reverse).length;
        const reverseCount = classMismatches.length - forwardCount;
        const status = validationResult.fixed ? 'warning' : 'warning';
        const fixMsg = validationResult.fixed
          ? `，已自动从 elementStyleMap 生成 ${forwardCount} 条 fallback 规则补救`
          : '';
        const reverseMsg =
          reverseCount > 0
            ? `；另有 ${reverseCount} 个 common.less 已定义但模板未引用（冗余样式或模板漏挂载）`
            : '';
        input.onProgress?.({
          stage: '样式校验',
          message: `⚠️ 检测到 ${forwardCount} 个 class 名不匹配（模板使用了但 common.less 未定义）${fixMsg}${reverseMsg}`,
          status,
          details: classMismatches.slice(0, 10),
        });

        //  自动修复 — 将 fallback CSS 追加到 common.less
        if (validationResult.fixed && validationResult.fallbackCss) {
          const currentLess = allFiles['resources/styles/common.less'] || '';
          allFiles['resources/styles/common.less'] =
            currentLess +
            '\n\n/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n' +
            validationResult.fallbackCss;
          this.logger.info('已将 fallback CSS 规则追加到 common.less', {
            addedBytes: validationResult.fallbackCss.length,
          });
        }
      }

      //  跨文件一致性校验（template ↔ script 变量名/事件名/数据源）
      const templateBindings = this._extractTemplateBindings(allFiles);
      const consistencyResult = this._validateCrossFileConsistency(
        allFiles,
        templateBindings,
      );
      if (consistencyResult.mismatches.length > 0) {
        this.logger.warn('⚠️ 跨文件一致性不匹配', {
          count: consistencyResult.mismatches.length,
          sample: consistencyResult.mismatches
            .slice(0, 5)
            .map((m) => `${m.type}:${m.variable}`),
        });
        input.onProgress?.({
          stage: '一致性校验',
          message: `⚠️ ${consistencyResult.mismatches.length} 个跨文件变量名不一致（ref/事件/数据源缺少声明）`,
          status: 'warning',
          details: consistencyResult.mismatches.slice(0, 10),
        });
      }

      // 🛡️ 资源 import 注入（必须在语义门禁之前执行）
      // 模型按规范禁止手写 import，bg1/bg2/icon2 等资源变量由本后处理器依据 resourceDomMapping 注入。
      // 若 in-memory 映射丢失（任何路径：lite / max / develop / 修订 / UI 缓存命中漏传），
      // 从磁盘 .mc-gen/resource-dom-mapping.json 兜底重载，确保注入一定跑在门禁前，避免被门禁误杀。
      // 🆕 方案 3（2026-08-31）：effectiveMapping 已提前在 genSubComponents 定义（约 1170 行），
      // 此处直接复用，避免同作用域重复声明（SyntaxError: Identifier 'effectiveMapping' has already been declared）。
      const _hadInMemory =
        Array.isArray(input.resourceDomMapping) &&
        input.resourceDomMapping.length > 0;
      if (effectiveMapping && effectiveMapping.length > 0) {
        const source = _hadInMemory ? 'in-memory' : 'disk-fallback';
        const vueFiles = Object.keys(allFiles).filter(
          (f) => f.endsWith('.vue') && typeof allFiles[f] === 'string',
        );
        let injectedCount = 0;
        // P0-②（2026-09-01）：占位符终验——注入后仍残留的资源占位符逐文件聚合诊断
        const placeholderDiag = [];
        for (const [relPath, content] of Object.entries(allFiles)) {
          if (!relPath.endsWith('.vue') || typeof content !== 'string')
            continue;
          const relBase = /^package\/components\//.test(relPath)
            ? '../../resources/images/'
            : '../resources/images/';
          const diag = { residual: [], unmapped: [] };
          // 🔁 层② 反转（2026-09-11）：主组件不再走 contractMapping（也不再 forceAll）。
          // 资源归各自组件本地持有：主组件只注入「自己模板里实际引用」的资源变量
          // （injectResourceImports 默认分支扫描），子组件各自 import，无需父透传。
          const injected = injectResourceImports(
            content,
            effectiveMapping,
            relBase,
            diag,
          );
          if (diag.residual.length > 0 || diag.unmapped.length > 0) {
            placeholderDiag.push({ file: relPath, ...diag });
          }
          if (injected !== content) {
            allFiles[relPath] = injected;
            injectedCount++;
            this.logger.info(
              '✅ 已自动注入资源import语句（生成内阶段，门禁前）',
              { file: relPath, source },
            );
          }
        }
        if (placeholderDiag.length > 0) {
          this.logger.warn(
            '⚠️ 资源占位符终验：注入后仍存在未解析的资源变量（运行时 undefined 风险）',
            { files: placeholderDiag },
          );
          input.onProgress?.({
            stage: '资源校验',
            message: `⚠️ ${placeholderDiag.length} 个文件存在未解析资源占位符（${placeholderDiag
              .map((d) => d.file.split('/').pop())
              .join('、')}），运行时背景/图标可能静默丢失`,
            status: 'warning',
            details: placeholderDiag.slice(0, 10),
          });
        }
        this.logger.info('微码资源import注入完成（门禁前）', {
          source,
          vueFileCount: vueFiles.length,
          injectedCount,
          mappingCount: effectiveMapping.length,
        });

        // 🛡️ P1.7（2026-09-11）引用驱动补齐：旧注入只认模板使用形态，**script 内引用是盲区**
        // （13890774 实锤：`const deviceIcons=[icon3,…,icon14]` 写在 script 里 → 只注入 3 个 import
        // → 运行时 `icon4 is not defined` 整组件渲染失败）。此处按「引用采集（模板+script）」
        // 对齐事实源补齐 import；无对应的幽灵引用交由 T08 兜底。
        try {
          const _refFix = microcodeResources.ensureResourceImportsForRefs
            ? microcodeResources.ensureResourceImportsForRefs(allFiles, effectiveMapping, {
                logger: this.logger,
              })
            : null;
          if (_refFix && _refFix.injected.length > 0) {
            for (const [k, v] of Object.entries(_refFix.files)) allFiles[k] = v;
            input.onProgress?.({
              stage: '资源校验',
              message: `🧩 资源 import 引用驱动补齐 ${_refFix.injected.length} 项（含 script 内引用）`,
              status: 'success',
              details: _refFix.injected.slice(0, 10),
            });
          }
        } catch (e) {
          this.logger.warn('资源 import 引用驱动补齐失败（fail-open）', {
            error: e?.message || String(e),
          });
        }
      } else {
        this.logger.warn(
          '⚠️ 微码资源映射完全缺失（内存与磁盘 .mc-gen/resource-dom-mapping.json 均无），跳过 import 注入，模板资源变量将不被解析',
          {
            componentName: input.componentName,
            outputPath: input.outputPath,
            hadInMemory: _hadInMemory,
          },
        );
      }

      // 🛡️ P1-2：孤儿子组件剔除 + chunk-meta 清退（2026-08-27）
      // 根因（mc-1787829888023 重试实锤）：断点恢复的旧子组件与本轮新命名子组件混批——chunk-meta 只追加
      // 不清退，本轮 index.vue 只 import 新命名组件，旧 DeviceGrid.vue 残留 allFiles，引用上轮 theme-vars
      // 的 less 变量 → 本轮 LESS 编译 fail-closed。剔除 = allFiles 过滤 + 磁盘 meta/files/completed 同步清退。
      // ⚠️ 顺序约束：必须在 P0-1（背景兜底挂载）之前执行，否则 P0-1 把 bg 挂载到「将被剔除的孤儿子组件」，
      //   剔除后 bg 挂载随之丢失 → L0-B 仍报 bg 未使用（mc-1787836782370 复测实锤：bg2 挂到 EnvTabsBar 被剔除）。
      // 🛡️ F5（2026-09-01）：L0-B 重试轮对 LESS 安全的续跑孤儿白名单保留，斩断「清退→重生成」震荡
      // （mc-max-1788252098143-12469472：3 轮烧 ~15 个子组件生成预算）。区分信号见
      // resource-mounter.js splitLessSafeOrphans——引用本轮未定义 less 变量的陈旧产物照旧剔除（P1-2 语义）。
      const _prunedOrphans = this._pruneOrphanSubComponents(
        allFiles,
        input.outputPath,
        effectiveMapping,
        {
          isL0BRetry: !!(input._l0CodeRetryGuidance || input._pendingRetry),
        },
      );
      if (_prunedOrphans.length > 0) {
        this.logger.warn(
          '🛡️ P1-2 已剔除孤儿子组件（不在 index.vue import 链/模板引用中）',
          { pruned: _prunedOrphans },
        );
        input.onProgress?.({
          stage: '孤儿清理',
          message: `🛡️ 已剔除 ${_prunedOrphans.length} 个孤儿子组件（${_prunedOrphans.map((p) => p.split('/').pop()).join('、')}）`,
          status: 'warning',
          details: _prunedOrphans,
        });
      }

      // 🛡️ 删减法批次 2（2026-09-14 · 485d724d 实锤）：计划驱动资源挂载。
      // 取代旧 autoMountUnusedBackgrounds/Icons 的「关键词猜测 + 跨文件/根回退」：
      // buildResourceMountPlan 以 section 归属（批次 1 已锚定）+ figma 祖先链确定 owner，
      // 同 resourceFile 单变量 + sharedBy；mountPlannedResources 限定 owner 文件挂载、
      // 目标不命中只记诊断（fail-closed，不再回退挂根容器——那正是「背景消失/错位」根源）。
      // 回滚：env RESOURCE_PLANNED_MOUNT=false（回滚后不再有任何兜底挂载，漏用由门禁 WARN 提示）。
      if (
        process.env.RESOURCE_PLANNED_MOUNT !== 'false' &&
        effectiveMapping &&
        effectiveMapping.length > 0
      ) {
        const mountResult = this._mountPlannedResources(
          allFiles,
          effectiveSections,
          effectiveMapping,
          input,
        );
        if (mountResult.mounted.length > 0) {
          input.onProgress?.({
            stage: '资源计划挂载',
            message: `🛡️ 已按计划挂载 ${mountResult.mounted.length} 个资源（${mountResult.mounted.map((x) => x.var).join('、')}）`,
            status: 'warning',
            details: mountResult.mounted,
          });
        }
        if (mountResult.diagnostics.length > 0) {
          this.logger.warn('🛡️ 资源计划挂载诊断（fail-closed，未回退）', {
            diagnostics: mountResult.diagnostics,
          });
        }
      }

      // 🛡️ 第二道防线（最终门禁）：语义完整性 —— 重复 import / 仅 import 无逻辑 / 模板引用未声明变量
      // 这类"能闭合但必然坏"的产物在单块阶段可能漏网（如脚本段各自闭合但拼接后重复），
      // 合并后必须整体复查，命中即明确失败（不写坏文件），而不是静默落盘导致前端空白。
      //
      // 🛡️ 根因修复（2026-08-24）：此前最终门禁未传 implicitlyDeclared，
      // 导致子组件标签（<SectionHeader>）和 Vue 内置组件（<Transition>）被误判"模板引用未声明变量"，
      // 任务被 fail-closed 阻断。此处统一与分块生成阶段（L2640）对齐，传入：
      //   1) resourceVars：资源变量（bg1/icon1 等），由上方 injectResourceImports 注入
      //   2) subCompTags：子组件 PascalCase 标签，由后续 _wireVue3SubComponentImports 接线
      //   3) VUE_BUILTIN_COMPONENTS：Vue 内置组件（Transition/KeepAlive 等）
      const _finalResourceVars = extractResourceVarNames(
        resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
      );
      const _indexVueContent = allFiles['package/index.vue'] || '';
      const _finalSubCompTags = _indexVueContent
        ? extractComponentTagNames(_indexVueContent)
        : [];
      const _finalImplicitlyDeclared = [
        ...new Set([
          ..._finalResourceVars,
          ..._finalSubCompTags,
          ...VUE_BUILTIN_COMPONENTS,
        ]),
      ];

      // 🛡️ #1b（mc-max-1787927914106 实锤）：语义校验前，把 CSS 替代资源的语义名引用
      // （url(${bgm})）确定性替换成真实色值 backgroundColor，避免「模板引用未声明变量」
      // 语义 fail-closed 死循环（bgm 无 resourceFile，既不 import 也不视为已声明）。
      const _cssSubFixes = this._resolveCssSubstituteRefs(
        allFiles,
        effectiveMapping,
      );
      if (_cssSubFixes.length > 0) {
        this.logger.warn('🛡️ 已替换 CSS 替代资源的误用引用', {
          fixes: _cssSubFixes,
        });
      }

      // 🛡️ W1（2026-09-01 事故 5 · mc-max-1788239096135-c19dfe56）：
      // 不可用资源变量（missing 容器 / 臆造编号）的模板引用，在语义门禁前确定性剔除。
      // 典型形态：Figma 容器节点 tabs-icon 拆分导出后自身无图片（downloadStatus='missing'），
      // LLM 从结构树节点名臆造出 icontabsIcon 写进模板；该名字既不在 buildVarToMapping
      // （只收 success）也不在门禁白名单 → 判「模板引用未声明变量」→ fail-closed。
      // 而下一轮 LLM 看到的仍是同一棵结构树 → 确定性复现同一臆造（两轮报错逐字相同）
      // → 重试预算纯浪费、任务必失败。故此处按治理原则 1 落盘前拦截，不让任务被判死。
      const _deadResFixes = healUnavailableResourceRefs(
        allFiles,
        effectiveMapping,
      );
      if (_deadResFixes.length > 0) {
        this.logger.warn(
          '🛡️ 已剔除不可用资源变量的模板引用（避免语义门禁 fail-closed 死循环）',
          { fixes: _deadResFixes },
        );
      }

      // 🛡️ C1 已随删减法批次 2 loop 2c 删除（2026-09-14）：同图多别名在编号阶段根治
      // （visual-order-assign 同 resourceFile 共享 assignedVarName + prompt 侧折叠 isSharedAlias），
      // LLM 只会见到同图单变量，事后合并失去存在理由。

      // 🛡️ C2（2026-09-07，#568）：空壳解绑。T1 标题剥离后，原父容器 div 残留
      // :style 绑定变成空壳（只有 background 引用，无 class/子内容）。清理这些无效绑定，
      // 避免运行时 ReferenceError 或静默渲染失败。
      const _c2Result = this._stripEmptyShellBindings(
        allFiles,
        effectiveMapping,
      );
      if (_c2Result.fixes.length > 0) {
        Object.assign(allFiles, _c2Result.files);
        this.logger.warn('🛡️ C2 已清理空壳绑定', {
          fixes: _c2Result.fixes,
        });
      }

      const semanticIssues = [];
      for (const [p, c] of Object.entries(allFiles)) {
        if (!p.endsWith('.vue') || typeof c !== 'string') continue;
        // index.vue 必须携带 <script setup>（需要 $mcComponentBuilder）；子组件允许纯静态
        const sem = validateVueScriptSemantics(c, p, {
          requireScriptTag: p === 'package/index.vue',
          implicitlyDeclared: _finalImplicitlyDeclared,
        });
        // 🛡️ TDZ 自动修复回写：校验函数内部已尝试 autoFixTdzAssignments，
        //    若 content 变化则回写 allFiles，让后续写盘使用修复后的版本
        if (sem.content && sem.content !== c) {
          allFiles[p] = sem.content;
        }
        semanticIssues.push(...sem.issues);
      }
      if (semanticIssues.length > 0) {
        this.logger.error(
          '🚨 语义完整性校验未通过（重复 import / 仅 import 无逻辑 / 模板引用未声明变量），拒绝产出坏文件',
          {
            issues: semanticIssues.slice(0, 10),
          },
        );
        input.onProgress?.({
          stage: '语义校验',
          message: `🚨 组件文件语义不完整（${semanticIssues.length} 项），任务失败：${semanticIssues[0]}`,
          status: 'error',
          details: semanticIssues.slice(0, 10),
        });
        // 🛡️ 半成品抢救：语义拦截前先提交「完整拼装后的 allFiles」作为候选快照。
        // 根因（2026-08-26 复审修正）：此前 chunk 级 onFilesReady 只回传中间段（template 段或某段 script），
        // 任务级 onFilesReady 又在语义校验之后才触发，导致 throw 时 partial 快照指向 chunk 中间态（index.vue 缺 template/script）。
        // 此处在校验拦截前主动交一次完整 allFiles，使 phase2 catch 路径的 markPartial 落到「完整最终态」快照上，
        // 失败任务即可预览、可进 PG 手动补全（而非 fail-closed 无产物）。失败不阻断本次抛错。
        if (typeof input.onFilesReady === 'function') {
          try {
            await input.onFilesReady({
              stage: 'microcode-engineer',
              files: { ...allFiles },
            });
          } catch (snapshotError) {
            this.logger.warn(
              `语义拦截前候选快照发布失败（非阻断）：${snapshotError?.message || snapshotError}`,
            );
          }
        }
        throw new Error(
          `组件文件语义不完整，拒绝产出坏文件：\n${semanticIssues
            .slice(0, 10)
            .map((i) => `- ${i}`)
            .join('\n')}`,
        );
      }

      // 🛡️ 资源归属校验（方案5 + #278 降级）：bg/icon/img 未使用已降为 WARN + 自愈。
      // bg 由 _autoMountUnusedBackgrounds 确定性挂载；icon/img 由 generateAttributionGuidance 注入重试 prompt。
      // 跨 section 资源错绑（RES-ATTR-CROSS-SECTION）仍为 BLOCK（L7 防御性门禁）。
      const _resourceAttribution = validateResourceAttribution({
        resourceDomMapping: resolveResourceDomMapping(
          input.resourceDomMapping,
          input.outputPath,
        ),
        files: allFiles,
        rootBox: input.figmaNodeData?.absoluteBoundingBox || null,
        // 🔴 0907 L7 治本·跨 section 资源错绑 BLOCK（防御性门禁，L5/L6 已在 prompt 层过滤资源）
        // 显式传入 sectionManifest 即启用；fileSectionMap 非空时走「chunk→section 精确归属」
        // （来自 L6 资源过滤命中时的 section 标识，权威 key 由 resolveSectionKey 解析），
        // 否则 fail-open 走「引用资源数最多的 section 为主」启发式兜底。
        sectionManifest: buildResourceManifest(
          resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
        ),
        fileSectionMap: Object.keys(fileSectionMap).length > 0 ? fileSectionMap : null,
      });

      // 🛡️ 1.C 治本·跨 section 错绑确定性剥离（修，不只 BLOCK）：fileSectionMap 精确模式下，
      // 把绑定到非归属 section 的 DOM 引用（url(${x}) / <img :src="x">）与对应 import 一并移除，
      // 避免只为绿而 BLOCK 等 LLM 重试、又避免错绑资源视觉乱用。无 fileSectionMap 不删（Loop 0.D）。
      if (_resourceAttribution && Object.keys(fileSectionMap).length > 0) {
        const stripRes = stripCrossSectionResourceBindings(
          buildResourceManifest(
            resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
          ),
          allFiles,
          fileSectionMap,
        )
        if (stripRes.removed.length > 0) {
          for (const [p, c] of Object.entries(stripRes.files)) allFiles[p] = c
          this.logger.warn(
            `🛡️ 1.C 已剥离 ${stripRes.removed.length} 处跨 section 错绑: ` +
              stripRes.removed.map((r) => `${r.file}:${r.varName}(${r.owningSection}≠${r.boundSection})`).join('、'),
          )
        }
      }

      // #278 降级（2026-08-30）：bg/icon/img 未使用从 BLOCK 降为 WARN + 自愈。
      // 根因：LLM 可能把 N 个同类资源合并成 v-for 循环（如 14 个 tab icon → 12 项），
      // 这是合理的代码抽象，不应 fail-closed。改为 WARN 并自动追加未引用资源到产物。
      //
      // 自愈策略：
      //   1. 未引用的 icon → 在 template 末尾追加 <img :src="iconX" style="display:none" />
      //   2. 未引用的 img → 同上
      //   3. 未引用的 bg → 调用 _autoMountUnusedBackgrounds 自动挂载（已有完整逻辑）
      // 这样既保证资源被引用（通过门禁），又不阻断合理的代码抽象。
      if (_resourceAttribution.issues.length > 0) {
        // 只收集 bg 未使用（用于真实挂载自愈）；icon/img 未使用不再追加 display:none 假绑定。
        // 根因（2026-09-01 收敛）：旧实现对未使用 icon/img 追加 `<img style="display:none">` 以
        // 「通过门禁」，而缺口②语料清洗（resource-import-guard.js HIDDEN_SINGLE_RE）恰恰把
        // display:none img 定义为假绑定剔除 → 自愈写进去、清洗又剔掉、下游 resource-mounter
        // 再判未使用，死循环。icon/img 无自然位置就 WARN（交由 RESOURCE-001 L0-B 提示），不强塞。
        const unusedBgs = [];

        for (const issue of _resourceAttribution.issues) {
          this.logger.warn(`⚠️ 资源归属校验：${issue.message}`);

          // 按类型收集（issue.id 格式：RES-UNUSED-BG）
          if (issue.id === 'RES-UNUSED-BG' && issue.varName) {
            unusedBgs.push(issue.varName);
          }
        }

        // 自愈：未引用的 bg → 计划驱动挂载（与门禁前同一 helper，幂等，非 display:none 假绑定）
        if (unusedBgs.length > 0) {
          const bgMountResults = this._mountPlannedResources(
            allFiles,
            effectiveSections,
            resolveResourceDomMapping(
              input.resourceDomMapping,
              input.outputPath,
            ),
            input,
          ).mounted;
          if (bgMountResults.length > 0) {
            this.logger.warn(
              `🛡️ 已自愈挂载 ${bgMountResults.length} 个未引用 bg 资源: ${bgMountResults.map((r) => r.var).join(', ')}`,
            );
          }
        }

        // 推送进度
        input.onProgress?.({
          stage: '资源归属校验',
          message: `⚠️ ${_resourceAttribution.issues.length} 个资源未使用（bg 已挂载，icon/img 提示使用）`,
          status: 'warning',
          details: _resourceAttribution.issues.map((i) => i.message),
        });

        // 挂到 input，供重试轮次注入归属指导（避免背景资源反复漏用/挂错）
        if (!input._attributionGuidance) {
          input._attributionGuidance = generateAttributionGuidance(
            _resourceAttribution.issues,
            _resourceAttribution.bgAttribution,
          );
        }
      }

      // 🛡️ LESS 自愈（内存版，与 LessCompileGate.healLessSource 同源）：模型常在 <style lang="less">
      // 漏写结尾分号（如 `background-size: 100% 100%` 紧接下一行 `transition: ...`），导致预览
      // LESS 编译失败 → load-error → RUNTIME-004 硬阻断。此处先于写盘修正内存中的 allFiles，
      // 确保修复版本真正落盘（门禁 write-back 只写磁盘、不回写内存，会被后续 writeFiles 覆盖）。
      // 启发式仅"在两个声明之间补 ;"，属恒安全的 CSS 修正；仅当内容确实变化时回写。
      // 覆盖 .vue 内联样式、以及 standalone .less/.css（如 resources/styles/common.less 同款漏分号）。
      // 🛡️ 顺带坍缩独立 .less/.css 的双 c- 选择器前缀（与 .vue 侧 _collapseDoubleCPrefixInVue 同源）
      // 🛡️ #278 新增：检测并移除 scoped CSS 中的 `url(varName)` 错误用法（不会解析为 import 变量）
      for (const [p, c] of Object.entries(allFiles)) {
        if (typeof c !== 'string') continue;
        if (!p.endsWith('.vue') && !p.endsWith('.less') && !p.endsWith('.css'))
          continue;
        if (p.endsWith('.less') || p.endsWith('.css')) {
          const collapsedLess = this._collapseDoubleCPrefixInLess(c);
          if (collapsedLess !== c) {
            allFiles[p] = collapsedLess;
            this.logger.warn(`🛡️ 已坍缩双 c- 选择器前缀: ${p}`);
          }
        }
        const healed = healLessSource(allFiles[p], {
          sourceType: p.endsWith('.vue') ? 'vue' : 'style',
        });
        if (healed.changed) {
          allFiles[p] = healed.source;
          this.logger.info('🩹 已自愈 LESS 语法（补分号/闭合块注释）', {
            file: p,
          });
        }

        // 🛡️ #278（2026-08-30）：检测 scoped CSS 中的 `url(varName)` 错误用法。
        // 根因：模型常在 <style lang="less" scoped> 里写 `background-image: url(bg3);`，
        // 但 scoped CSS 中的 url() 不会解析为 import 的变量（bg3 是 JS 变量，CSS 不识别）。
        // 正确做法是用 inline :style 绑定（如 :style="{ backgroundImage: `url(${bg3})` }"）。
        // 此处检测并移除错误的 url(varName) 声明，避免生成无效 CSS。
        if (
          p.endsWith('.vue') &&
          c.includes('<style') &&
          c.includes('scoped')
        ) {
          const scopedCssUrlVarRegex = /url\((bg\d+|icon\d+|img\d+)\)/g;
          if (scopedCssUrlVarRegex.test(c)) {
            // 移除包含 url(varName) 的整行声明
            const fixedContent = c.replace(
              /^\s*(background(?:-image)?:\s*url\((?:bg\d+|icon\d+|img\d+)\)[^;]*;?)\s*$/gm,
              '/* [REMOVED] scoped CSS url(varName) 不会解析，请改用 inline :style 绑定 */',
            );
            if (fixedContent !== c) {
              allFiles[p] = fixedContent;
              this.logger.warn(
                `🛡️ 已移除 scoped CSS 中的 url(varName) 错误用法: ${p}（请改用 inline :style 绑定）`,
              );
            }
          }
        }
      }

      // 🛡️ 样式文件后处理兜底（T05/T06/T07 覆盖 .less/.css）：
      // 微码组件的真实样式（width/height/background-size/url）主要写在 resources/styles/common.less，
      // 而 _postProcessIndexVue 只处理 package/index.vue，导致 T06 容器尺寸校验漏掉
      // common.less 里的「子容器尺寸 == 根容器」BBox fallback（如 title-deco 420×186，实锤
      // mc-max-1787717625475）。此处对 .less/.css 统一补跑 T05（bg-size→cover）/T06（容器尺寸）/T07（资源引用）。
      const _rootBoxForStyle = input.figmaNodeData?.absoluteBoundingBox;
      for (const [p, c] of Object.entries(allFiles)) {
        if (typeof c !== 'string') continue;
        if (!p.endsWith('.less') && !p.endsWith('.css')) continue;

        // T05: 硬编码 background-size px → cover（连字符语法）
        let styleContent = _fixBackgroundImageSizePure(c);
        if (styleContent !== c) {
          allFiles[p] = styleContent;
          this.logger.info(
            '🔧 T05: 样式文件 bg-size 修正（硬编码 px → cover）',
            { file: p },
          );
        }

        // T06: 容器尺寸校验 + 确定性自动修正（BBox fallback → auto，回写修正结果）
        if (_rootBoxForStyle?.width && _rootBoxForStyle?.height) {
          const t06 = _validateContainerSizePure(
            styleContent,
            _rootBoxForStyle.width,
            _rootBoxForStyle.height,
          );
          if (t06.fixed > 0) {
            styleContent = t06.code;
            allFiles[p] = styleContent;
            this.logger.info(
              `🔧 T06: 样式文件已自动修正 ${t06.fixed} 处 BBox fallback（子容器尺寸 → auto）`,
              { file: p },
            );
          }
          if (t06.warnings?.length > 0) {
            this.logger.warn('🔧 T06: 样式文件容器尺寸校验发现异常', {
              file: p,
              warnings: t06.warnings,
            });
          }
        }

        // T07: 同一资源被多容器引用 → 告警（资源分发错误）
        const { warnings: usageWarnings } =
          _validateResourceUsagePure(styleContent);
        if (usageWarnings?.length > 0) {
          this.logger.warn('🔧 T07: 样式文件资源引用校验发现异常', {
            file: p,
            warnings: usageWarnings,
          });
        }
      }

      // 🛡️ P0-1 扩展：<style> 内错误 LESS 变量引用归一化（资源变量 url(@bgN)→真实路径 + 发明变量→默认值）
      // 根因（mc-1787833161983 复测实锤）：模型把资源变量名当 LESS 变量写 url(@bg2)/url(@bg3)，并发明
      // @color-tab-default-text 等 theme-vars 里不存在的变量 → validateVueSfc less preprocess 报
      // "variable @x is undefined" → 最终 SFC 校验 fail-closed。此处确定性归一化，避免重试掷骰子。
      const _styleVarNormalized = this._normalizeStyleLessVars(
        allFiles,
        effectiveMapping,
      );
      if (_styleVarNormalized.length > 0) {
        this.logger.info('🛡️ P0-1 扩展：style 变量归一化完成', {
          fixed: _styleVarNormalized,
        });
        input.onProgress?.({
          stage: '样式变量归一化',
          message: `🛡️ 已归一化 ${_styleVarNormalized.length} 个文件的错误 LESS 变量引用（资源变量→真实路径 / 发明变量→默认值）`,
          status: 'warning',
          details: _styleVarNormalized,
        });
      }

      // 🛡️ 所有内容变换完成后，用真实 JavaScript/TypeScript parser 校验最终 SFC script。
      // 这一步必须位于 LESS 自愈之后，防止任何后处理把合法代码改成 `,;` 等非法语法后继续写盘。
      const syntaxIssues = [];
      const badVueFiles = [];
      // 🛡️ 主题变量补集（mc-max-1788258252381-9168ed08 实锤，2026-09-01）：validateVueSfc
      // 在内存阶段剥离相对 @import（index.less 未落盘防误报），连带剥掉 theme-vars.less 的
      // 变量定义 → 子组件合法引用 `calc(@fontSize * 1.14)` 报 `variable @fontSize is undefined`
      // → STYLE_SYNTAX → P1-4 误杀 4/5 个健康子组件。以文件集 .less 顶层变量注入 globalVars
      // 补回定义（与 import 链等价），产物零改写。
      const lessGlobalVars = extractLessGlobalVars(allFiles);
      for (const [p, c] of Object.entries(allFiles)) {
        if (!p.endsWith('.vue') || typeof c !== 'string') continue;
        // 🛡️ #3 门禁前最后防线（mc-max-1787920512973 实锤，2026-08-28）：LLM 尾部
        // 「``` 围栏 + 说明文字」垃圾会让 SFC 编译器把说明文字当 template 解析，
        // 报 "Element is missing end tag"（报错行落在说明文字里，误导排查方向）。
        // 该错误本可确定性自愈（剥离即合法），却触发整轮重试（模型行为不变，
        // 注定再失败）烧掉预算。此处在 validateVueSfc 判死前统一剥离，覆盖
        // 解析层/清洗层/断点续跑恢复全部遗漏路径。
        const tailStrip = stripLlmTailGarbage(p, c);
        if (tailStrip.stripped) {
          allFiles[p] = tailStrip.content;
          chunkFixes.push(
            `TAIL-GARBAGE: 已剥离 ${p} 尾部 LLM 说明泄漏（-${tailStrip.strippedLines} 行，${tailStrip.reason}）`,
          );
          this.logger.warn('🛡️ 门禁前剥离 LLM 尾部说明泄漏', {
            file: p,
            strippedLines: tailStrip.strippedLines,
            reason: tailStrip.reason,
          });
          input.onProgress?.({
            stage: '语法校验',
            message: `🧹 已剥离 ${p} 尾部 LLM 说明泄漏（-${tailStrip.strippedLines} 行，可确定性修复，无需重试）`,
            status: 'warning',
            details: { file: p, reason: tailStrip.reason },
          });
        }
        // 🛡️ 孤儿 JSDoc 行修复：拼装/重试替换可能丢失 `/**` 开注释行，留下 `* xxx` / 孤立 `*/`
        // 导致 SFC 编译 Unexpected token 直接拒绝产出（mc-max-1787562131366 实锤：76 行 `* 加载汇总数据`）。
        const jsdocFixed = this._fixOrphanJsdocInVue(allFiles[p]);
        const collapsedVue = this._collapseDoubleCPrefixInVue(jsdocFixed);
        if (collapsedVue !== c) {
          allFiles[p] = collapsedVue;
          this.logger.warn(`🛡️ 已修复孤儿 JSDoc 注释行 / 双 c- 前缀: ${p}`);
        }
        // 🛡️ 重复 <template> 去重（避免门禁硬阻断整个任务）
        const dedup = this._deduplicateTemplateBlocks(allFiles[p]);
        if (dedup.fixed) {
          allFiles[p] = dedup.source;
          this.logger.warn(
            `🛡️ 内存校验自动去重 <template> 标签（${dedup.removedCount} 个）: ${p}`,
          );
        }

        const result = validateVueSfc(allFiles[p], p, { lessGlobalVars });
        if (result.errors && result.errors.length > 0) {
          syntaxIssues.push(...result.errors);
          badVueFiles.push({ path: p, errors: result.errors });
        }
      }
      if (badVueFiles.length > 0) {
        // 🛡️ P1-4：单文件坏 → 隔离降级，而非整体否决（2026-08-30）
        // 根因（R9，mc-max-1788067021808-b401bed4 实锤）：5 个子组件全部生成成功，
        // 仅 FlowPrediction.vue 一个失败 → 1436 字符主入口 + 4 个健康子组件全部丢弃，
        // 9 分钟成果清零。语义门禁本意是防坏文件，不该承担「连坐」语义。
        const _iso = this._isolateBadVueFiles(allFiles, badVueFiles, input);
        if (!_iso.ok) {
          // 含不可降级文件（如 package/index.vue）→ 维持原 fail-closed 行为
          input.onProgress?.({
            stage: '语法校验',
            message: `🚨 Vue SFC 编译错误（${syntaxIssues.length} 项），拒绝写盘：${syntaxIssues[0]}`,
            status: 'error',
            details: syntaxIssues.slice(0, 10),
          });
          throw new Error(
            `Vue SFC 编译错误，拒绝产出坏文件：\n${syntaxIssues
              .slice(0, 10)
              .map((i) => `- ${i}`)
              .join('\n')}`,
          );
        }
        // 原地替换（allFiles 按引用传递给后续流程）
        for (const _k of Object.keys(allFiles)) delete allFiles[_k];
        Object.assign(allFiles, _iso.files);
        for (const _f of _iso.fixes) chunkFixes.push(_f);
        input.onProgress?.({
          stage: '语法校验',
          message: `🩹 ${_iso.removed.length} 个子组件编译失败，已隔离降级（主组件与其余子组件保留，可二次生成）`,
          status: 'warning',
          details: {
            removed: _iso.removed,
            errors: badVueFiles.map((b) => ({
              file: b.path,
              errors: b.errors.slice(0, 3),
            })),
          },
        });
      }

      if (
        !allFiles ||
        typeof allFiles !== 'object' ||
        Object.keys(allFiles).length === 0
      ) {
        throw new Error('LLM 返回的 files 对象为空');
      }

      // 🛡️ P0 修复：最终校验 declare.json（缺失或无效则用模板兜底）
      if (
        !allFiles['declare.json'] ||
        typeof allFiles['declare.json'] !== 'string'
      ) {
        this.logger.warn('⚠️ declare.json 缺失或格式异常，启用模板兜底', {
          type: typeof allFiles['declare.json'],
        });
        const fallbackDeclare = _templateDeclareJson({
          componentId: this._normalizeComponentId(input.componentName),
          componentName: input.componentName || '未知组件',
          nodeData: {},
          backgroundBrightness: input.backgroundBrightness || 'dark',
        });
        allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2);
      } else {
        // 验证是否是有效 JSON
        try {
          JSON.parse(allFiles['declare.json']);
        } catch (jsonErr) {
          this.logger.warn('⚠️ declare.json 非有效 JSON，启用模板兜底', {
            error: jsonErr.message,
          });
          const fallbackDeclare = _templateDeclareJson({
            componentId: this._normalizeComponentId(input.componentName),
            componentName: input.componentName || '未知组件',
            nodeData: {},
            backgroundBrightness: input.backgroundBrightness || 'dark',
          });
          allFiles['declare.json'] = JSON.stringify(fallbackDeclare, null, 2);
        }
      }

      // 🛡️ 推 A 全 .vue 层（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：写盘前对**所有**
      // .vue 做悬空子组件引用剥离。今日 commit 的 stripUnplannedSubComponentImports 只守 index.vue
      // 一层，无法覆盖「子组件内部越权 import 未生成兄弟 section」的真实崩溃点（2290591b 的
      // ContentSection.vue 导入 7 个不存在的 .vue → 运行时 404 → RUNTIME-004/007 硬 BLOCK）。
      // 此处与 detectDanglingComponentRefs（门禁层 WARN）共用同一套引用识别，凡指向产物中
      // 不存在的 .vue 的 import 一律剥离，并同步移除模板孤儿标签，保证落盘内容自洽、零悬空。
      // fail-open：异常或无可剥离项时原样返回。
      try {
        const _stripRes = stripDanglingComponentRefs(allFiles);
        if (_stripRes.stripped.length > 0) {
          this.logger.warn('🔧 已剥离全 .vue 层悬空子组件引用（避免运行时 404 / render-error）', {
            stripped: _stripRes.stripped,
          });
        }
      } catch (_stripErr) {
        this.logger.warn('🔧 悬空引用剥离异常（非阻断）', { error: _stripErr?.message || String(_stripErr) });
      }

      this.logger.info('✅ 组件代码分块生成完成', {
        fileCount: Object.keys(allFiles).length,
        complexity,
        degradedScriptParts: input._degradedScriptParts || [],
        // 🛡️ P1-4：被隔离降级的坏文件清单（供任务状态/前端「不完整，可二次生成」标签）
        degradedFiles: input._degradedFiles || [],
        autoFixes: chunkFixes,
      });
      return {
        success: true,
        files: allFiles,
        // 🆕 Loop 0.5/1：把 Working Manifest（含 contracts[]）带回 execute 层，供落盘终验兜底
        // 按契约注入主组件 import（避免 forceAll 冲掉收窄结果）。
        workingManifest: workingManifest || { contracts: [] },
        degradedScriptParts: input._degradedScriptParts || [],
        // 🛡️ P1-4：坏文件隔离降级清单（与 degradedScriptParts 并列，语义不同）
        degradedFiles: input._degradedFiles || [],
        // 🛡️ 分块阶段自动修复记录（TAIL-GARBAGE / P1-4 ISOLATE），由 execute() 合并进 autoFixes
        autoFixes: chunkFixes,
        // 🛡️ 资源归属指导（方案5）：带回 execute 层，经 graph 写回 state 供重试轮次注入。
        _attributionGuidance: input._attributionGuidance || null,
        // 🛡️ R1-2：布局事实（rootContainerClass / sectionRoots），由 execute 转 rootLayoutFacts
        // 供下游归一器与 fix-section-heights 规则②改读事实、退役命名枚举。
        indexTemplateFacts: input._indexTemplateFacts || null,
      };
    } catch (error) {
      // 🚨 崩溃堆栈追踪（2026-08-30 为排查 Cannot read properties of undefined (reading 'error') 添加）
      this.logger.error('组件代码生成失败', {
        error: error.message,
        errorName: error.name,
        errorStack: error.stack,
        errorCode: error.code,
      });
      throw error;
    }
  }

  /**
   * 构建单个分块的"任务要求 + 输出格式"段落（替换完整版 middleFull）
   */
  _buildChunkMiddle(chunk, input) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildChunkMiddle(chunk, input, options);
  }

  /**
   *从长 template 内容中提取结构化摘要（ref、class、事件绑定），
   * 用于大组件分块生成时给后续批提供上下文，避免 6000 字符硬截断丢失关键信息。
   */
  _extractTemplateSummary(templateContent) {
    return microcodePrompt.extractTemplateSummary(templateContent);
  }

  /**
   *P1-A：按文件类型取上下文片段——template 超阈值用结构化契约摘要，其余适度截断。
   * 复用于 script 分块（script 只依赖 template 的 ref/class/事件契约，不需完整模板结构）。
   */
  _contextFileSnippet(
    cf,
    { templateThreshold = 12000, nonTemplateLimit = 8000 } = {},
  ) {
    const content = cf?.content || '';
    const isTemplateCtx =
      (cf?.path || '').includes('index.vue') ||
      (cf?.path || '').includes('template');
    if (isTemplateCtx && content.length > templateThreshold) {
      return this._extractTemplateSummary(content);
    }
    if (isTemplateCtx) return content;
    return content.slice(0, nonTemplateLimit);
  }

  /**
   *输出格式段的通用警告（分隔符误用 + 代码内分节注释），多处分块 prompt 复用。
   * @param {boolean} withChecklist - coreAndChecklist 段多一个「检查清单」提醒
   * @param {boolean} brief - true 时返回单行引用（用于后续分块，避免重复 ~170 字）
   */
  _outputFormatWarnings(withChecklist = false, brief = false) {
    return microcodePrompt.outputFormatWarningsForChunk(withChecklist, brief);
  }

  /**
   *antd 样式覆盖的公共说明（style / code 分支复用）。示例代码因分支不同仍各自拼接。
   */
  _antdDeepIntro() {
    return microcodePrompt.antdDeepIntro();
  }

  /**
   *判断分块的文件类型
   * - 'declare': 纯 declare.json
   * - 'style': 纯 .less/.css 样式文件
   * - 'vue': index.vue 或子组件 .vue
   * - 'mixed': 混合类型（如 declare.json + index.vue）
   */
  _getChunkFileType(chunk) {
    return microcodePrompt.getChunkFileType(chunk);
  }

  /**
   *declare.json 专用 prompt 构建器（P1 改造：模板先行 + LLM 只填业务片段）
   * LLM 只输出业务字段片段（businessEvents/businessStatuses/cssVariableConfig/businessConfig/panelKey），
   * 不再要求输出完整 declare.json。结构字段由模板骨架保证。
   */
  _buildDeclareChunkPrompt(input, chunk) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildDeclareChunkPrompt(input, chunk, options);
  }

  /**
   *样式文件专用 prompt 构建器
   * 只包含 Less/CSS 规范，去除 Vue 组件/布局/交互等无关约束
   */
  /**
   * 🎨 P1 style 拆分调度器：按 chunk.files 目标分发到单文件专用 builder。
   * - 只含 theme-vars.less → 主题变量 builder（颜色事实聚焦，输入精简）
   * - 只含 common.less    → 业务样式 builder（class 硬约束 + theme-vars 参考上下文）
   * - 双文件（legacy 调用方）→ 保持原全量 prompt 不变，避免回归
   */
  _buildStyleChunkPrompt(input, chunk) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildStyleChunkPrompt(input, chunk, options);
  }

  // ══════════════════════════════════════════════════════════════
  // 🧩 SubcomponentContract：子组件分块事实裁剪（P1 token 瘦身）
  // 原理：子组件只需"自己的"设计事实。以「父组件 usage 处关键词」为匹配键：
  //   标签名 → index.vue 中 <Tag 使用处（属性值/class）→ 关联 Figma 节点名 / elementStyleMap 键 / section 标题
  // 全程 fail-open：匹配不到就保留全量事实，绝不丢视觉事实（保真优先）。
  // ══════════════════════════════════════════════════════════════

  /** 归一化匹配键：小写、去空白 */
  _normKw(s) {
    return microcodePrompt.normKw(s);
  }

  /** 从标签名拆词：PascalCase / kebab-case / camelCase → ['tunnel','traffic','chart']（len≥2） */
  _tagWords(tagName) {
    return microcodePrompt.tagWords(tagName);
  }

  /**
   * 提取子组件匹配关键词：
   * - 标签词（tunnel/traffic/chart…）
   * - usage 处字符串属性值（title="江阴靖江长江隧道" 等 —— 与 Figma 节点名/section 标题同源，最强匹配键）
   * - usage 处 class 名
   */
  _extractSubcomponentKeywords(tagName, indexContent) {
    return microcodePrompt.extractSubcomponentKeywords(tagName, indexContent);
  }

  /**
   * 从 index.vue 提取子组件 usage 摘要（替代全量 index.vue 作 contextFile）：
   * - import 声明行
   * - 每处标签使用 ±12 行（最多 2 处）
   * 找不到使用处 → 返回 null（调用方回退全量 index.vue，fail-open）
   */
  _extractUsageSnippet(tagName, indexContent) {
    return microcodePrompt.extractUsageSnippet(tagName, indexContent);
  }

  /** 名称与关键词组的匹配：CJK 关键词（len≥2）强匹配；英文词 len≥3 弱匹配（双向包含，
   *  但 k.includes(n) 方向要求 n 长度≥2，防止节点名 'g' 被 'bridge' 误吞） */
  _nameMatchesKeywords(name, kws) {
    return microcodePrompt.nameMatchesKeywords(name, kws);
  }

  /**
   * 在 Figma 节点树中挑选与关键词匹配的 section 子树（DFS）。
   * 匹配策略（实测校准：section 节点命名为 slot-<标题>，标题可能只出现在深层 TEXT 标签上）：
   *  (a) slot-* 节点名直接命中关键词 → 返回该 slot（section 级裁剪，最理想）
   *  (b) 深层节点（TEXT 标签等）命中 → 回溯返回其最近 slot-* 祖先（chart 常嵌在其他 slot 内）
   * 守卫：@echarts 占位组 / VECTOR 节点不作直接命中目标（原始矢量数据非语义 section）。
   * 未命中 → null（调用方保留全量树，fail-open）。
   */
  _pickFigmaSubtree(figmaNodeData, kws) {
    return microcodePrompt.pickFigmaSubtree(figmaNodeData, kws);
  }

  /**
   * 构建子组件分块的 scopedInput（只含本子组件相关事实）：
   * - figmaNodeData → 匹配子树（figmaStyleTree 置 null，buildFigmaStage 会对子树重新格式化）
   * - elementStyleMap → 键匹配子集（外加全局键 panel/root/bg/theme/common）；零命中保留全量（fail-open）
   * - layoutStructure.sections → 匹配 section 子集；零命中保留全量（fail-open）
   */
  _buildSubcomponentScopedInput(subPath, indexContent, input) {
    return microcodePrompt.buildSubcomponentScopedInput(
      subPath,
      indexContent,
      input,
      { logger: this.logger },
    );
  }

  /** 样式分块共用：修订模式下的样式相关 critique 段（单文件分块与 legacy 双文件同口径） */
  _buildStyleRevisionSection(input) {
    return microcodePrompt.buildStyleRevisionSection(input);
  }

  /** 样式分块共用：输出格式尾段（文件分隔符 + 禁止生成系统文件） */
  _styleOutputFormatTail(chunk) {
    return microcodePrompt.styleOutputFormatTail(chunk);
  }

  /**
   * 🎨 theme-vars 单文件分块（P1 style 拆分）：
   * 只生成主题变量文件（颜色变量/三主题 mixin/明暗与状态色）。
   * 输入聚焦颜色事实（elementStyleMap 颜色相关子集，通用属性名过滤），不携带 Vue 模板上下文与
   * class 清单 → 输入输出双减半，规避双文件单请求 180s 超时；失败只重试本分块。
   */
  _buildThemeVarsChunkPrompt(input, chunk) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildThemeVarsChunkPrompt(input, chunk, options);
  }

  /**
   * 🎨 common.less 单文件分块（P1 style 拆分）：
   * 只生成业务样式文件（布局/字体/间距/边框/图表容器 + elementStyleMap 直接值）。
   * theme-vars.less 由调用方置于 contextFiles 首位（📎 区块），保证引用的变量名与主题定义一致。
   */
  /**
   * 🎨 Figma 节点颜色/视觉真值表（程序化、紧凑、通用）：
   * 从 Figma 树提取有 fills/strokes/effects/圆角 的节点，每节点一行。
   * 修复历史缺陷：elementStyleMap 只含 vision 报告的布局属性时（颜色缺失），
   * common.less 分块拿不到任何颜色真值 → 卡片背景色全部丢失（白卡）。
   * 本表与 elementStyleMap 互补：前者保颜色/圆角/阴影，后者保 vision 结构属性。
   */
  _extractFigmaColorEssentials(figmaNodeData, maxNodes = 220) {
    return microcodePrompt.extractFigmaColorEssentials(figmaNodeData, maxNodes);
  }

  _buildCommonLessChunkPrompt(input, chunk) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildCommonLessChunkPrompt(input, chunk, options);
  }

  /**
   * legacy：style 双文件分块 prompt（common.less + theme-vars.less 单请求全量规范）。
   * 仅当调用方仍传双文件时使用（P1 拆分后正常路径不再进入）；保留原样避免回归。
   */
  _buildStyleChunkPromptDual(input, chunk) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildStyleChunkPromptDual(input, chunk, options);
  }

  /**
   * 复杂组件：构建 index.vue <template> 段的分块 prompt 中段
   * 只要求 LLM 输出 <template>...</template>，不输出 <script>/<style>
   */
  /**
   * 🛡️ 从 layoutStructure 生成精简「组件结构骨架」摘要，注入分块模板 prompt，
   * 让 LLM 生成 <template> 时知道顶层该怎么排（段落顺序 / 每段的排列方向 / 嵌套关系），
   * 而不是仅凭组件名臆造通用结构（如把"并排双卡 + 左导航右网格"臆造成"上统计 + 下左图右列表"）。
   * 主 prompt 虽含完整 layoutStructure JSON，但分块模式下 LLM 易聚焦末尾的"只生成 template"指令而忽略，
   * 故在此把骨架直接贴近模板生成指令。
   */
  _buildLayoutSkeleton(layoutStructure) {
    return microcodePrompt.buildLayoutSkeleton(layoutStructure);
  }

  _buildTemplateChunkMiddle(chunk, input) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildTemplateChunkMiddle(chunk, input, options);
  }

  /**
   * 🛡️ 上下文裁决约束（P1#1）：把 Context Assembler 的 currentIssues + trustVerdict.restrictions
   * 编译成 prompt 硬约束，让模型遵守裁决结果（此前 generationInput 仅打日志、未实际消费）。
   * - restrictions（restricted 级别）：no-unsupported-decoration / no-style-fallback / resolve-legend-owner
   * - currentIssues.expectedAction：do-not-generate-root-background / ignore-review-as-design-fact /
   *   exclude-fallback-style-facts / choose-dom-or-echarts-owner
   */
  _buildTrustGuidance(generationInput) {
    return microcodePrompt.buildTrustGuidance(generationInput);
  }

  /**
   * 🧩 子组件职责边界表（方案2 治本 · 2026-08-26）。
   * 主组件 index.vue 脚本段（整段 & 三段拆分）注入用：当存在子组件拆分时，明确告知模型
   * 已拆 section 的「状态/图表/事件/生命周期逻辑」必须写在子组件文件内，index.vue 脚本禁止为其
   * 臆造 chartRef / legendState / selectedTime / activeTab 等变量。
   * 根因（mc-max-1787708996212 实锤）：lifecycle/charts 段 prompt 只拿到 template、不知 effectiveSections，
   * 模型臆造子组件图表变量 → 语义校验自由变量拦截 → 任务失败。
   */
  _buildSubComponentResponsibilityTable(input) {
    return microcodePrompt.buildSubComponentResponsibilityTable(input);
  }

  /**
   * 复杂组件：构建 index.vue <script> 段的分块 prompt 中段（回填 template 上下文）
   * 只要求 LLM 输出 <script setup>...</script>，不输出 <template>/<style>
   */
  _buildScriptChunkMiddle(chunk, input) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildScriptChunkMiddle(chunk, input, options);
  }

  /**
   * 复杂组件：将分别生成的 <template> 和 <script> 拼装为完整 index.vue
   * 附加固定 <style> 块，并做容错清理（去分隔符前缀、补缺失闭合标签）
   */
  _assembleIndexVue(templateContent, scriptContent, input) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodeGenerator.assembleIndexVue(
      templateContent,
      scriptContent,
      input,
      options,
    );
  }

  /**
   *#9a: 统一 index.vue 分块生成（complex / medium / simple-risky 共用）。
   * - 默认：template(1) + script(1) 两段
   * - 超大组件（splitDecision.scriptSplit）：template(1) + script状态(1) + script生命周期(1) + script图表(1) 四段
   *   （脚本拆 状态/生命周期/图表 三段，避免单段超 16k 输出上限被 max_tokens 截断且单文件无法再拆分 → fail-closed）
   * 返回拼装后的完整 index.vue 字符串（含固定 <style> 块）。
   */
  async _generateIndexVue(runChunk, input, { splitDecision, allFiles }) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodeGenerator.generateIndexVue(
      runChunk,
      input,
      { splitDecision, allFiles },
      options,
    );
  }

  /**
   * 🛡️ 记录 script 子段降级（供上层标记「组件不完整，可二次生成」，当前至少不 fail-closed）。
   * 挂到 input._degradedScriptParts，避免改动 _generateIndexVue 返回类型影响调用方。
   * @param {object} input 生成上下文
   * @param {'lifecycle'|'charts'} part 降级的子段
   */
  _markDegraded(input, part) {
    return microcodeGenerator.markDegraded(input, part);
  }

  /**
   * 🛡️ 剥离 script 输出中混入的 <template>/<style> 块（确定性防御，不依赖模型遵守 prompt）。
   * 分块生成 <script> 时，LLM 可能因 contextFiles 含 <template> 而误抄入，
   * 拼装后 script 里混入 <template> → vue/compiler-sfc 报 Invalid end tag / Unexpected token。
   * 顺序：先剥完整块（跨行），再剥孤立开/闭标签（避免先剥开标签破坏完整块的闭合匹配）。
   */
  static stripNonScriptBlocks(s) {
    return microcodeGenerator.stripNonScriptBlocks(s);
  }

  /**
   * 🛡️ 剥离 template 输出中混入的 <script>/<style> 块（确定性防御，不依赖模型遵守 prompt）。
   * 分块生成 <template> 时，LLM 可能因 contextFiles 含 <script setup> 而误抄入，
   * 拼装后 template 里混入 <script setup> → vue/compiler-sfc 报 Single file component can contain only one <script setup> element。
   * 顺序：先剥完整块（跨行），再剥孤立开/闭标签（避免先剥开标签破坏完整块的闭合匹配）。
   */
  static stripNonTemplateBlocks(s) {
    return microcodeGenerator.stripNonTemplateBlocks(s);
  }

  /**
   *#9a: 将多个独立的 <script setup> 块（状态段 / 生命周期段 / 图表段）合并为一个完整脚本块。
   * 去除重复的外层标签后拼接内部内容，再统一包裹。可变参数，兼容 2 段（状态/行为）与 3 段（状态/生命周期/图表）。
   */
  _mergeScriptParts(...parts) {
    return microcodeGenerator.mergeScriptParts(...parts);
  }

  /**
   *#9a: 超大组件脚本拆分段（状态 / 生命周期 / 图表）的"任务要求+输出格式"中段。
   * 仅用于 segmentType==='script' 且 chunk.scriptPart 为 'state' | 'lifecycle' | 'charts'。
   * 与 _buildScriptChunkMiddle 不同：明确限制本批只写脚本的一部分，避免单段超长截断。
   */
  _buildScriptChunkMiddlePart(chunk, input) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodePrompt.buildScriptChunkMiddlePart(chunk, input, options);
  }

  /**
   * 🛡️ P0 修复：安全生成 declare.json（带降级兜底）
   * 当 LLM 生成 declare.json 失败时，使用 component-template 的最小可用模板作为兜底
   */
  /**
   * P1 核心：declare.json "模板骨架 + LLM 业务片段 + 深度合并"
   * 1. 生成完整骨架（结构字段 100% 正确）
   * 2. LLM 只输出业务字段片段
   * 3. 深度合并：业务字段覆盖骨架，结构字段以骨架为准
   */
  async _safeGenerateDeclareJson(runChunk, input, chunkD) {
    const options = {
      logger: this.logger,
      componentType: this.componentType,
      constraints: this.constraints,
      normalizeComponentId: this._normalizeComponentId.bind(this),
    };
    return microcodeGenerator.safeGenerateDeclareJson(
      runChunk,
      input,
      chunkD,
      options,
    );
  }

  /**
   * P1 合并逻辑：业务字段片段 → 骨架
   * 规则：
   * - 结构字段（componentId/version/attribute/layoutConfig/themeConfig/dataSources/formSources）：以骨架为准
   * - 业务字段（businessEvents/businessStatuses/cssVariableConfig/businessConfig/panelKey）：LLM 覆盖骨架
   * - componentName：LLM 输出优先（可能更准确）
   */
  _mergeDeclareFragment(skeleton, fragment, componentId) {
    return microcodeGenerator.mergeDeclareFragment(
      skeleton,
      fragment,
      componentId,
    );
  }

  /**
   * P0-C：构建精简重试 Prompt（纯函数，便于单测）。
   * 失败重试不再重发完整 Figma/规范/截图上下文，只携带：
   * - 目标文件清单
   * - 与目标文件直接相关的上下文契约（chunk.contextFiles，各最多 4000 字）
   * - 上一次的错误类型与说明
   * 并保留微码组件最关键约束，避免质量崩塌。
   *
   * @param {object} chunk - 分块描述（含 files / contextFiles）
   * @param {string} lastErrType - 'max_tokens' | 'truncation' | 'semantics' | 其他
   * @param {string} lastErr - 上一次错误描述
   * @returns {string}
   */
  static buildRetryPrompt(chunk, lastErrType, lastErr) {
    return microcodePrompt.buildRetryPrompt(chunk, lastErrType, lastErr);
  }

  /**
   * 单个分块 LLM 调用（含截断重试）。返回 { files, debug }
   */
  async _generateSingleChunk(prompt, chunk, input) {
    const options = {
      logger: this.logger,
      llm: this.llm,
      model: this.model,
      name: this.name,
      liteModel: this.liteModel,
    };
    return microcodeGenerator.generateSingleChunk(
      prompt,
      chunk,
      input,
      options,
    );
  }

  /**
   * 从主组件源码中检测被引用的子组件路径（package/components/*.vue）
   */
  _detectSubComponents(indexVueContent) {
    return microcodeResources.detectSubComponents(indexVueContent);
  }

  /**
   * 解析代码输出
   * 支持两种格式：
   * 1. 新格式（分隔符）：// === filePath ===\n<file content>\n// === filePath ===\n...
   * 2. 旧格式（JSON）：{ "files": { "path": "content", ... } }
   */
  /**
   * 解析代码输出（统一入口 wrapper）
   * 🛡️ #1 解析层治本（2026-08-28，mc-max-1787920512973 实锤）：LLM 分块输出常在
   * 「文件内容结束后」追加 ``` 尾围栏 + Markdown 说明文字，分隔符/JSON 解析只认边界
   * 不截断尾部说明段 → 垃圾随文件内容落盘 → SFC 门禁把说明文字当 template 解析 →
   * "Element is missing end tag"（报错行落在说明文字里）→ 整轮重试注定再失败。
   * 此处对解析结果 files 统一做确定性尾部剥离（stripLlmTailGarbage，结构闭合点后
   * 恒非法），任何解析分支（分隔符 / JSON 代码块 / 恢复兜底）产出的文件都被覆盖。
   */
  parseCodeOutput(rawOutput) {
    return microcodeParser.parseCodeOutput(rawOutput, this.logger);
  }

  /**
   * 🔍 检测文件是否被截断
   * 检查 .vue 文件是否有 </script> 闭合标签，.less/.json 文件是否完整
   * @returns {string[]} issues - 空数组表示无问题，非空表示有截断问题
   */
  _detectFileTruncation(files) {
    return microcodeValidator.detectFileTruncation(files);
  }

  /**
   * 🛡️ P0 修复：解析后强校验，截断文件直接拒绝不写盘
   * 如果存在高危截断问题（如 .vue 缺闭合标签），直接抛出异常让上层重试，
   * 避免坏文件落入临时目录和 workspace，导致前端编译报错。
   */
  _validateFilesIntegrity(parsed) {
    return microcodeValidator.validateFilesIntegrity(parsed, {
      logger: this.logger,
    });
  }

  /**
   *  收集所有已生成的 Vue 文件，作为样式生成的上下文
   * 确保 style-mapper 能看到子组件中使用的所有 class 名
   * @param {Object} allFiles - { path: content }
   * @returns {Array<{path: string, content: string}>}
   */
  _collectVueContextFiles(allFiles) {
    return microcodeValidator.collectVueContextFiles(allFiles);
  }

  /**
   *  程序化提取所有 Vue 模板中的 class 名（非 LLM，确定性操作）
   *
   * 在模板和子组件全部生成完成后、CSS batch 开始前调用，
   * 用正则扫描所有 .vue 文件，提取模板中用到的 class 名，
   * 作为 CSS batch 的硬约束输入。
   *
   * @param {Object} allFiles - { path: content }
   * @param {string} componentName - 组件 ID（如 mc-1785154107233-dd52baa9）
   * @returns {{ fullList: string[], prefix: string }}
   */
  /**
   * 派生 class 前缀用的「语义化短标识」。
   *
   * 设计意图（可读性优化）：
   * 此前 class 前缀直接用组件实例 ID（如 c-mc-max-1786155067847-f0abee76-content），
   * 超长且不可读。本方法生成更短、更具语义的前缀：
   *   优先级：figma 节点名去前缀 → displayName → 实例 ID 末段前 6 位 → 'component'
   *   - 若 figma/displayName 含 ASCII 可读 token（如 env-overview、sales-trend），直接用，语义化最优；
   *   - 纯中文节点名（如「环境监测」）无 ASCII token 时，回落到实例 ID 短串（如 f0abee），
   *     仍远优于完整实例 ID。
   *
   * 约束：仅用于 .c-{prefix} class 前缀（如 .c-vehicle-card），不影响 componentId 寻址（mc-max-... 实例 ID）
   * 与 declare.json 的组件中文显示名。
   *
   * @param {Object} input
   * @returns {string} kebab-case 短前缀（不含 c- 前缀与尾横杠）
   */
  _deriveClassPrefix(input) {
    const src =
      input?.displayName ||
      input?.figmaNodeData?.document?.name ||
      input?.figmaNodeData?.name ||
      input?.nodeName ||
      '';
    const stripped = String(src)
      .replace(/^(mc|cp|mv|page)-(\d{13}-)?/i, '')
      .trim();
    // 提取 ASCII 可读 token（如 env-overview / sales-trend / data-card）
    const asciiTokens = stripped.match(
      /[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*/g,
    );
    if (asciiTokens && asciiTokens.length) {
      const joined = asciiTokens
        .join('-')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (joined) return joined.slice(0, 24);
    }
    // 中文节点名（如「环境监测」）无 ASCII token：尝试语义映射，避免回落无意义的实例 ID 短串
    const zhMapped = this._mapChineseSemanticName(stripped);
    if (zhMapped) return zhMapped;
    // 兜底：实例 ID 末段前 6 位（mc-max-<ts>-<hash> → hash 前 6 位）
    const id = input?.componentId || input?.componentName || '';
    const m = String(id).match(/([a-f0-9]{6,})$/i);
    return m ? m[1].slice(0, 6) : 'component';
  }

  /**
   * 中文组件名 → 语义化 kebab-case class 前缀映射。
   * 🆕 2026-09-04：委托共享词表 zhToSemanticEn（utils/component-naming.js，
   * 长词优先，覆盖 设备/流量/温度/湿度/浓度 等原表缺失词），保证 class 前缀
   * 与 componentId 语义段同源；未命中返回 null（由调用方回落实例 ID）。
   * 注：仅作提示性前缀，不改变 declare.json componentId 寻址。
   */
  _mapChineseSemanticName(name) {
    return zhToSemanticEn(name);
  }

  _extractTemplateClassNames(allFiles, componentName) {
    return microcodeValidator.extractTemplateClassNames(
      allFiles,
      componentName,
      { logger: this.logger },
    );
  }

  /**
   *  从所有 Vue 模板中程序化提取绑定变量（ref/事件/数据源）
   * 用于跨批次一致性校验 — 确保 template/script/style 使用一致的变量名
   * @returns {{ refs: string[], events: string[], dataSources: string[], interpolations: string[] }}
   */
  _extractTemplateBindings(allFiles) {
    return microcodeValidator.extractTemplateBindings(allFiles, {
      logger: this.logger,
    });
  }

  /**
   *  跨文件一致性校验（template ↔ script）
   * 检查 template 中引用的 ref/event/dataSource 是否在 script 中有定义
   */
  _validateCrossFileConsistency(allFiles, bindings) {
    return microcodeValidator.validateCrossFileConsistency(allFiles, bindings, {
      logger: this.logger,
    });
  }

  /**
   *  从 class 名反向查找 elementStyleMap 中的元素 ID
   * 用于自动生成 fallback CSS 规则时的样式值回填
   */
  _reverseMapClassToElement(className, elementStyleMap) {
    return microcodeValidator.reverseMapClassToElement(
      className,
      elementStyleMap,
    );
  }

  /**
   *  从 elementStyleMap 样式对象生成单条 CSS 规则
   *  注意：elementStyleMap 的键已是 CSS 属性名（kebab-case，如 font-size / background-image / border-radius），
   *  因为 _extractElementStyles 已通过 jsonToCss 把 JS 风格键转为 CSS 键。
   *  ✅ 修复（2026-08-26 #266）：旧实现误用 camelCase 键表（fontSize/borderRadius…），
   *     导致 background-image / border-radius / background-color / font-size / align-items 等
   *     绝大多数 per-element 样式被静默丢弃 → 表现为"tab背景/设备小背景/内部布局未识别"。
   *     现直接以 CSS 属性名原样输出，并兼容个别 camelCase 键。
   */
  _generateFallbackCssRule(className, styles) {
    return microcodeValidator.generateFallbackCssRule(className, styles);
  }

  /**
   *  后生成校验 — 扫描所有 Vue 模板中使用的 class 名，核对 common.less 中是否有定义
   * v3.5 增强：支持自动修复 — 缺失的 class 从 elementStyleMap 生成 fallback CSS 规则
   * @param {Object} allFiles - { path: content }
   * @param {string} componentName - 组件 ID
   * @param {string[]} classNamesList - 程序化提取的 class 名列表（v3.5 新增）
   * @param {Object} elementStyleMap - per-element 样式映射（v3.5 新增，用于 fallback 生成）
   * @returns {{ mismatches: Array, fixed: boolean, fallbackCss: string|null }}
   */
  _validateClassNames(
    allFiles,
    componentName,
    classNamesList = null,
    elementStyleMap = null,
  ) {
    return microcodeValidator.validateClassNames(
      allFiles,
      componentName,
      classNamesList,
      elementStyleMap,
      { logger: this.logger },
    );
  }

  /**
   * 解析分隔符格式输出
   * 格式：// === filePath ===\n<file content>\n// === filePath ===\n...
   * @returns {Object|null} { files: { path: content } } 或 null（如果不是分隔符格式）
   */
  /**
   *兜底恢复：从原始文本中按分隔符 / 代码围栏重建 files
   * 应对 LLM 未把代码包进 files 字段、而是直接输出 ```vue / ```less 等围栏的情况
   */
  /**
   *将解析失败的原始 LLM 输出落盘，便于定位真实格式
   */
  /**
   * 从文本中提取有效的 JSON 对象（去除闭合括号后的额外文本）
   */
  /**
   * 验证文件路径是否有效
   * 过滤掉中文描述、纯文本等无效路径
   */
  _isValidFilePath(path) {
    return microcodeWriter.isValidFilePath(path);
  }

  /**
   * 清理文件内容中的markdown标记
   * @param {string} content - 原始内容
   * @param {string} filePath - 文件路径（用于 .vue 文件特殊处理）
   */
  _sanitizeFileContent(content, filePath = '') {
    return microcodeWriter.sanitizeFileContent(content, filePath, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ 判断一段文本是否为「LLM 说明性散文」（Prompt/说明泄漏），而非合法代码。
   *
   * 实锤样本：
   *  - mc-max-1787908432082-62f89b1f：`</style>` 之后的「## 生成说明 / 1. 布局结构 / 7. **style 块**：
   *    `<style lang="less" scoped>`...」，其中反引号包裹的标签片段被 SFC 编译器当成真实开标签 →
   *    `Element is missing end tag` → 整个任务 fail-closed。
   *  - mc-1787904543641-38cfa308：`</template>` 与 `<script setup>` 之间的「⚠️ 关键说明」。
   *
   * 判定采用「命中即散文」的宽松策略：宁可多剥，不可漏网——残留的说明文本一旦被编译器
   * 当成标签/表达式，代价是整个任务失败；而误剥的代价仅是丢掉本就非代码的文本。
   *
   * @param {string} text
   * @returns {boolean}
   */
  _looksLikeLlmProse(text) {
    return microcodeParser.looksLikeLlmProse(text);
  }

  /**
   * 🛡️ 剥离「最后一个块闭合标签之后」的尾部垃圾（P1-4 清洗规则 1）。
   *
   * 这是修复「时机错位」的核心：原逻辑埋在 _sanitizeFileContent 第 4 步，而该函数只在
   * 写盘阶段（writeFiles）调用；判死的语法校验却在生成阶段（generateCode）更早执行，
   * 导致清理永远等不到机会。此处抽成独立方法，交由 CodeFixPipeline 在「模型输出解析后
   * 立刻执行」，早于任何注入/修复/校验。
   *
   * 策略：
   *  - .vue：标准 SFC 中 style/script/template 闭合后不应再有内容，一律截断（安全且确定）。
   *  - 其它：仅在明确检测到 LLM 说明性散文时截断（保守，避免误伤）。
   *
   * @param {string} content
   * @param {string} [filePath]
   * @returns {string}
   */
  _stripTrailingGarbageAfterLastBlock(content, filePath = '') {
    return microcodeParser.stripTrailingGarbageAfterLastBlock(
      content,
      filePath,
      this.logger,
    );
  }

  /**
   * 🛡️ 剥离「块与块之间」的 LLM 说明性散文（P1-4 清洗规则 2）。
   *
   * 针对中间泄漏：如 `</template>` 与 `<script setup>` 之间夹着的「⚠️ 关键说明」。
   * 标准 Vue SFC 编译器会忽略块间文本，但部分 SFC loader / LESS 预处理路径会尝试解析导致报错。
   *
   * 仅处理「最后一个根 </template> 之后、下一个 <script>/<style> 之前」的区间，
   * 且要求该区间确为说明性散文且代码行占比低于 30%，避免误伤合法内容。
   *
   * @param {string} content
   * @param {string} [filePath]
   * @returns {string}
   */
  _stripInterBlockProse(content, filePath = '') {
    return microcodeParser.stripInterBlockProse(content, filePath, this.logger);
  }

  /**
   * 🛡️ 剥离「指向不存在文件的子组件 import」（P1-4 新增规则，2026-08-28）
   *
   * 背景（mc-max-1787912301033-d9cb86a3 实锤）：planner 规划了 3 个 section，但子组件生成
   * 只兑现了 2 个（nav section 的 elementCount=0，根本没内容可生成）。模型却基于「应该有导航
   * 组件」的预期，在 MainContent.vue 初版里脑补出 `import NavTabs from './NavTabs.vue'` 和
   * `import DeviceGrid from './DeviceGrid.vue'`——这两个文件从未存在。
   *
   * 此前靠后处理隐式兜住（失效 import 被剥离），但那是巧合而非契约。本规则把它显式化：
   * 任何 `from './X.vue'` 的相对 import，若目标文件不在文件集中，一律剥离，
   * 并**同步剥离模板中对应的组件标签**——只删 import 不删标签会留下未声明变量，
   * 反而触发「模板引用未声明变量」的语义校验失败。
   *
   * @param {Object<string,string>} allFiles 路径 → 内容
   * @returns {Object<string,string>} 修复后的文件集（未改动时返回原对象引用）
   */
  _pruneDanglingSubComponentImports(allFiles) {
    return microcodeHealer.pruneDanglingSubComponentImports(allFiles, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ P1-4：坏文件隔离降级（2026-08-30）
   *
   * 根因（R9，mc-max-1788067021808-b401bed4 实锤）：5 个子组件全部生成成功，
   * 仅 `FlowPrediction.vue` 一个失败 → 1436 字符主入口 + 4 个健康子组件**全部丢弃**。
   * SFC 语义门禁本意是「防坏文件写盘」，却被当成了「一个坏 → 全盘否决」，
   * 把原本可直接交付的成果清零，属于 fail-closed 误用。
   *
   * 分级策略（与整改方案 P1-4 一致）：
   *   - `package/index.vue` 坏 → **不可降级**（主入口不可用，组件无意义）→ 交回 throw 走重试/失败流程
   *   - `package/components/*.vue` 坏 → **可降级**：剔除 + 摘掉 index.vue 中的 import 与模板引用
   *     + 记入 `input._degradedFiles`（经 generateCode → execute → tasks.service 落库）
   *   - 其它 .vue 坏 → 不可降级（位置未知，保守 fail-closed）
   *
   * 摘引用复用 `_pruneDanglingSubComponentImports`：它按「文件集中不存在」判定悬空 import，
   * 与「先删除坏文件」组合即为精准摘除，无需另写一套模板/import 正则。
   *
   * @param {Object<string,string>} allFiles 路径 → 内容（不修改，返回新对象）
   * @param {Array<{path:string, errors:string[]}>} badVueFiles 编译失败的文件
   * @param {Object} input 生成输入（降级清单写入 input._degradedFiles）
   * @returns {{ok:boolean, reason?:string, files?:Object, removed?:string[], fixes?:string[]}}
   */
  _isolateBadVueFiles(allFiles, badVueFiles, input) {
    return microcodeHealer.isolateBadVueFiles(allFiles, badVueFiles, input, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ 竖排文字兜底：为竖向排版的文本元素补 `writing-mode`（2026-08-28）
   *
   * 背景：Figma 的竖向排版文字（如左侧导航的「监控」「交通诱导」）在数据里没有显式标记——
   * characters 是连续字符串，竖排靠「文本框宽度受限 + 自动换行」实现。模型看不出来，
   * 就会平铺成横排，竖向导航变成横向标签。
   *
   * 本规则是第三层兜底（第1层检测 + 第2层 prompt 告知已在 figma-format.js 完成）：
   * 拿 Figma 真值判定哪些文本是竖排，若产物里对应元素既没有 inline writing-mode、
   * 其 class 也没有在样式中定义 writing-mode，则补 inline style 保证正确渲染。
   *
   * 用 inline style 的原因：竖排是单个元素的强约束，inline 不受 class 复用、
   * 选择器优先级、scoped 失效影响，最不容易被后续改动破坏。
   *
   * @param {Object<string,string>} allFiles 路径 → 内容
   * @param {Object} figmaNodeData Figma 原始数据
   * @returns {Object<string,string>}
   */
  /**
   * S1-P1（确定性兜底，治标安全网）：确保 echarts 坐标轴显示刻度标签。
   * 仅翻转模型显式写出的 `axisLabel/axisTick: { show: false }` → `show: true`；
   * 不臆造 data/min/max（数值刻度须由模型按 Figma 真值填充，主修复在 chart-standards.md 红线）。
   * 单条规则失败由 CodeFixPipeline 捕获跳过，不影响整条流水线。
   * @param {string} content 单文件内容（.vue）
   * @returns {string}
   */
  _injectEchartsAxisTicks(content) {
    return microcodeHealer.injectEchartsAxisTicks(content);
  }

  /**
   * S1-P2（确定性兜底，治标安全网）：剥离 Figma 节点树中不存在的臆造交互控件。
   * 主修复在 ai-generation-constraints.md 7.6（prompt 红线），此为安全网：
   * 1) 移除含占位默认项（使用默认/监测类型/请选择 等）的 <select>/<input>/UI 库下拉；
   * 2) 若 Figma 节点树全无交互控件语义，移除全部生成的 select/input。
   * 不臆造、不误删有 figma 依据的真实控件。
   * @param {string} content 单文件内容（.vue）
   * @param {Object} [ctx] 规则上下文（含 figmaNodeData）
   * @returns {string}
   */
  _stripOrphanControls(content, ctx = {}) {
    return microcodeHealer.stripOrphanControls(content, ctx);
  }

  /**
   * S1-P3（确定性兜底，治本）：多区块垂直布局时，section 根节点误用 `height:100%`
   * 导致每个区块都撑满父容器高度、相互叠加溢出被裁，仅显示第一个区块。
   * 改为 `flex: <px> 1 0; min-height: 0` 让各区块按比例共享父容器高度。
   * 主修复在 ai-generation-constraints.md（子区块高度分配规则）+ layoutMetadata 注入 px 高度（A），
   * 此为安全网：离线可验证、不依赖模型记忆、单条失败由 CodeFixPipeline 捕获跳过。
   * @param {string} content 单文件内容（.vue / .less / .css）
   * @param {Object} [ctx] 规则上下文（含可选 sectionHeights: { [localClass]: px } 加权用）
   * @returns {string}
   */
  _fixSectionHeights(content, ctx = {}) {
    return microcodeResources.fixSectionHeightsForResource(content, ctx, {
      logger: this.logger,
    });
  }

  /**
   * A4→CSS 确定性落点（2026-09-04，实锤 mc-max-1788454423557-25e40782）：
   * 构建 `{ 子组件根class: Figma高度px }` 映射，供 fix-section-heights 规则②
   * 把 section 根的 height:100% / 盲注 flex:1 1 0 改写为规范写法 `flex: <px> 1 0`。
   *
   * 纯逻辑已抽到 utils/figma-section-heights.js（可单测、不拖 langchain 链）；
   * 此处仅做 this 上下文桥接。
   *
   * @param {Object<string,string>} modelFiles 路径 → 内容
   * @param {Object} layoutStructure vision 布局结构（A4 已注入 styles.figmaHeightPx）
   * @param {Object} [params] execute 入参（含 subComponentPlan）
   * @returns {Object<string,number>|null}
   */
  _buildSectionHeightsMap(modelFiles, layoutStructure, params = {}) {
    return buildSectionHeightsMap(modelFiles, layoutStructure, params);
  }

  /** 取 <template> 根元素 class（微码组件根，带前缀 c-{componentId}-） */
  /** 由根 class 推导候选「本地类名」集合（template 根 class 的各 c- 后缀） */
  /** 正则转义（类名用） */
  _reEscape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _ensureVerticalTextWritingMode(allFiles, figmaNodeData) {
    return microcodeHealer.ensureVerticalTextWritingMode(
      allFiles,
      figmaNodeData,
      { logger: this.logger },
    );
  }

  /**
   * 🛡️ 文本兄弟顺序自愈（TEXT-001）：同一父容器 TEXT 子节点的视觉坐标序是唯一事实源，
   * 产物 script v-for 数组 / template 静态兄弟按该序确定性重排。
   * 实现在 microcode/code-healer.fixTextSiblingOrder（事实源：utils/text-order-guard.js）。
   */
  _fixTextSiblingOrder(allFiles, figmaNodeData) {
    return microcodeHealer.fixTextSiblingOrder(allFiles, figmaNodeData, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ 孤儿 JSDoc 行修复（script 级）：修复丢失块注释起始符后残留的 `* xxx` 行与孤立的注释结束符行。
   * 成因：分块拼装 / 重试替换可能吃掉 JSDoc 起始行，剩余 JSDoc 延续行在 JS 里是语法错误
   * （Unexpected token），导致最终 SFC 校验直接拒绝产出整个任务。
   * 策略（带模板字符串守卫，避免误改模板字面量内以 * 开头的正文行）：
   *   - 块注释外的 `* xxx` 行 → 转为 `// xxx` 行注释（内容保留，语法必合法）
   *   - 块注释外的孤立注释结束符行 → 整行丢弃
   */
  _fixOrphanJsdocLines(script) {
    return microcodeHealer.fixOrphanJsdocLines(script);
  }

  /** 🛡️ 对 .vue 文件内所有 <script> 块应用孤儿 JSDoc 行修复（template/style 区不动） */
  _fixOrphanJsdocInVue(content) {
    return microcodeHealer.fixOrphanJsdocInVue(content);
  }

  /**
   * 🛡️ 双 c- 前缀坍缩（.vue）：模型把 declare.componentId（如 c-monitor，已含 c-）当作语义名
   * 再套「.c- 前缀」规则，产出 class="c-c-monitor-root" 双前缀（mc-max-1787565993770 实锤）。
   * 只坍缩 class/:class 属性值内行首位置的双前缀，不碰其它文本（避免误伤 mc-c- 之类子串）。
   */
  _collapseDoubleCPrefixInVue(content) {
    return microcodeHealer.collapseDoubleCPrefixInVue(content);
  }

  /** 🛡️ 双 c- 前缀坍缩（.less/.css）：.c-c-monitor-xxx 选择器 → .c-monitor-xxx */
  _collapseDoubleCPrefixInLess(content) {
    return microcodeHealer.collapseDoubleCPrefixInLess(content);
  }

  /**
   * 提取组件「实例 ID」（如 mc-max-1787742124556-3c15fc26）。
   * 仅当入参匹配实例 ID 模式时才返回，避免把短语义前缀（monitor / env-overview）误判为实例 ID。
   * 同时校验 componentName 与 outputPath 目录名，取第一个命中者。
   * @returns {string} 形如 mc-max-1787742124556-3c15fc26，或空串（非微码实例 ID）
   */
  _getInstanceId(componentName, outputPath) {
    return microcodeHealer.getInstanceId(componentName, outputPath);
  }

  /**
   * 🛡️ Class 命名规范（#75）：剥离「内部 class」上的超长实例 ID 前缀。
   *
   * 设计（与用户要求一致）：
   *  - 实例 ID（如 mc-max-1787742124556-3c15fc26）仅允许出现在「根容器」class 上，形式为 c-mc-max-{id}；
   *  - 任何「带尾横杠」的实例 ID 前缀（c-mc-max-{id}- 或 mc-max-{id}-）一律视为过度前缀并剥离，
   *    保留其后的语义部分（如 c-monitor-title-left）。
   *  - 根容器 c-mc-max-{id}（无尾横杠）不会被误伤。
   * 适用于 .vue 模板 / :class 与 .less/.css 选择器（全局精准替换：该长串不会出现在普通文本中）。
   *
   * @param {string} content
   * @param {string} instanceId 形如 mc-max-1787742124556-3c15fc26
   * @returns {string}
   */
  _stripInstanceIdPrefix(content, instanceId) {
    return microcodeHealer.stripInstanceIdPrefix(content, instanceId);
  }

  /**
   * 🛡️ 引号裸对象 key（2026-08-28 mc-1787904543641-38cfa308 实锤修复）：
   * Vue 模板 :class / :style 绑定里的对象字面量，key 含连字符（如 { c-monitor-active: x }）
   * 是非法 JS 表达式，compiler-sfc 报 "Unexpected token" → Vite 对 index.vue 返回 500 → 预览 Failed to fetch。
   * 此类 key 必须加引号：{ 'c-monitor-active': x }。
   *
   * 仅对 <template> 区域生效（<style> 的 background-color: 等声明会被连字符+冒号误命中，必须排除）。
   * 已加引号的 key 幂等（重新包引号结果相同），不会二次破坏。
   *
   * @param {string} vueContent
   * @returns {string}
   */
  _quoteBareObjectKeysInVue(vueContent) {
    return microcodeHealer.quoteBareObjectKeysInVue(vueContent);
  }

  /**
   * 🛡️ 治本 E（2026-09-10）：v-if 与 v-for 同元素 → 拆为 template v-for + 内层 v-if。
   * 交由 code-fix-rules 的 VUE-VIF-VFOR-001 在 STRUCTURE 阶段调用。
   */
  _stripVIfOnVFor(vueContent) {
    return microcodeHealer.stripVIfOnVFor(vueContent);
  }

  /**
   * 🛡️ 确保 package/index.vue 根元素携带实例 ID 类 c-mc-max-{id}（用户要求的「最外层编码 id」）。
   * 仅对模板内首个元素注入；若已存在则跳过。非侵入式，不改变其它结构。
   *
   * @param {string} vueContent
   * @param {string} rootClass 形如 c-mc-max-1787742124556-3c15fc26
   * @returns {string}
   */
  _ensureRootInstanceId(vueContent, rootClass) {
    return microcodeHealer.ensureRootInstanceId(vueContent, rootClass);
  }

  /**
   *修复 LLM 输出中的虚假换行
   * LLM 在分块生成模式下可能每 ~15-20 字符硬换行，导致标识符/属性/字符串被拆碎
   * 策略：template 区域 direct join + 后处理属性间距；script 区域 direct join + 关键词间距
   */
  _fixSpuriousLineBreaks(content) {
    return microcodeHealer.fixSpuriousLineBreaks(content, {
      logger: this.logger,
    });
  }

  /**
   * 写入文件
   */
  /**
   * 🎨 构建 resources/styles/index.less 入口模板（治本：根作用域默认主题）
   *
   * @param {string} backgroundBrightness 面板明暗（'light' | 'dark'），决定默认主题 mixin
   * @returns {string} index.less 内容
   *
   * 生成结构：
   *   1. @import theme-vars.less        —— 只含 mixin 定义，不产出 CSS
   *   2. 根作用域调用 .common() + .theme-{default}() —— 变量落到根作用域
   *   3. @import (multiple) './common.less' —— 业务 class 输出到**根作用域**（真实 DOM 可命中）
   *   4. （可选）dark.less / light.less 覆盖层，仅在 MC_EMIT_THEME_OVERRIDES=1 时引入
   */
  _buildIndexLessTemplate(backgroundBrightness = 'dark') {
    return microcodeHealer.buildIndexLessTemplate(
      backgroundBrightness,
      EMIT_THEME_OVERRIDES,
    );
  }

  /**
   * 🆕 方案 A（2026-08-31）：预置「最小可编译样式集」骨架（中断/失败任务预览容错）
   *
   * 生产问题：进程在「LLM 分块生成 theme-vars.less / common.less 之前」被杀
   * → 磁盘 resources/styles/ 缺这两个被 index.less @import 的文件 → LESS 编译失败
   * → 中断/失败任务的候选快照不可编译 → 用户在前端看到无意义报错、预览打不开。
   *
   * 治本：在 generateCode 最早期（LLM 样式分块生成前）先落这套最小骨架。
   * - 这 5 个文件与「模型正常路径」最终产物**同口径**（index.less/dark.less/light.less 用同一函数/常量，
   *   theme-vars.less/common.less 用同一兜底模板），因此 LLM 后续生成的同名文件覆盖它时零冲突。
   * - 只在 resources/styles/index.less 尚不存在时写（generateCode 已判定），续跑/正常完成都不重复覆盖。
   * - 即便进程仍在此之后被杀，磁盘已是「index.less @import 的两文件均存在」的自洽可编译集
   *   → phase2 mergeFromDisk 并入候选快照 → 中断/失败任务也能预览（骨架样式而非报错）。
   *
   * @param {('dark'|'light')} backgroundBrightness 背景亮度（决定默认主题 mixin）
   * @param {object} input 组件输入（用于派生真实 class 前缀）
   * @returns {Record<string,string>} 待写盘的样式文件映射
   */
  _buildBootstrapStyleFiles(backgroundBrightness = 'dark', input = {}) {
    const brightness = backgroundBrightness === 'light' ? 'light' : 'dark';
    const safeName = this._deriveClassPrefix(input) || 'unknown';
    const themeVars = `// 主题变量和 mixins（自动生成兜底）
.common() {
  // 跨主题共享变量
  @fontSize: var(--fontSize); // 字体缩放基准令牌（M5-6 硬性要求 var(--fontSize) 映射形态；根容器注入 --fontSize 变量驱动）
}
.theme-dark() {
  // 深色主题变量
}
.theme-light() {
  // 浅色主题变量
}
// 默认主题在 index.less 的根作用域调用（.common() + .theme-dark()/.theme-light()）。
`;
    const commonLess = `// 通用样式（common.less 兜底模板 - 模型输出为空时自动补齐）
// ⚠️ 此为最小兜底内容，建议模型根据设计稿补充具体 class 规则
.c-${safeName}-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
}

.c-${safeName}-content {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
`;
    return {
      'resources/styles/index.less': this._buildIndexLessTemplate(brightness),
      'resources/styles/themes/dark.less': THEME_WRAPPER_TEMPLATES.dark,
      'resources/styles/themes/light.less': THEME_WRAPPER_TEMPLATES.light,
      'resources/styles/themes/theme-vars.less': themeVars,
      'resources/styles/common.less': commonLess,
    };
  }

  /**
   * 🎨 剥离 common.less 的外层主题包裹（LESS-SCOPE-003）
   *
   * 模型偶尔把全部业务 class 包进 `.dark { ... }` / `&.light { ... }`，
   * 编译后变成 `.dark .c-xxx` —— 宿主不注入主题类 → 真实 DOM 0 命中 → 样式全部失效。
   * 这里做确定性剥壳：仅当**整个文件只有一个顶层块**、且该块选择器是主题选择器时才剥。
   * （保守判定，避免误伤正常的单根 class 组织方式以外的写法）
   *
   * @param {string} source common.less 原文
   * @returns {{ changed: boolean, source: string, wrapper: string|null }}
   */
  _unwrapThemeScopedCommonLess(source) {
    return microcodeHealer.unwrapThemeScopedCommonLess(source);
  }

  writeFiles(files, outputPath) {
    // 🛡️ 2026-09-03（管线 A 方案）：子组件类样式收敛进 common.less。
    // 挂在写盘统一出口，覆盖主产物 / 修复产物 / 最终真值三路 files。
    // 目的：预览加载器（vue3-sfc-loader 0.9.5）scoped scopeId 失配 → 子组件
    // <style scoped> 在预览页全失效（icon 按 PNG 原始尺寸、chart 容器 0 高）。
    // common.less 会被 precompileCss 编进 index.css（无 scoped）并由预览页全局注入。
    // 纯函数 + 失败/括号不平衡自动回退，不阻断主流程。
    let targetFiles = files;
    try {
      // 🛡️ P1.5（2026-09-11）类名单一写入者：**先归一，后采集**。
      // 顺序至关重要：归一（布尔方言 is-active → `${元素基类}--active`、修饰符形态对齐）
      // 必须在 classFacts 采集之前完成，否则 facts 与下游链会看到两套类名（新裂缝）。
      const _normalized = normalizeClassNameDialect(targetFiles);
      targetFiles = _normalized.files;
      if (_normalized.changes.length > 0) {
        this.logger.info('🧹 类名方言归一（单一写入者）', {
          count: _normalized.changes.length,
          samples: _normalized.changes.slice(0, 3),
        });
      }
      // 🛡️ P1.1：类事实单一采集——生成期采集一次，收敛器只读消费
      // （修饰符独立成键，杜绝「基名 first-wins」把 --active 规则写成基类）。
      const _facts = collectClassFacts(targetFiles);
      this._classFacts = _facts;
      targetFiles = consolidateSubComponentClasses(targetFiles, {
        logger: this.logger,
        classFacts: _facts,
      });
    } catch (e) {
      // 🛡️ 2026-09-04 C：logger 判空 + 记录调用栈（生产曾现 reading 'log' 且无堆栈无法溯源）
      const errText = `[style-class-consolidator] 收敛失败，按原样写盘: ${e?.message || e}`;
      if (this.logger) {
        this.logger.warn(
          `${errText}${e?.stack ? ` | ${String(e.stack).split('\n').slice(0, 3).join(' ')}` : ''}`,
        );
      } else {
        console.warn(errText);
      }
      targetFiles = files;
    }
    return microcodeWriter.writeFiles(targetFiles, outputPath, {
      logger: this.logger,
      componentType: this.componentType,
    });
  }

  /**
   * 提取 style 内容中被引用（而非声明/混入）的所有 less 变量名。
   * 排除 @media/@import/@keyframes/@mixin/@include 等 at-rule 与混入调用（@name(）。
   * 用于「写盘门禁」兜底：把模型引用但未声明的设计令牌全部识别出来，避免链式/间接 undefined 漏网。
   */
  _extractLessVarReferences(content = '') {
    return microcodeWriter.extractLessVarReferences(content);
  }

  _isLessVarDeclared(content = '', name = '') {
    return microcodeWriter.isLessVarDeclared(content, name);
  }

  /**
   * 检测并去重 Vue SFC 中重复的 <template> 标签。
   * 模型偶尔生成多个 <template>（如"模板1/模板2"双版本、或重复包裹），导致 @vue/compiler-sfc 报
   * "Single file component can contain only one <template> element" → 写盘门禁跳过整个文件。
   *
   * 策略：
   *  - 若检测到 2+ 个 <template>...</template> 顶层块，保留第一个，删除其余；
   *  - 保留的模板若只含 `<div>...</div>` 包裹且其内部内容看起来是"备选方案"（如包含
   *    "方案A/方案B"/"版本1/版本2"等文本），则进一步合并（把后续模板内容追加到首个模板末尾）。
   *  - 返回值：{ source: string, fixed: boolean, removedCount: number }
   */
  _deduplicateTemplateBlocks(source = '') {
    return microcodeWriter.deduplicateTemplateBlocks(source);
  }

  /**
   * 从写盘门禁的 less 编译错误中提取「未定义的 mixin」名（.X is undefined）。
   * 模型常直接调用 .common()/.theme-dark()/.theme-light() 等 mixin，但这些定义在 theme-vars.less
   * 里，写盘门禁因相对 @import 被 strip 而无法解析。与变量兜底同理，注入空 mixin `.X() {}` 使内存编译通过；
   * 真实内容由落盘后的目录门禁（绝对路径 @import 链）完整编译校验。
   * 正则仅匹配「.name is undefined」这种 mixin 报错，不会误伤「variable @name is undefined」（@ 前缀）。
   */
  _extractUndefinedLessMixins(errors = []) {
    return microcodeWriter.extractUndefinedLessMixins(errors);
  }

  _safeLessVarValue(name = '', ctx = {}) {
    return microcodeWriter.safeLessVarValue(name, ctx);
  }

  /**
   * 验证和修复生成的文件（防止反复出现相同错误）
   * @param {Object} files - 生成的文件对象 {path: content}
   * @param {string} componentName - 组件名称
   * @param {string} outputPath - 输出路径
   * @returns {Object} { fixedFiles: {...}, fixes: [...] }
   */
  /**
   *#2: declare.json 顶层 schema 默认值归一化
   * 当 LLM 漏写顶层字段时，补齐带默认值的完整结构，避免运行时/Playground 读空报错。
   * 保留 LLM 已生成的有效内容，只补缺失项，不覆盖已有值。
   * @param {Object} declare - 解析后的 declare.json 对象
   * @param {Object} opts
   * @param {string} [opts.componentId] - 归一化后的组件 ID（kebab）
   * @param {string} [opts.componentName] - 组件 ID 原始名（fallback）
   * @param {string} [opts.displayName] - 中文显示名（用于 componentName 兜底）
   * @returns {{ declare: Object, changed: boolean }}
   */
  normalizeDeclareJson(declare, opts = {}) {
    const { componentId, componentName, displayName, nodeData } = opts;
    const d = declare && typeof declare === 'object' ? declare : {};
    let changed = false;

    // size — 从 Figma 节点原始尺寸兜底，确保预览页能按实际宽高渲染
    if (!d.size || !d.size.width || !d.size.height) {
      if (
        nodeData?.absoluteBoundingBox?.width &&
        nodeData?.absoluteBoundingBox?.height
      ) {
        d.size = {
          width: Math.round(nodeData.absoluteBoundingBox.width),
          height: Math.round(nodeData.absoluteBoundingBox.height),
        };
        changed = true;
      }
    }

    const stripPrefix = (n) =>
      String(n || '')
        .replace(/^(mc|cp|mv|page)-(\d{13}-)?/i, '')
        .trim();
    const hasIdPrefix = (n) =>
      /^(mc-|cp-|mv-|page-)/i.test(n) || /^mc-\d{13}-[a-f0-9]+$/i.test(n);

    // componentId 归一为 kebab + 强制 c- 前缀（P2：防无前缀 ID 被 schema 校验打 BLOCK）
    // 🆕 2026-09-04 唯一化（用户规则）：componentId = c-<语义段>-<sessionId 尾 8 hex>
    //   （如 c-monitor-43e7fe45）。语义段优先复用 LLM englishId 可读部分（c-monitor → monitor，
    //   保持 class 前缀/事件前缀稳定）；LLM 给的是编码形态/缺省时从 displayName 中文语义派生。
    //   CSS class 前缀与 onload 事件必须用 classPrefixOf(componentId) 剥离尾段（见下），
    //   否则 LLM 生成的 .c-monitor-root 会与 c-monitor-43e7fe45 前缀失配被 CODE-003 二次叠加。
    const _sessionId =
      String(opts.sessionId || (this && this._engineerSessionId) || '').trim();
    const _llmComponentId = String(d.componentId || '').trim();
    // 🛡️ Loop 0.B：检查点优先 —— 内存 Map → declare.meta.checkpoint → 才新建。
    const _checkpointId = resolveComponentIdCheckpoint({
      sessionId: _sessionId,
      memoryId: _componentIdCheckpoints.get(_sessionId) || '',
      declareCheckpointId: d?.meta?.checkpoint?.componentId || '',
    });
    // 重建留痕标志：函数级作用域（供末尾 4130 段使用）。绝不能放 else 块内 let ——
    // 命中检查点（走 if 分支、跳过 else）时块内 let 未执行 → 末尾引用抛 ReferenceError
    // （2026-09-09 实锤：告警 "无法解析 declare.json 进行后校验 {_forceChanged is not defined}"）。
    let _forceChanged = false;
    if (_checkpointId && _sessionId) {
      // 🛡️ 刀 9（2026-09-13）：检查点 id 也必须过「可剥离闸门」。
      // 历史脏检查点（四段 c-device-monitor-00g6b7vh-075b13a4）若原样沿用，
      // classPrefixOf 剥不掉随机中段 → CODE-003 双前缀会随重跑复发。
      // 净化后若与检查点不一致 → 判定检查点为脏值，回写内存检查点自愈。
      const _cleanCkptId = sanitizeComponentId(_checkpointId, {
        sessionId: _sessionId,
        fallbackToken: componentName || displayName || '',
      });
      d.componentId = _cleanCkptId;
      changed = true;
      if (_cleanCkptId !== _checkpointId) {
        _forceChanged = true;
        _componentIdCheckpoints.set(_sessionId, _cleanCkptId);
      }
      // 检查点已命中 → 跳过所有 normalization 逻辑
      const _ckptPrefix = classPrefixOf(_cleanCkptId) || 'c-component';
      // 跳转到 class 前缀处理之后（line ~3874 的逻辑将被检查点短路后的代码取用）
    } else {
    // （非检查点分支）
    if (_sessionId && _llmComponentId) {
      // 🛡️ 刀 9（2026-09-13·修正）：先经「可剥离闸门」判定，而非拿原始 id 的尾 hex 比对。
      // 原实现只看 `-([0-9a-f]{8})$ === sessionId 尾` 就判 _alreadyUnique=true 直接绕过修复，
      // 但四段脏 id `c-env-monitor-6ajwy8yn-b81edc3b` 的尾 b81edc3b 恰好等于 session 尾，
      // 于是随机中段 6ajwy8yn 被原样保留 → classPrefixOf 剥离失败 → CODE-003 双前缀复发。
      // 新判据：对 id 走 sanitizeComponentId 收敛，收敛结果 === 原 id 才算「已规范」。
      const _sanitized = sanitizeComponentId(_llmComponentId, {
        sessionId: _sessionId,
        fallbackToken: componentName || displayName || '',
      });
      const _alreadyUnique = _sanitized === _llmComponentId;
      if (!_alreadyUnique) {
        d.componentId = _sanitized;
        changed = true;
        _forceChanged = true;
      }
    } else if (_sessionId) {
    } else if (_sessionId) {
      // LLM 未产出 componentId → 从 displayName 语义派生唯一 id
      const _seg = semanticTokenFrom({
        displayName: displayName || '',
        zhName: displayName || '',
        figmaName: nodeData?.name || '',
        fallbackToken: componentName || '',
      });
      d.componentId = buildComponentId(_seg || 'component', _sessionId);
      changed = true;
      _forceChanged = true;
    } else {
      // 兼容路径（无 sessionId 的兜底/模板调用）：保留旧归一行为
      const normId = this._normalizeComponentId(
        componentId || componentName || 'unknown-component',
      );
      if (!d.componentId) {
        d.componentId = normId;
        changed = true;
      } else if (!/^(c|cp|mv|page)-/.test(d.componentId)) {
        d.componentId = `c-${String(d.componentId).replace(/^[-]+/, '')}`;
        changed = true;
      }
    } // end of inner else (compat path)
    } // end of outer else (non-checkpoint branch)
    // 🆕 class/事件前缀解耦：所有以 componentId 派生的「短前缀」统一剥离尾 8 hex
    const _prefixId = classPrefixOf(d.componentId) || 'c-component';

    // 🛡️ P0（2026-09-08）：归一化后的 componentId 持久化到检查点，跨重试轮次共享。
    if (_sessionId && d.componentId) {
      if (!_componentIdCheckpoints.has(_sessionId)) {
        _componentIdCheckpoints.set(_sessionId, d.componentId);
      }
      applyDeclareCheckpoint(d, {
        sessionId: _sessionId,
        componentId: d.componentId,
        classPrefix: _prefixId,
      });
    }

    // componentName 兜底中文显示名（仅当缺失时填，避免覆盖 LLM 已给的有效中文名）
    if (!d.componentName) {
      const hint = displayName ? stripPrefix(displayName) : '';
      d.componentName = hint || d.componentId || componentName || '未知组件';
      changed = true;
    }

    // version
    if (!d.version) {
      d.version = 'v1.0.0';
      changed = true;
    }

    // attribute
    // 🛡️ P1-2 · aspectRatio 事实源：Figma bbox 宽高比 > 默认 16:9
    // 避免默认 16:9 与 Figma 实际比例（如 1:1、4:3）不符导致预览拉伸
    const figmaAspectRatio = nodeData?.absoluteBoundingBox?.width && nodeData?.absoluteBoundingBox?.height
      ? [Math.round(nodeData.absoluteBoundingBox.width), Math.round(nodeData.absoluteBoundingBox.height)]
      : null;
    if (!d.attribute || typeof d.attribute !== 'object') {
      d.attribute = {
        imgUrl: null,
        aspectRatio: figmaAspectRatio || [16, 9],
        title: d.componentName,
        description: d.componentName,
      };
      changed = true;
    } else {
      if (!d.attribute.aspectRatio || (figmaAspectRatio && JSON.stringify(d.attribute.aspectRatio) === JSON.stringify([16, 9]))) {
        // 缺失 或 仍是默认 16:9 → 用 Figma bbox 覆盖
        d.attribute.aspectRatio = figmaAspectRatio || [16, 9];
        changed = true;
      }
      if (!d.attribute.title) {
        d.attribute.title = d.componentName;
        changed = true;
      }
      if (!d.attribute.description) {
        d.attribute.description = d.componentName;
        changed = true;
      }
    }

    // businessEvents：确保为 object（规范：{[eventId]: {eventId, eventName, eventDataSchema}}）
    // LLM 常输出 array 形式 → 必须转换为 object（以 eventId 为 key），违反 declare-json.md
    // 🆕 onload 事件前缀用剥离尾段短前缀（c-monitor-43e7fe45 → c-monitor），
    // 与代码 publishEvent('c-monitor-onload') 对齐；完整 componentId 仅作寻址。
    const onloadId = `${_prefixId}-onload`;
    if (Array.isArray(d.businessEvents)) {
      const obj = {};
      for (const evt of d.businessEvents) {
        if (evt && typeof evt === 'object' && evt.eventId)
          obj[evt.eventId] = evt;
      }
      d.businessEvents = obj;
      changed = true;
    }
    if (!d.businessEvents || typeof d.businessEvents !== 'object') {
      d.businessEvents = {};
      changed = true;
    }
    // 🛡️ onload 事件归一：LLM 可能用无前缀的 eventId（如 "e2elabv2-onload"），
    // 与规范前缀 onloadId（"c-e2elabv2-onload"）重复，统一收拢到规范槽，避免出现两个 onload。
    // 🛡️ 刀 9（2026-09-13·修正）：折叠**全部**非规范 *-onload（原实现用 find() 只处理第一个）。
    // 双轨（c-device-monitor-00g6b7vh-onload + device-monitor-onload）折叠后曾仍残留一条，
    // 与模板 publishEvent 单轨不符，形成 CODE-024 类方言残留。改为 filter 全量折叠。
    const strayOnloadKeys = Object.keys(d.businessEvents).filter(
      (k) => /-onload$/.test(k) && k !== onloadId,
    );
    if (strayOnloadKeys.length > 0) {
      // 优先保留规范槽已有事件；否则取首个非规范事件的业务数据（保留 eventDataSchema 等）
      const _canonical = d.businessEvents[onloadId];
      let _folded =
        _canonical && typeof _canonical === 'object' ? _canonical : null;
      for (const k of strayOnloadKeys) {
        const evt = d.businessEvents[k];
        if (!_folded && evt && typeof evt === 'object') _folded = evt;
        delete d.businessEvents[k];
      }
      d.businessEvents[onloadId] = _folded || {
        eventId: onloadId,
        eventName: '组件加载完成',
        eventDataSchema: this._defaultEventSchema(d.componentId),
      };
      d.businessEvents[onloadId].eventId = onloadId;
      changed = true;
    }
    if (!d.businessEvents[onloadId]) {
      d.businessEvents[onloadId] = {
        eventId: onloadId,
        eventName: '组件加载完成',
        eventDataSchema: this._defaultEventSchema(d.componentId),
      };
      changed = true;
    }
    for (const evt of Object.values(d.businessEvents)) {
      if (!evt || typeof evt !== 'object') continue;
      if (
        !evt.eventDataSchema ||
        (typeof evt.eventDataSchema === 'object' &&
          Object.keys(evt.eventDataSchema).length === 0)
      ) {
        evt.eventDataSchema = this._defaultEventSchema(d.componentId);
        changed = true;
      }
    }

    // 其余顶层字段默认值（与 component-template 兜底结构对齐）
    if (!d.businessStatuses || typeof d.businessStatuses !== 'object') {
      d.businessStatuses = {};
      changed = true;
    }
    if (d.dataSources === undefined) {
      d.dataSources = null;
      changed = true;
    }
    if (d.formSources === undefined) {
      d.formSources = null;
      changed = true;
    }

    // layoutConfig/themeConfig：规范结构 = { default: string, list: Array<{name, key}> }
    // LLM 可能输出数组或缺字段，需校验并兜底
    if (
      !d.layoutConfig ||
      typeof d.layoutConfig !== 'object' ||
      Array.isArray(d.layoutConfig)
    ) {
      d.layoutConfig = {
        default: 'one',
        list: [{ name: '默认布局', key: 'one', previewName: 'mc-preview.png' }],
      };
      changed = true;
    } else {
      if (
        !d.layoutConfig.default ||
        typeof d.layoutConfig.default !== 'string'
      ) {
        d.layoutConfig.default = d.layoutConfig.list?.[0]?.key || 'one';
        changed = true;
      }
      if (
        !Array.isArray(d.layoutConfig.list) ||
        d.layoutConfig.list.length === 0
      ) {
        d.layoutConfig.list = [
          {
            name: '默认布局',
            key: d.layoutConfig.default,
            previewName: 'mc-preview.png',
          },
        ];
        changed = true;
      }
    }
    if (
      !d.themeConfig ||
      typeof d.themeConfig !== 'object' ||
      Array.isArray(d.themeConfig)
    ) {
      d.themeConfig = {
        default: opts.styleTokens?.defaultTheme || 'dark',
        list: [
          { name: '浅色主题', key: 'light' },
          { name: '深色主题', key: 'dark' },
        ],
      };
      changed = true;
    } else {
      if (!d.themeConfig.default || typeof d.themeConfig.default !== 'string') {
        d.themeConfig.default =
          d.themeConfig.list?.[0]?.key ||
          opts.styleTokens?.defaultTheme ||
          'dark';
        changed = true;
      }
      if (
        !Array.isArray(d.themeConfig.list) ||
        d.themeConfig.list.length === 0
      ) {
        d.themeConfig.list = [
          { name: '浅色主题', key: 'light' },
          { name: '深色主题', key: 'dark' },
        ];
        changed = true;
      }
    }
    if (!Array.isArray(d.cssVariableConfig)) {
      d.cssVariableConfig = [];
      changed = true;
    }
    // 🎨 cssVariableConfig 与设计变量轨双向声明（M3-7/M3-8，2026-09-03 契约接入）：
    // styleTokens.designVars（原 UI 深色时 Figma 深色真值自定义变量，已渲染进 css-vars.js
    // dark 槽位）必须同步在此声明（数组格式 [{name,key,type}]，mc-check M3-6），缺一即 error。
    const designVars = Array.isArray(opts.styleTokens?.designVars)
      ? opts.styleTokens.designVars
      : [];
    if (designVars.length > 0) {
      const declaredKeys = new Set(
        d.cssVariableConfig.map((it) => it && it.key),
      );
      for (const v of designVars) {
        if (!v || !v.key || declaredKeys.has(v.key)) continue;
        d.cssVariableConfig.push({
          name: v.name || v.key,
          key: v.key,
          type: v.type || 'color',
        });
        changed = true;
      }
    }

    // 🆕 componentId 被确定性重建（c-<语义>-<sessionId 尾 8hex>）时留痕，便于重跑/重校验观测
    if (_forceChanged) {
      try {
        this.logger?.info?.(
          'declare.componentId 已重建为确定性格式 c-<语义>-<sessionId 尾8hex>',
          { componentId: d.componentId, sessionId: _sessionId },
        );
      } catch {
        /* 日志失败不阻断 */
      }
    }

    return { declare: d, changed };
  }

  /**
   * 归一化组件 ID：kebab-case 清洗 + 强制 "c-" 前缀（declare-json.md 规范）
   * 输入 "E2eModalP2" → "c-e2emodalp2"；已带 c-/cp-/mv-/page- 前缀则保留
   */
  _normalizeComponentId(name = '') {
    const cleaned = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!cleaned) return 'c-unknown-component';
    return /^(c|cp|mv|page)-/.test(cleaned) ? cleaned : `c-${cleaned}`;
  }

  /** 默认 eventDataSchema（带 key/name/type/required 元数据，与 component-template 结构一致） */
  _defaultEventSchema(componentId) {
    return {
      componentId: {
        key: 'componentId',
        name: '组件ID',
        type: 'string',
        required: true,
      },
      timestamp: {
        key: 'timestamp',
        name: '时间戳',
        type: 'number',
        required: true,
      },
    };
  }

  /**
   * 🔥 从 Figma 节点树中提取 panel-header 的中文标题
   * 用于 declare.json componentName 缺失中文时的兜底修复
   *
   * @param {Object} nodeData - Figma 节点树（cp-xxx 根节点的 figmaNodeData）
   * @returns {string|null} 提取到的中文标题，或 null
   */
  _extractHeaderTitle(nodeData) {
    if (!nodeData) return null;

    const findNode = (node, pattern) => {
      if (!node) return null;
      if (node.name && pattern.test(node.name)) return node;
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findNode(child, pattern);
          if (found) return found;
        }
      }
      return null;
    };

    const findText = (node) => {
      if (!node) return null;
      if (node.type === 'TEXT' && node.characters && node.characters.trim())
        return node;
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findText(child);
          if (found) return found;
        }
      }
      return null;
    };

    const extractChinese = (text) => {
      if (!text || typeof text !== 'string') return null;
      const trimmed = text.trim();
      if (!trimmed || /^Frame\s*\d+$/i.test(trimmed)) return null;
      const match = trimmed.match(
        /[\u4e00-\u9fff\u3400-\u4dbf][\u4e00-\u9fff\u3400-\u4dbf\s\d]*/,
      );
      return match ? match[0].trim() : null;
    };

    // 在 cp-xxx 节点树中查找 panel-header → 提取标题
    const headerNode = findNode(nodeData, /^panel[-_]?header$/i);
    if (headerNode) {
      const textNode = findText(headerNode);
      if (textNode) {
        const title = extractChinese(textNode.characters);
        if (title) return title;
      }
    }

    // 兜底：在整个节点树中查找第一个中文 TEXT 节点
    const anyTextNode = findText(nodeData);
    if (anyTextNode) {
      const title = extractChinese(anyTextNode.characters);
      if (title) return title;
    }

    return null;
  }

  async validateAndFixGeneratedFiles(
    files,
    componentName,
    outputPath,
    backgroundBrightness = 'dark',
    displayName = null,
    nodeData = null,
  ) {
    return microcodeValidator.validateAndFixGeneratedFiles(
      files,
      componentName,
      outputPath,
      backgroundBrightness,
      displayName,
      nodeData,
      {
        logger: this.logger,
        componentType: this.componentType,
        getInstanceId: this._getInstanceId.bind(this),
        stripInstanceIdPrefix: this._stripInstanceIdPrefix.bind(this),
        ensureRootInstanceId: this._ensureRootInstanceId.bind(this),
        quoteBareObjectKeysInVue: this._quoteBareObjectKeysInVue.bind(this),
        normalizeDeclareJson: this.normalizeDeclareJson.bind(this),
        extractHeaderTitle: this._extractHeaderTitle.bind(this),
        buildIndexLessTemplate: (b) => this._buildIndexLessTemplate(b),
        unwrapThemeScopedCommonLess:
          this._unwrapThemeScopedCommonLess.bind(this),
        ensureIndexVueStyleImport: this._ensureIndexVueStyleImport.bind(this),
        rewriteClickableIconDivsToButtons:
          this._rewriteClickableIconDivsToButtons.bind(this),
        stripBasePanelShellLeak: this._stripBasePanelShellLeak.bind(this),
        deriveClassPrefix: this._deriveClassPrefix.bind(this),
        themeWrapperTemplates: THEME_WRAPPER_TEMPLATES,
        emitThemeOverrides: EMIT_THEME_OVERRIDES,
        styleTokens: this._lastStyleTokens || null,
      },
    );
  }

  _ensureIndexVueStyleImport(content) {
    if (!content || typeof content !== 'string') return content;
    if (
      content.includes("@import '../resources/styles/index.less';") ||
      content.includes('@import "../resources/styles/index.less";')
    ) {
      return content;
    }

    if (/<style[^>]*>[\s\S]*?<\/style>/i.test(content)) {
      return content.replace(
        /<style([^>]*)>([\s\S]*?)<\/style>/i,
        (match, attrs = '', body = '') => {
          const normalizedBody = body.trim();
          const importLine = "@import '../resources/styles/index.less';";
          const nextBody = normalizedBody
            ? `${importLine}\n${normalizedBody}`
            : importLine;
          return `<style${attrs}>\n${nextBody}\n</style>`;
        },
      );
    }

    return (
      content +
      `\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>`
    );
  }

  // 🔧 CODE-002 修复：子组件（package/components/*.vue）若有 <style> 块但缺 @import index.less，
  // 自动补齐（相对路径多一级 ../，即 ../../resources/styles/index.less）。
  // 此前只有主组件有 _ensureIndexVueStyleImport，子组件缺 @import 会被 L0-B CODE-002 判 BLOCK → fail-closed。
  // 🔧 CODE-001 修复：确保子组件 <style> 有 lang="less" scoped 属性
  _ensureSubComponentStyleAttrs(content) {
    if (!content || typeof content !== 'string') return content;
    if (!/<style[^>]*>[\s\S]*?<\/style>/i.test(content)) {
      return content; // 无 style 块不处理
    }

    return content.replace(
      /<style([^>]*)>([\s\S]*?)<\/style>/i,
      (match, attrs = '', body = '') => {
        const hasLangLess = /lang\s*=\s*["']less["']/i.test(attrs);
        const hasScoped = /\bscoped\b/i.test(attrs);

        let newAttrs = attrs;
        if (!hasLangLess) {
          newAttrs = (newAttrs.trim() + ' lang="less"').trim();
        }
        if (!hasScoped) {
          newAttrs = (newAttrs.trim() + ' scoped').trim();
        }

        return `<style ${newAttrs.trim()}>${body}</style>`;
      },
    );
  }

  _ensureSubComponentStyleImport(content) {
    if (!content || typeof content !== 'string') return content;
    const importPath = '../../resources/styles/index.less';
    if (
      content.includes(`@import '${importPath}';`) ||
      content.includes(`@import "${importPath}";`)
    ) {
      return content;
    }

    // 无 <style> 块的子组件：style 可选，不强制补（CODE-002 只针对「有 style 块但缺 @import」）
    if (!/<style[^>]*>[\s\S]*?<\/style>/i.test(content)) {
      return content;
    }

    // 有 <style> 块但缺 @import：在 style 块首行补 import
    return content.replace(
      /<style([^>]*)>([\s\S]*?)<\/style>/i,
      (match, attrs = '', body = '') => {
        const normalizedBody = body.trim();
        const importLine = `@import '${importPath}';`;
        const nextBody = normalizedBody
          ? `${importLine}\n${normalizedBody}`
          : importLine;
        return `<style${attrs}>\n${nextBody}\n</style>`;
      },
    );
  }

  // 🔧 子组件 import 自动补齐：复杂组件分块生成时，script 段常漏 import template 引用的
  // <PascalCase> 子组件，触发语义门禁「模板引用了 script 中未声明的变量/组件」→ 重试耗尽 fail-closed
  // （如 mc-max-1786946805584 漏 import DeviceStats/DeviceCharts/DeviceAlarms）。
  // 此处拼装后兜底：检测 template 里的 PascalCase 标签，若 script 未 import，自动补
  // `import Xxx from './components/Xxx.vue'`（<script setup> 下 import 即注册，无需 components 对象）。

  // ══════════════════════════════════════════════════════════════
  // 🛡️ P0-1 区域/状态背景兜底自动挂载（2026-08-27）
  // 历史根因：模型高频漏接 mountTarget/bgRole 有值的区域背景与状态背景，导致 RES-UNUSED 告警。
  // 当前状态：RES-UNUSED 已降级为 WARN（#278），但自动挂载仍有价值——确保资源真正被使用。
  // 策略：门禁前把「未被引用的 bg」按 mountTarget/名称关键词匹配模板容器（含子组件），
  //       注入 :style backgroundImage；匹配不到时兜底挂模板根元素（与 body 背景图补全同思路）。
  // 回滚：env BG_AUTO_MOUNT=false 关闭。
  // ══════════════════════════════════════════════════════════════

  /** 提取挂载关键词：mountTarget / 资源名 / targetDomHint / figmaPath 倒数第二段，词长≥3，剔除通用词 */
  _extractMountKeywords(mapping) {
    return microcodeResources.extractMountKeywords(mapping);
  }

  /** 在 vue 文件中找第一个 class 含关键词的开标签，返回完整开标签字符串 */
  _findTagByClassKeyword(content, kw) {
    return microcodeResources.findTagByClassKeyword(content, kw);
  }

  /**
   * 找模板根元素（<template> 后第一个开标签）。
   *
   * 🛡️ P0-5（2026-08-29）：根元素是宿主外壳（base-panel / mc-panel）时返回 null。
   * 外壳不是组件自己的根容器，往它上面兜底挂背景会被 100% 100% 拉伸成整面板大背景
   * （mc-max-1788056145870-6e65dc88 实锤）。调用方拿到 null 即跳过挂载。
   * 内部用法如需「无论是不是外壳都要拿到根标签」，可传 { allowHostShell: true }。
   */
  _findTemplateRootTag(content, options = {}) {
    return microcodeResources.findTemplateRootTag(content, options);
  }

  /**
   * 🛡️ P0-1 增强：提取 index.vue 模板里「区域级容器」候选（按出现顺序）。
   *
   * 用途：当 styleEvidence 确认根容器无背景（background.allowed===false）时，区域背景
   * 不能挂根容器（会触发 CODE-014 根容器臆造 BLOCK），必须挂到对应 section 容器。
   * 本方法定位「内容根」（base-panel 外壳下的真实 <div class=root> 或模板根元素）的
   * 直接子容器（通常是各 <section> / 区域 div），供区域背景轮流挂载。
   *
   * @returns {string[]} 开标签字符串数组（直接子容器，已过滤插槽 <template>）
   */
  _findRegionContainerCandidates(content) {
    return microcodeResources.findRegionContainerCandidates(content);
  }

  /** 从区域容器候选里挑第一个尚未被占用的，挂一个背景（保证不同区域背景挂不同容器，避免叠加） */
  _pickNextRegionContainer(content, usedSet) {
    return microcodeResources.pickNextRegionContainer(content, usedSet);
  }

  /**
   * 🛡️ P1-4（2026-08-30）：计算背景样式四件套（size/position/repeat），
   * 供 _injectBgStyleBinding 与 N3 强制挂载统一调用。
   *
   * 背景 size 一律用 figmaBox 实际尺寸（如 295×27 → '295px 27px'），
   * 禁止硬编码 '100% 100%'（会把小装饰条拉伸成整面板大背景，mc-max-1788056145870 实锤）。
   * position 用相对父容器偏移；repeat 按面积比判断（小纹理 repeat / 整块 no-repeat）。
   *
   * 🛡️ P2-1（2026-08-30）增强：
   *   ① **size 推断**：无 `scaleMode` 真值时（VECTOR 渐变全链路从未提取该字段），
   *      按 figmaBox 覆盖 parentBox 的面积比判定：≥0.9 → `100% 100%`（响应式铺满），
   *      否则继续用 figmaBox 实际尺寸。
   *   ② **repeat 双重收紧**：`fw < pw*0.5 && fh < ph*0.5` **且** 面积比 `< 0.25`（原 0.5）。
   *      只收面积阈值救不了 bg-tab-active-7891（覆盖率 0.206 仍 < 0.25），
   *      叠加维度约束后 `fh/ph = 21/27 = 0.778 > 0.5` → 正确短路为 no-repeat。
   *   ③ **cover 时 position 归零**：size 已铺满再带偏移会露白边。
   *
   * @param {Object} mapping - resourceDomMapping 条目（含 figmaBox / visualMeta / parentBox）
   * @returns {{ size: string, position: string, repeat: string, cover: boolean, coverage: number|null }}
   */
  _buildBackgroundStyle(mapping = {}) {
    // 实现在 utils/background-size-inference.js（单一事实源，可单测）
    return inferBackgroundStyle(mapping);
  }

  /**
   * 🛡️ P1-3（2026-08-30）：统一挂载点评分。
   *
   * 背景：R8（组件一 mc-max-1788065970150 日志实锤）——05:03:35 去重删掉 tabs-section 上的
   * 重复 bg2，05:04:50 兜底又按关键词子串匹配挂回去，两个环节自相打架。
   * 根因：去重按「关键词命中数」评分、兜底按「关键词顺序 + 文件顺序」选型，两套逻辑不一致。
   *
   * 本函数是**唯一**的挂载点评分真相源，去重（`_dedupeBgMultiRefs`）与兜底
   * （`_autoMountUnusedBackgrounds`）共用，消除打架。
   *
   * 三项信号：
   *   ① 语义距离（权重 3/2/1）：候选 class token 与 资源名 / mountTarget / figmaPath 上下文的覆盖率
   *   ② 尺寸契合：`figmaBox 面积 / parentBox 面积` —— 铺满父框（≥0.9）的整块背景应挂在
   *      更深的专用容器上；局部小图则相反
   *   ③ 层级深度：模板嵌套深度，配合 ② 决定加减分
   *
   * 宿主外壳（base-panel / mc-panel）直接判负无穷（P0-5：禁止往宿主外壳挂业务背景）。
   *
   * @param {Object} mapping resourceDomMapping 条目
   * @param {{cls?:string, depth?:number, isHostShell?:boolean}} cand 挂载候选
   * @param {{componentPrefix?:string}} [opts]
   * @returns {number} 分数（越大越优）；负无穷 = 不可挂载
   */
  _scoreMountTarget(mapping, cand, opts = {}) {
    // 实现在 utils/mount-target-scoring.js（单一事实源，可单测）
    return scoreMountTarget(mapping, cand, opts);
  }

  /**
   * 🛡️ P1-3：收集模板里全部可作为挂载点的元素（跨 .vue，index.vue 优先）。
   * 带上 depth / isHostShell / hasBgBinding，供统一评分与「已占用跳过」判定使用。
   * @returns {Array<{file:string, tag:string, tagName:string, cls:string, depth:number, isHostShell:boolean, hasBgBinding:boolean}>}
   */
  _collectMountCandidates(files) {
    return microcodeResources.collectMountCandidates(files);
  }

  /**
   * 🛡️ P1-3：从候选池里用统一评分挑最优挂载点。
   * @param {Object} mapping
   * @param {Array} pool `_collectMountCandidates` 或关键词短list（字段兼容）
   * @param {{componentPrefix?:string, skipBound?:boolean, usedTags?:Set<string>}} [opts]
   *   skipBound=true 时排除已有 background* 绑定的候选（仅在还有其它候选时生效）
   * @returns {{file:string, tag:string, keyword:string, score:number, cls:string}|null}
   */
  _pickBestMountTarget(mapping, pool, opts = {}) {
    return microcodeResources.pickBestMountTarget(mapping, pool, opts);
  }

  /**
   * 向开标签注入/合并 :style 背景绑定。
   * - 无 :style → 追加 `:style="{ backgroundImage: 'url(' + var + ')', backgroundSize: '<figmaBox>', backgroundPosition: '..', backgroundRepeat: '..' }"`
   * - 已有 :style 对象字面量 → 展开合并（后键覆盖）
   * - 已有 :style 但非对象字面量 → 放弃（返回 null，调用方换下一个挂载点）
   * @param {Object} [mapping] - 可选，resourceDomMapping 条目；有 figmaBox 时用实际尺寸，否则 100% 100%
   */
  _injectBgStyleBinding(content, tag, varName, mapping = null) {
    return microcodeResources.injectBgStyleBinding(
      content,
      tag,
      varName,
      mapping,
    );
  }

  /**
   * 🛡️ P2-3 阶段一（2026-08-30）：bg 整块背景多引用自动去重。
   * 同一 bg 变量（bgRole==='container'，即整块背景）被挂到多个容器时，保留 mountTarget
   * 匹配度最高的那处，其余从 :style 中剔除。
   *
   * 安全约束：仅当待删除的 :style 是「纯背景绑定」（对象字面量、无 spread、除 background*
   * 外无其他属性键）时才删除整个 :style；否则保守跳过，交给 CODE-017 BLOCK 兜底。
   * 去重后仍 >1 的由 CODE-017（code-structure-validator）硬 BLOCK。
   * @param {Object} files - 产物文件表（path → content）
   * @param {Array} resourceDomMapping - 资源映射
   * @returns {Object} 去重后的文件表
   */
  _dedupeBgMultiRefs(files, resourceDomMapping) {
    return microcodeResources.dedupeBgMultiRefs(files, resourceDomMapping, {
      logger: this.logger,
    });
  }

  /** 确保目标 vue 文件 script 中存在该资源变量的 import（无则补；子组件无 script 时补最小 script 块） */
  _ensureResourceImportInVue(content, varName, mapping, filePath) {
    return microcodeResources.ensureResourceImportInVue(
      content,
      varName,
      mapping,
      filePath,
    );
  }

  /**
   * 🛡️ 删减法批次 2（2026-09-14）：计划驱动资源挂载——替代旧 _autoMountUnusedBackgrounds/Icons。
   * buildResourceMountPlan（section 归属 + figma 祖先链定 owner、同图单变量 sharedBy）
   * + mountPlannedResources（限定 owner 文件、fail-closed 诊断）。
   * @returns {{mounted: Array, diagnostics: Array}}
   */
  _mountPlannedResources(allFiles, effectiveSections, resourceDomMapping, input = {}) {
    const plan = resourceMountPlan.buildResourceMountPlan(
      effectiveSections || [],
      resourceDomMapping || [],
      { figmaRoot: input.figmaNodeData || null },
    );
    return resourceMountPlan.mountPlannedResources(allFiles, plan, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ P0 修正（2026-08-28）：sub-state 状态背景专用挂载。
   *
   * bgRole='sub-state'（如 bg-tab-active）的资源只能挂「状态元素」：模板中 :class 含
   * active 动态绑定的元素。注入与激活条件联动的条件 :style：
   *   :class="['xxx', { active: cond }]"  →  追加 :style="cond ? { backgroundImage: 'url(var)', ... } : null"
   *
   * 保守规则：标签已有 :style 则跳过（不合并复杂表达式）；找不到 active 绑定返回 null
   * （调用方不挂，交由资源未使用门禁明确报错——错误挂载比未挂载更糟）。
   *
   * @returns {{var, file, keyword, bgRole, mountTarget}|null}
   */
  _mountSubStateBackground(allFiles, varName, m) {
    return microcodeResources.mountSubStateBackground(allFiles, varName, m, {
      logger: this.logger,
    });
  }

  /**
   * 🛡️ 尺寸联动校验（mc-max-1787923972602 实锤，2026-08-28）：模型写出
   * min-height: 300px 而根容器固定 height: 186px（vision 真值 chart 区仅 160px），
   * 内部撑爆根容器导致布局溢出错乱。确定性 clamp：后代 min-height 超过根容器
   * 固定高度时压到根高 85%（预留头部/tabs 空间）。只管固定小根容器（<600px），
   * 自适应根（100%）不干预。
   *
   * @param {Object<string,string>} files
   * @returns {Object<string,string>|null} 被修改的文件 map（无变化返回 null）
   */
  _clampOversizeMinHeight(files) {
    return microcodeResources.clampOversizeMinHeight(files, {
      logger: this.logger,
    });
  }
  /**
   * 🛡️ #1b 确定性修复（mc-max-1787927914106 实锤，2026-08-29）：CSS 替代资源的
   * 语义名被模型写成 `url(${var})` 时，替换为真实色值 backgroundColor。
   * CSS 替代（downloadStatus='css'）无 resourceFile，buildVarToMapping 只收 success 条目 →
   * 该变量名既不被 import 注入、也不被语义门禁视为已声明 → 语义 fail-closed 死循环。
   * 此处把 `backgroundImage: url(var)`（两种写法）确定性替换成 `backgroundColor: 色值`。
   *
   * @param {Object<string,string>} allFiles
   * @param {Array} resourceDomMapping
   * @returns {Array<{file:string, vars:string[]}>} 修复清单
   */
  _resolveCssSubstituteRefs(allFiles, resourceDomMapping) {
    return microcodeResources.resolveCssSubstituteRefs(
      allFiles,
      resourceDomMapping,
    );
  }

  /**
   * 🛡️ P0-1 对称扩展：向容器开标签【之后】插入 <img :src="varName" /> 子元素。
   *
   * bg 用 _injectBgStyleBinding 注入 :style 背景即可表达；icon/img 必须以真实 <img> 元素
   * 出现（validator 语义要求「icon 必须作为 <img :src> 使用」），故此处插入子元素而非改属性。
   * 自闭合容器（<div />）没有子元素槽位，返回 null 由调用方换下一个挂载点。
   */
  _injectImgChild(content, openTag, varName, alt = '') {
    return microcodeResources.injectImgChild(content, openTag, varName, alt);
  }

  /**
   * 🛡️ P0-1 扩展：<style> 内错误 LESS 变量引用归一化（2026-08-27）
   * 模型把资源变量名 bg2/bg3 当 LESS 变量写成 url(@bg2)/url(@bg3)，并发明 theme-vars 里
   * 不存在的 @color-tab-default-text。validateVueSfc 的 less preprocess（strip 相对
   * @import 后）报 "variable @x is undefined" → 最终 SFC 校验失败。
   *
   * 策略（确定性后处理，env BG_AUTO_MOUNT=false 一并关闭）：
   *  1) 资源变量 url(@bgN) → url('<相对路径>/<真实文件名>')（bgN 匹配资源映射 assignedVarName）
   *  2) 其余「未声明且非资源、非 theme-vars 已定义」的 @变量 → 注入 @var: 安全默认值
   * 不误伤合法主题变量（theme-vars 里已定义的变量名跳过，避免用默认值覆盖主题色）。
   * @returns {Array<{file:string, resourceVars:string[], inventedVars:string[]}>}
   */
  _normalizeStyleLessVars(allFiles, resourceDomMapping) {
    return microcodeResources.normalizeStyleLessVars(
      allFiles,
      resourceDomMapping,
      { logger: this.logger },
    );
  }

  /**
   * 🛡️ B2（2026-09-07）：下载失败背景资源的 CSS 渐变/纯色兜底注入。
   *
   * 根因（docs/0907-组件生成问题分析.md）：traffic 组件根背景 bg-[m] downloadStatus='missing'，
   * skipMount 后无替代方案 → 容器无背景。现有 resolveCssSubstituteRefs 只处理 downloadStatus='css'，
   * healUnavailableResourceRefs 只剥离引用（→ none），未注入任何视觉替代。
   *
   * 策略：在 resolveCssSubstituteRefs 之后、healUnavailableResourceRefs 之前运行，
   * 将失败 bg 资源的 url(${var}) / url(@var) / url(none) 替换为 fallback 色值，
   * 或兜底注入 CSS fallback 类到目标容器。
   *
   * @param {Object<string,string>} allFiles
   * @param {Array} resourceDomMapping
   * @returns {Array<{file:string, var:string, role:string, method:string}>} 修复清单
   */
  _injectFailedResourceFallbacks(allFiles, resourceDomMapping) {
    return microcodeResources.injectFailedResourceFallbacks(
      allFiles,
      resourceDomMapping,
      { logger: this.logger },
    );
  }

  /**
   * 🛡️ C2（2026-09-07，#568）：空壳解绑。
   * T1 标题剥离后，原父容器 div 残留 :style 绑定变成空壳，清理无效绑定。
   */
  _stripEmptyShellBindings(allFiles, resourceDomMapping) {
    return microcodeResources.stripEmptyShellBindings(
      allFiles,
      resourceDomMapping,
      { logger: this.logger },
    );
  }

  /**
   * 🛡️ P0-3（2026-08-30）：孤儿剔除前，把待剔除文件里「确实被模板引用」的 bg 资源
   * 迁移到保留文件。
   *
   * 根因（mc-max-1788056145870-6e65dc88 实锤）：LLM 把 bg2 正确挂在 HeaderTabs.vue，
   * 但 HeaderTabs 被 P1-2 孤儿剔除删掉（index.vue 只用 EnvTabBar）→ 唯一正确挂载点消失
   * → _autoMountUnusedBackgrounds 兜底时关键词匹配不到 → 降级 root-fallback 挂到 base-panel。
   * 治本：剔除前先迁移，正确挂载点不丢失，兜底不再错位。
   *
   * 只迁移 bg（icon 有独立 _autoMountUnusedIcons 兜底，且 img 迁移语义与 bg 不同）。
   * @param {Object} allFiles - 产物文件表
   * @param {Array} resourceDomMapping - 资源映射
   * @param {string[]} orphanPaths - 待剔除的孤儿文件路径
   * @returns {Array<{var, from, to}>} 迁移结果
   */
  _migrateOrphanResourceRefs(allFiles, resourceDomMapping, orphanPaths) {
    return microcodeResources.migrateOrphanResourceRefs(
      allFiles,
      resourceDomMapping,
      orphanPaths,
      { logger: this.logger },
    );
  }

  /**
   * 🛡️ P1-2：孤儿子组件剔除 + chunk-meta 清退（2026-08-27）
   * 保留集 = index.vue import 链（复用 _detectSubComponents）∪ 模板标签直接引用（PascalCase/kebab）。
   * 剔除 = allFiles 中不在保留集的 package/components/*.vue + 磁盘 chunk-meta 的 files/completed/分块文件。
   * 🛡️ P0-3（2026-08-30）：删除前先迁移孤儿文件里的资源引用（见 _migrateOrphanResourceRefs），
   * 避免正确挂载点随孤儿文件消失后，兜底降级到 base-panel。
   * @param {Array} [resourceDomMapping] - 可选，资源映射；提供时执行剔除前资源迁移
   * @param {object} [opts] - 可选，透传 options（F5：isL0BRetry 孤儿白名单）
   * @returns {string[]} 被剔除的孤儿路径清单
   */
  _pruneOrphanSubComponents(
    allFiles,
    outputPath,
    resourceDomMapping = null,
    opts = {},
  ) {
    return microcodeResources.pruneOrphanSubComponents(
      allFiles,
      outputPath,
      resourceDomMapping,
      { logger: this.logger, ...opts },
    );
  }

  /**
   * 🛡️ Phase 2 后处理兜底（TDD: T02/T03/T04/T05/T06/T07）
   * 用代码强制约束布局/样式/资源，不依赖 prompt 遵守
   */
  _postProcessIndexVue(code, input) {
    return microcodeResources.postProcessIndexVue(code, input, {
      logger: this.logger,
    });
  }

  /**
   * T08: 剥离未定义的资源变量引用（确定性修复）
   *
   * 判定：模板里 `url(${bgN})` / `:src="iconN"` 引用的资源变量，在 <script> 中既无 import
   * 也无本地声明 → 该引用必然是臆造，删除对应的内联 background-image / 整个 :style 绑定。
   * 保留 class 提供的视觉（common.less 通常已有对应背景规则）。
   */
  _stripUndefinedResourceRefs(code) {
    return microcodeResources.stripUndefinedResourceRefs(code, {
      logger: this.logger,
    });
  }

  /**
   * T09: headerSlots 补齐（确定性兜底）
   *
   * 现象：设计稿标题栏右侧有统计指标（如「设备类型 28 / 设备总数 68562 / 完好率 98%」），
   * headerSlots 已确定性推导出来，但模型只在 `<template #title_right>` 里写了注释
   * 或干脆不生成插槽 → 预览里头部一片空白。
   * 处理：对每个未落地的 slotType，用 headerSlots[].content 注入最小可见 DOM。
   */
  _ensureHeaderSlots(code, input, files) {
    return microcodeResources.ensureHeaderSlots(code, input, {
      logger: this.logger,
      files,
    });
  }

  /**
   * T05: bg-size 修正
   * 委托给 utils/post-process.js 的纯函数
   * 策略：把硬编码的 backgroundSize 'Xpx Ypx' 替换为 'cover'（背景图铺满容器）
   */
  _fixBackgroundImageSize(code) {
    const result = _fixBackgroundImageSizePure(code);
    if (result !== code) {
      this.logger.info(
        '🔧 Phase 2 T05: bg-size 修正（硬编码 px 尺寸替换为 cover）',
      );
    }
    return result;
  }

  /**
   * T06: 容器尺寸校验 + 确定性自动修正（BBox fallback → auto）
   * 委托给 utils/post-process.js 的纯函数
   */
  _validateContainerSize(code, rootWidth, rootHeight) {
    return microcodeValidator.validateContainerSize(
      code,
      rootWidth,
      rootHeight,
      { logger: this.logger },
    );
  }

  /**
   * T07: 资源引用校验
   * 委托给 utils/post-process.js 的纯函数
   */
  _validateResourceUsage(code) {
    return microcodeValidator.validateResourceUsage(code, {
      logger: this.logger,
    });
  }

  /**
   * T03: 图表容器 min-height 注入
   * 委托给 utils/post-process.js 的纯函数（单一真相源，便于 TDD 测试）
   */
  _injectChartMinHeight(code) {
    const result = _injectChartMinHeightPure(code);
    if (result !== code) {
      this.logger.info('🔧 Phase 2: 注入图表容器 min-height');
    }
    return result;
  }

  /**
   * T04: 背景图去重
   * 委托给 utils/post-process.js 的纯函数（单一真相源，便于 TDD 测试）
   */
  _deduplicateBackgroundImages(code) {
    const result = _deduplicateBackgroundImagesPure(code);
    if (result !== code) {
      const bgImages = code.match(/url\(['"]?[^'")\s]+['"]?\)/g) || [];
      this.logger.info('🔧 Phase 2: 背景图去重', {
        duplicates: bgImages.length,
      });
    }
    return result;
  }

  _ensureSubComponentImport(content) {
    return microcodeResources.ensureSubComponentImport(content, {
      logger: this.logger,
    });
  }

  _rewriteClickableIconDivsToButtons(content) {
    return microcodeResources.rewriteClickableIconDivsToButtons(content);
  }

  /**
   * 🆕 方案 3：子组件资源依赖前置校验（2026-08-31）
   *
   * 背景：mc-1788158950767-e7fbd410 实锤——TabSwitch.vue 模板用了 `${bg2}`，
   * 但 <script setup> 未 import 也未 const/let 声明 → 运行时 undefined → 背景静默丢失。
   *
   * 本方法委托给 resource-import-guard.js 的纯函数 validateSubcomponentResourceDeps
   * （单一事实源，CODE-018 门禁与生成时自检共用），生成时在写入前做早期发现。
   *
   * @param {string} content 子组件 .vue 文件内容
   * @param {string} filePath 文件路径
   * @param {Array} resourceDomMapping 资源映射表
   * @returns {{valid:boolean, errors:string[], warnings:string[], declaredVars:string[], missingVars:string[]}}
   */
  _validateSubcomponentResourceDeps(content, filePath, resourceDomMapping) {
    const result = validateSubcomponentResourceDeps(
      content,
      filePath,
      resourceDomMapping,
    );
    if (!result.valid) {
      this.logger.warn(`⚠️ 子组件资源依赖校验失败: ${filePath}`, {
        errors: result.errors,
        missingVars: result.missingVars,
      });
    }
    return result;
  }

  _stripBasePanelShellLeak(content) {
    return microcodeResources.stripBasePanelShellLeak(content);
  }

  /**
   * 执行完整的代码生成流程
   */
  async execute(params) {
    const {
      layoutStructure,
      visualElements,
      _visualDegraded,
      _visualDegradeReason,
      componentName,
      outputPath,
      stage = 'preview',
      reviewResult,
      previousCritiques, // ✅ 新增：接收对抗性检查的critique
      charts,
      interactions,
      analysisType,
      analysisTarget,
      analysisDescription,
      analysisEvidence,
      figmaNodeData,
      styleMappings,
      assets,
      resourceDomMapping, //资源-DOM映射表（用于自动注入import）
      _l0CodeRetryGuidance, //L0-B 重试修复指导
      techStackHints, //技术栈提示
      _selfOptimization, // 🧠 自优化：历史模式驱动的 Prompt 增强
      panelType = 'default-panel', //面板类型
      headerSlots = null, //面板头部插槽信息
      elementStyleMap = null, //  per-element 样式映射（来自 Style Mapper）
      backgroundBrightness = 'dark', //面板明暗主题
      displayName = null, //  组件中文显示名称（用于 declare.json 后校验）
      docAnalysis = null, //S8: 需求文档分析产物（doc-analysis.json 六维）
      onProgress = null, //  SSE 进度回调（LLM 心跳推送）
      _runtimeRevisionGuidance = null, //运行时增量修订指导（来自 classifyRuntimeGate）
      targetFiles = null, //  仅重做这些文件（按问题类别只修目标文件）
      reviseTarget = null, //  修订目标类别（full/layout/structural/...）
      onFilesReady = null, //  完整 files map 候选快照回调
      ctx = null, //  1-1 接入：生成上下文值对象（档位/类型/资源映射）
      generationInput = null, // 🆕 Context Assembler 裁决事实
      _attributionGuidance = null, // 🛡️ 资源归属指导（方案5，上一轮漏用背景的重试指导）
    } = params;

    // 🆕 2026-09-04：暂存 sessionId 供 normalizeDeclareJson 唯一化 componentId 使用
    // （code-validator 回调 options.normalizeDeclareJson 时通过 this 取用；无 sessionId
    // 的兜底/模板调用自动走旧归一逻辑，兼容不变）。
    if (ctx?.sessionId) this._engineerSessionId = ctx.sessionId;
    if (componentName && !ctx?.sessionId && /^(mc|mv|cp|page)-/.test(String(componentName || ''))) {
      // 兼容：graph 未传 ctx 时从编码 componentName（=sessionId 场景）补识别
      this._engineerSessionId = this._engineerSessionId || componentName;
    }

    // 🛡️ 模型收集（2026-08-29）：更新 this.onProgress，使 attachUnifiedInvoke 的 getter
    // 能读到 graph 的 state.onProgress，agent-model 事件透传到 phase2 收集 actualTextModels，
    // 详情页才能显示实际命中的 deepseek/qwen 等模型（此前恒空回退配置值）。
    if (onProgress) this.onProgress = onProgress;

    if (
      _visualDegraded ||
      layoutStructure?.degraded ||
      layoutStructure?.visualDegraded
    ) {
      throw new Error(
        `视觉分析不可信，禁止执行代码生成，避免模型基于名称/行业语义臆造内容。原因：${_visualDegradeReason || layoutStructure?.degradeReason || '未知'}`,
      );
    }

    // 如果未提供 displayName，从 figmaNodeData 中自动提取
    const compDisplayName = displayName || figmaNodeData?.name || '';

    // 🆕 generationInput 生效：Context Assembler 裁决事实（信任等级 + 问题清单）
    // designFacts 包含 { root, charts, provenance }，不含 layoutStructure/visualElements/styleMappings
    // 这些散装参数仍从 state 直接获取，generationInput 主要用于日志诊断和 trustVerdict
    const useGenerationInput = !!(
      generationInput && generationInput.schemaVersion >= 1
    );
    const effectiveLayoutStructure = layoutStructure;
    const effectiveVisualElements = visualElements;
    const effectiveReviewResult = reviewResult;
    const effectiveStyleMappings = styleMappings;
    if (useGenerationInput) {
      this.logger.info(
        '🆕 [Context Assembler] 裁决事实已注入 Engineer（仅信任等级 + 问题清单）',
        {
          trustLevel: generationInput.trustVerdict?.level,
          rejectedClaims:
            generationInput.contextManifest?.conflictSummary
              ?.rejectedClaimCount || 0,
          currentIssues: generationInput.currentIssues?.length || 0,
          designFactsKeys: Object.keys(generationInput.designFacts || {}),
          note: 'layoutStructure/visualElements/styleMappings 仍使用散装参数（designFacts 不含这些字段）',
        },
      );
    }

    // 判断是首次生成还是修订
    const hasCritiques = effectiveReviewResult?.critiques?.length > 0;
    const hasPreviousCritiques =
      Array.isArray(previousCritiques) && previousCritiques.length > 0;
    const isRevision = hasCritiques || hasPreviousCritiques;
    const action = isRevision ? '修订' : '生成';

    this.logger.info(`开始执行代码${action}`, {
      componentName,
      stage,
      isRevision,
      critiqueCount: previousCritiques?.length || 0,
    });

    // 如果是修订，记录需要修复的问题
    if (isRevision && hasPreviousCritiques) {
      const highSeverity = previousCritiques.filter(
        (c) => c.severity === 'high',
      ).length;
      const mediumSeverity = previousCritiques.filter(
        (c) => c.severity === 'medium',
      ).length;
      this.logger.info('📋 修订目标', {
        total: previousCritiques.length,
        high: highSeverity,
        medium: mediumSeverity,
        categories: [...new Set(previousCritiques.map((c) => c.category))],
      });

      // 详细记录每个需要修复的问题
      previousCritiques.forEach((critique, index) => {
        this.logger.info(`  修复项 #${index + 1}: ${critique.issue}`, {
          severity: critique.severity,
          category: critique.category,
          location: critique.location || 'N/A',
        });
      });
    }

    try {
      // 文件生命周期：模型生成阶段（文件组级状态，不虚构单个活动文件）
      onProgress?.({
        fileLifecycle: {
          phase: 'modeling',
          summary: isRevision ? '正在修订组件文件组' : '正在生成组件文件组',
        },
      });

      // 1. 生成代码（使用 effective 变量：Context Assembler 裁决优先）
      const codeResult = await this.generateCode({
        onProgress, //  传递 SSE 进度回调
        onFilesReady, // 📡 增量候选快照回调（分块完成即发布，代码 Tab 逐文件可见）
        layoutStructure: effectiveLayoutStructure,
        visualElements: effectiveVisualElements,
        componentName,
        stage,
        reviewResult: effectiveReviewResult,
        previousCritiques, // ✅ 传递给generateCode
        charts,
        interactions,
        analysisType,
        analysisTarget,
        analysisDescription,
        analysisEvidence,
        figmaNodeData,
        styleMappings: effectiveStyleMappings,
        assets,
        resourceDomMapping,
        headerSlots, //传递插槽信息
        panelType, //传递面板类型
        elementStyleMap, //  传递 per-element 样式映射
        backgroundBrightness, //传递面板明暗主题
        displayName: compDisplayName, //  组件中文显示名称
        docAnalysis, //S8: 传递需求文档分析产物
        isRevision, //  标记修订模式（部分修订判断依据）
        outputPath, //  部分修订时从磁盘保留未变更文件
        targetFiles, //  仅重做目标文件
        reviseTarget, //  修订目标类别
        ctx, //  1-1 接入：生成上下文值对象（档位/类型/资源映射）
        generationInput, // 🆕 Context Assembler 裁决事实（供 trustVerdict/currentIssues 注入 prompt）
        _attributionGuidance, // 🛡️ 资源归属指导（方案5，重试轮注入）
        // 🛡️ D 步（2026-08-31）：此前 execute 解构了 _l0CodeRetryGuidance 但重组装 generateCode input 时
        // 丢失该字段 → runChunk 的 isL0BRetry 恒 falsy → L0-B 重试轮 R12 仍从磁盘恢复坏分块（不重新生成）
        // → 确定性失败原样重放 → 重试空转（事故 mc-max-1788174922721-1034fb6d：EMPTY_ARTIFACT ×3 轮）。
        _l0CodeRetryGuidance,
        // 🛡️ D 步：runChunk 读 input._reviseFiles，但字段一路叫 targetFiles——补映射对齐命名。
        _reviseFiles: targetFiles,
      });

      // 🛡️ 统一产物契约（mc-max-1787934982316 实锤，2026-08-29）：generateCode 三种返回形态：
      //   成功 { success:true, files } / 可重试失败 { success:false, retryable:true, errorType } /
      //   不可重试 throw。此处统一消费：success===false（无论可重试与否）都还原为 throw，
      //   retryable 标记随错误抛出，图级 decideRetry 据此决定是否重试——杜绝任何
      //   codeResult.files 未判空崩溃，也保证可重试错误不丢失重试机会。
      if (!codeResult || typeof codeResult !== 'object' || !codeResult.files) {
        throw new Error(
          'generateCode 返回结果无效：codeResult 为空、非对象或缺少 files 属性',
        );
      }
      if (codeResult.success === false) {
        const retryErr = new Error(
          codeResult.errorMessage || '组件代码生成失败',
        );
        retryErr.code = codeResult.errorType || 'GENERATION_FAILED';
        retryErr.retryable = !!codeResult.retryable;
        if (codeResult.attributionGuidance) {
          retryErr.attributionGuidance = codeResult.attributionGuidance;
        }
        throw retryErr;
      }

      // 1.5. 后处理：兜底注入资源 import 语句（防止 AI 臆造文件名）。
      // 注意：generateCode 内的前置注入已按契约完成主组件 import；此兜底只处理「主组件文件
      // 确实没有任何资源 import」的残留空档。Loop 1：禁止 forceAll 全量，改为注入模板实际
      // 引用的资源变量（panel + 已用资源），不冲掉 generateCode 的契约收窄。
      if (resourceDomMapping && codeResult?.files?.['package/index.vue']) {
        const _mainIdx = codeResult.files['package/index.vue'];
        // 🎯 放宽判定：契约注入允许语义名（如 bgm / iconVehicle），不再只认 bg|icon|img+数字。
        // 只要出现任一来自 resources/images 的资源 import 即视为已注入，避免误触发全量覆盖。
        const _alreadyHasResImports = /from\s+['"]\.{1,2}\/resources\/images\//.test(_mainIdx);
        if (!_alreadyHasResImports) {
          codeResult.files['package/index.vue'] = injectResourceImports(
            _mainIdx,
            resourceDomMapping,
            null,
            null,
            null, // 走默认「注入模板已引用资源变量」分支，不 forceAll
          );
          this.logger.info('✅ 已自动注入资源import语句（execute 兜底，仅已引用资源）');
        }
      }

      // 1.6 theme-vars.less 路径纠偏：LLM 分块生成时可能把 theme-vars.less 写到
      //     resources/styles/ 根目录（而非标准的 resources/styles/themes/），导致 index.less
      //     引到 themes/ 下的空壳兜底、所有 @xxx 主题变量丢失（L0-B LESS-COMPILE-001 BLOCK）。
      //     写盘前迁移：根目录版有变量定义且 themes/ 版缺失/无变量时，搬到 themes/ 并删除根目录版。
      {
        const ROOT_THEME_VARS = 'resources/styles/theme-vars.less';
        const THEMES_THEME_VARS = 'resources/styles/themes/theme-vars.less';
        const rootTV = codeResult.files[ROOT_THEME_VARS];
        const themesTV = codeResult.files[THEMES_THEME_VARS];
        const hasVarDef = (content) =>
          typeof content === 'string' && /@[\w-]+\s*:/.test(content);
        if (rootTV && hasVarDef(rootTV) && !hasVarDef(themesTV)) {
          codeResult.files[THEMES_THEME_VARS] = rootTV;
          delete codeResult.files[ROOT_THEME_VARS];
          this.logger.info('✅ theme-vars.less 路径纠偏', {
            from: ROOT_THEME_VARS,
            to: THEMES_THEME_VARS,
          });
        }
      }

      // 🛡️ R1-2（2026-09-11）布局事实数据流：rootLayoutFacts 单一来源。
      // 优先取确定性模板 facts（buildDeterministicIndexTemplate），缺失时从 index.vue 落盘内容
      // 兜底提取一次（词尾猜测固化于此，下游归一器/规则②改读 facts、退役命名枚举）。
      let rootLayoutFacts = null;
      const _indexTemplateFacts = codeResult.indexTemplateFacts || null;
      if (_indexTemplateFacts?.rootContainerClass) {
        rootLayoutFacts = {
          rootContainerClass: _indexTemplateFacts.rootContainerClass,
          sectionRoots: _indexTemplateFacts.sectionRoots || [],
          source: _indexTemplateFacts.source || 'deterministic-template',
        };
      } else {
        const _idxFallback =
          codeResult.files['package/index.vue'] || codeResult.files['index.vue'];
        const _detCls = detectContentRootClass(
          typeof _idxFallback === 'string' ? _idxFallback : '',
        );
        if (_detCls) {
          rootLayoutFacts = {
            rootContainerClass: _detCls,
            sectionRoots: [],
            source: 'detected-index',
          };
        }
      }
      if (rootLayoutFacts) {
        this.logger.info('🧩 布局事实 rootLayoutFacts', {
          rootContainerClass: rootLayoutFacts.rootContainerClass,
          sectionRoots: rootLayoutFacts.sectionRoots.length,
          source: rootLayoutFacts.source,
        });
      }

      // 🎯 确定性后处理（治本，不依赖 LLM 遵守 prompt）：
      //   T1 面板标题剥离：base-panel 外壳已渲染标题，组件内 PanelHeader 重复（mc-max-1787577949692 实锤）
      //   T2 echarts 容器最小高度：图表容器被 flex 兄弟挤压到 ~10px
      //   T3 图表 type 强约束：vision 说 area/line 但 LLM 写 bar → 强制改回（mc-max-1787577949692 折线变柱实锤）
      try {
        const rootNode2 = figmaNodeData?.document || figmaNodeData;
        // T1 提取 header 标题
        let titleText = '';
        const headerTexts2 = [];
        const collectHeaderTexts2 = (node, acc) => {
          if (!node || typeof node !== 'object') return;
          if (
            node.type === 'TEXT' &&
            typeof node.characters === 'string' &&
            node.characters.trim()
          ) {
            acc.push({
              t: node.characters.trim(),
              x: node.absoluteBoundingBox?.x ?? 0,
            });
          }
          if (Array.isArray(node.children))
            node.children.forEach((c) => collectHeaderTexts2(c, acc));
        };
        const findHeader2 = (node, depth = 0) => {
          if (!node || typeof node !== 'object' || depth > 3) return null;
          const nm = String(node.name || '').toLowerCase();
          if (
            (node.type === 'GROUP' || node.type === 'FRAME') &&
            /^(header|panel-header|title-bar)[- ]?/i.test(nm)
          )
            return node;
          for (const c of node.children || []) {
            const r = findHeader2(c, depth + 1);
            if (r) return r;
          }
          return null;
        };
        const headerNode2 = findHeader2(rootNode2);
        if (headerNode2) {
          collectHeaderTexts2(headerNode2, headerTexts2);
          headerTexts2.sort((a, b) => a.x - b.x);
          titleText = headerTexts2[0]?.t || '';
        }
        if (titleText && titleText.length >= 2 && titleText.length <= 20) {
          const esc2 = titleText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const titleElRe2 = new RegExp(
            `\\n?[ \\t]*<[a-zA-Z][^>]*>\\s*${esc2}\\s*</[a-zA-Z]+>`,
            'g',
          );
          for (const [fp, fc] of Object.entries(codeResult.files || {})) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            const stripped = fc.replace(
              titleElRe2,
              '\n<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->',
            );
            if (stripped !== fc) {
              codeResult.files[fp] = stripped;
              this.logger.info(
                `🎯 [mc] 面板标题元素已剥离（外壳渲染）：${fp} → 「${titleText}」`,
              );
            }
          }
        }

        // T2 echarts 容器 min-height 注入
        for (const [fp, fc] of Object.entries(codeResult.files || {})) {
          if (
            !fp.endsWith('.vue') ||
            typeof fc !== 'string' ||
            !fc.includes('echarts.init(')
          )
            continue;
          const refMatch = fc.match(
            /echarts\.init\(\s*([A-Za-z_$][\w$]*)\.value/,
          );
          if (!refMatch) continue;
          const refName = refMatch[1];
          const elMatch =
            fc.match(
              new RegExp(`<div[^>]*ref="${refName}"[^>]*class="([\\w -]+)"`),
            ) ||
            fc.match(
              new RegExp(`<div[^>]*class="([\\w -]+)"[^>]*ref="${refName}"`),
            );
          if (!elMatch) continue;
          const chartCls = elMatch[1].trim().split(/\s+/)[0];
          const chartsForHeight = Array.isArray(charts) ? charts : [];
          const minHeight = _inferChartMinHeightPure(chartCls, '', {
            chartType: chartsForHeight[0]?.type,
            chartRole: chartsForHeight[0]?.role,
          });
          // 🛡️ T2-C/T2-D（2026-09-15，收敛到 post-process 单一事实源）：
          // min-height:0 不算保护（LLM 按 chart-standards 示例惯写 min-width:0;min-height:0），
          // 旧守卫当已保护 → 跳过注入，兜底块又建在 @import 后（文件顶部）→ 后置 0 值块
          // 级联反杀 160px（实锤 mc-1789446004258-677a6725 图表不显示）。
          const { code: patchedOnce, injectedCount } =
            injectChartMinHeightIntoClass(fc, chartCls, minHeight);
          let patched = patchedOnce;
          if (injectedCount === 0) {
            // 🛡️ T2 增强（2026-09-15）：LLM 写了 echarts.init 但没写图表容器样式规则块 →
            // 容器无高度塌缩（环境监测 ChartSection 实锤：.chart-container 在 style 段无规则）。
            // 主动在 <style> 段 @import 后创建规则块并注入 min-height。
            patched = createChartClassBlockIfAbsent(fc, chartCls, minHeight);
          }
          if (patched !== fc) {
            codeResult.files[fp] = patched;
            this.logger.info(
              `🎯 [mc] echarts 容器最小高度已注入: ${fp} → .${chartCls} min-height: ${minHeight}px（命中块 ${injectedCount || '兜底新建'}，min-height:0 反杀已剥除）`,
            );
          }
          // 🛡️ T2-D：共享表（common.less）常被 consolidateSubComponentClasses 搬入同名
          // class 且带 `min-height: 0`（LLM 原值）→ 在事实源处把 0 一并剥除。
          for (const [lf, lc] of Object.entries(codeResult.files || {})) {
            if (!lf.endsWith('.less') || typeof lc !== 'string') continue;
            const cleaned = stripZeroMinHeightForClass(lc, chartCls);
            if (cleaned !== lc) {
              codeResult.files[lf] = cleaned;
              this.logger.info(
                `🎯 [mc] 共享表 min-height:0 反杀已剥除: ${lf} → .${chartCls}`,
              );
            }
          }
        }

        // T3 图表 type 强约束：vision 指定的图表 type（area/line/bar）必须与 product 一致
        // 实锤：mc-max-1787577949692 vision 明确 type: 'area'，product 写 type: 'bar' → 折线变柱
        // 策略：按 vision 第一个图表 type 统一替换 product 里所有 series type（多图组件图类型通常一致）
        const chartsArr = Array.isArray(charts) ? charts : [];
        // 🔴 2026-09-11：真值必须先归一到 echarts 注册名，否则 '面积折线图'/'area-line'
        // 会被当作合法目标写进 series.type（真值洗白，实锤 mc-max-1789062564333-f1ff01eb）。
        const visionTypes = new Set(
          chartsArr
            .map((c) => resolveEchartsType(c?.type))
            .filter(Boolean),
        );
        const targetType = resolveEchartsType(chartsArr[0]?.type) || '';
        if (targetType && targetType !== 'bar' && !visionTypes.has('bar')) {
          // vision 不含 bar → product 里所有非 vision 指定类型的 series 强制改回
          let fixedCount = 0;
          for (const [fp, fc] of Object.entries(codeResult.files || {})) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            const before = fc;
            const after = before.replace(
              /type:\s*['"]bar['"]/g,
              `type: '${targetType}'`,
            );
            if (after !== before) {
              fixedCount += (before.match(/type:\s*['"]bar['"]/g) || []).length;
              codeResult.files[fp] = after;
            }
          }
          if (fixedCount > 0) {
            this.logger.info(
              `🎯 [mc] 图表 type 强约束：${fixedCount} 处 'bar' 强制改 '${targetType}'（vision types: ${[...visionTypes].join(',') || '无'}）`,
            );
          }
        }

        // 🛡️ Loop 2.1.E（2026-09-10 立，2026-09-11 修订）：非法 series.type 拒收（chartType 真值驱动）。
        // 根因：traffic 产物 series.type:'分组柱状图'（中文别名，非 echarts 注册名）→ init 失败/空白。
        // 🔴 2026-09-11 修订（真值洗白事故 mc-max-1789062564333-f1ff01eb，组件 c-env-monitor-d0ela8hg-f1ff01eb）：
        //    ① 旧版 fallback 直接取**未校验真值** → 真值='area-line'/'面积折线图'/'分组柱状图' 时
        //       把非法值「收敛」成同一个非法值并打印「已收敛 N 处」→ 守卫退化成洗白器，图表依旧空白。
        //       实锤日志：`2.1.E 非法 series.type 已收敛 2 处（真值=area-line）`
        //    ② 旧正则 `/series\s*:\s*\[[\s\S]*?\]/`（lazy）只覆盖到第一个 `]`（colorStops 的闭合），
        //       同一 series 数组后半段逃过收敛；且无差别替换数组内所有 `type:` 键 →
        //       lineStyle.type / areaStyle.color.type 被改坏（实锤 c-traffic-monitor-ppheeeem-9c86b889:158）。
        // 现改为 chart-type-guard.normalizeSeriesInSource：真值先归一 + 括号配平 + 只改元素顶层 type。
        try {
          const _truthChartType = resolveEchartsType(chartsArr[0]?.type);
          // 🛡️ 2026-09-14 · T-01 治本（§15b.4）：多图组件由 charts[] 构造「真值集」{
          // bar,line,...}，逐 series 互不覆盖。**严禁「首图真值覆盖全文件」**——
          // 否则会主动把本应 area 的合法 line/area 改成首图 bar（流量监测 c6c228fb 实锤）。
          const _truthChartTypeSet = buildChartTypeTruthSet(chartsArr);
          let _illegalFixed = 0;
          for (const [fp, fc] of Object.entries(codeResult.files || {})) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            if (!fc.includes('series')) continue;
            const r = normalizeSeriesInSource(fc, {
              chartType: _truthChartType,
              chartTypeSet: _truthChartTypeSet,
            });
            if (r.changed > 0) {
              codeResult.files[fp] = r.text;
              _illegalFixed += r.changed;
            }
          }
          if (_illegalFixed > 0) {
            this.logger.warn(
              `🛡️ [mc] 2.1.E 非法 series.type 已收敛 ${_illegalFixed} 处（真值集=${[..._truthChartTypeSet].join(',') || 'none→line'}）`,
            );
          }
        } catch (ctErr) {
          this.logger.warn('⚠️ [mc] 2.1.E chartType 收敛失败（非阻塞）', {
            error: ctErr?.message,
          });
        }

        // 🛡️ Loop 2.1.F（2026-09-11）：坐标轴格式守卫，根治 `xAxis "0" not found`。
        // 根因：LLM 跟随 prompt 生成对象格式 xAxis/yAxis + 缺显式索引，markLine 值定位点
        // 在部分 ECharts 版本触发轴索引查询失败（c-traffic-monitor-5nxelujp-1a29a03f）。
        // 治本：对象→数组 + 字符串索引→数字 + cartesian 缺索引注入 + @fontSize 泄漏修复。
        try {
          let _axisFixed = 0;
          for (const [fp, fc] of Object.entries(codeResult.files || {})) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            if (
              !fc.includes('series') &&
              !fc.includes('xAxis') &&
              !fc.includes('yAxis') &&
              !fc.includes('@fontSize')
            )
              continue;
            const r = normalizeChartAxesInSource(fc);
            if (r.changed > 0) {
              codeResult.files[fp] = r.text;
              _axisFixed += r.changed;
            }
          }
          if (_axisFixed > 0) {
            this.logger.warn(
              `🛡️ [mc] 2.1.F 坐标轴格式已收敛 ${_axisFixed} 处（xAxis/yAxis 数组化 + 显式索引）`,
            );
          }
        } catch (axisErr) {
          this.logger.warn('⚠️ [mc] 2.1.F 坐标轴格式收敛失败（非阻塞）', {
            error: axisErr?.message,
          });
        }

        // 🎯 N1 数字字面量确定性剥离：vision TEXT 字符集 vs 产物数字字面量差集 → 标 TODO 占位
        // mc-max-1787623728679 实锤：vision 漏识别 sections=0 时 LLM 臆造"25°C/60%/35"
        try {
          const textSet = new Set();
          const collectTextChars = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'TEXT' && typeof node.characters === 'string') {
              for (const m of node.characters.matchAll(/[-+]?\d+\.?\d*%?/g))
                textSet.add(m[0]);
            }
            if (Array.isArray(node.children))
              node.children.forEach(collectTextChars);
          };
          collectTextChars(figmaNodeData?.document || figmaNodeData);
          const numericRewriteDecision = assessNumericLiteralRewrite({
            layoutStructure,
            visualElements: input.visualElements,
            elements: input.elements,
            chunks: input.chunks,
            charts,
            subComponentPlan: subPlan,
            effectiveSections,
          });
          if (textSet.size > 0) {
            let ghostCount = 0;
            for (const [fp, fc] of Object.entries(codeResult.files || {})) {
              if (
                !fp.endsWith('.vue') &&
                !fp.endsWith('.ts') &&
                !fp.endsWith('.js')
              )
                continue;
              if (typeof fc !== 'string') continue;
              const ghostInFile = new Set();
              // 模板区：<tag>数字</tag>、{{ 数字 }}、属性引号内数字（避开 style 块）
              const styleBlockRe = /<style[\s\S]*?<\/style>/g;
              const styleBlocks = [];
              const fcNoStyle = fc.replace(styleBlockRe, (m) => {
                styleBlocks.push(m);
                return `\x00STYLE${styleBlocks.length - 1}\x00`;
              });
              let patched = fcNoStyle;
              // 只有无结构证据的低置信场景才改写；有 section/visual evidence 时只诊断。
              const rewriteNumeric = numericRewriteDecision.rewrite;
              // 1) 模板文本：>数字< → 低置信时替 0+注释，否则仅记录诊断
              patched = patched.replace(
                />\s*([-+]?\d+\.?\d*%?)\s*</g,
                (m, lit) => {
                  if (textSet.has(lit)) return m;
                  ghostInFile.add(lit);
                  return rewriteNumeric ? `>0<!-- 🎯 待接入(${lit}) --><` : m;
                },
              );
              // 2) 双花括号：{{ 数字 }} → 低置信时替 0+注释，否则仅记录诊断
              patched = patched.replace(
                /\{\{\s*([-+]?\d+\.?\d*%?)\s*\}\}/g,
                (m, lit) => {
                  if (textSet.has(lit)) return m;
                  ghostInFile.add(lit);
                  return rewriteNumeric ? `{{0 /* 🎯 待接入(${lit}) */}}` : m;
                },
              );
              // 3) 字符串字面量："25°C"/'60%' 仅在 template 内有效（避开 script 数据区如 labels 数组——它们是真值字面量）
              // 简化策略：跳过 JS/TS 字符串字面量剥离（风险大），只处理模板中的 >数字< 与 {{数字}}
              // 还原 style 块
              patched = patched.replace(
                /\x00STYLE(\d+)\x00/g,
                (_, i) => styleBlocks[Number(i)],
              );
              if (ghostInFile.size > 0) {
                codeResult.files[fp] = patched;
                ghostCount += ghostInFile.size;
              }
            }
            if (ghostCount > 0) {
              this.logger.info(
                `🎯 [mc] 数字字面量诊断：${ghostCount} 处未命中 Figma TEXT 数字（rewrite=${numericRewriteDecision.rewrite}，${numericRewriteDecision.reason}；vision 真值数字 ${textSet.size} 个）`,
              );
            }
          }
        } catch (n1err) {
          this.logger.warn('N1 数字剥离失败（非阻断）', {
            error: n1err.message,
          });
        }

        // 🎯 N2 图表生成兜底（2026-08-31 治本版）：vision 含 charts，产物无 echarts → 注入最小占位 echarts。
        // 注入逻辑抽至 code-healer.injectEchartsFallback（vue import 差集 + 符号冲突检测 + 根容器内注入），
        // 并加「注入器自检防线」：注入后立即 validateVueSfc，失败即回滚——注入器不允许把 LLM 合格产物改坏。
        // （事故 mc-max-1788174922721-1034fb6d：旧版盲目 import vue 与 LLM 已有 import 重复声明 →
        //  SFC 门禁跳过 index.vue 写盘 → L0-B EMPTY_ARTIFACT，3 轮重试全部空转耗尽。）
        try {
          const chartsForGuard = Array.isArray(charts) ? charts : [];
          const hasEcharts = Object.values(codeResult.files || {}).some(
            (f) => typeof f === 'string' && f.includes('echarts.init('),
          );
          if (chartsForGuard.length > 0 && !hasEcharts) {
            const idxPathN2 = 'package/index.vue';
            const targetFile = codeResult.files[idxPathN2];
            if (typeof targetFile === 'string') {
              const firstChart = chartsForGuard[0] || {};
              const chartType = resolveEchartsType(firstChart.type) || 'line';
              const chartSeries = (
                Array.isArray(firstChart.series)
                  ? firstChart.series
                  : ['趋势图']
              ).join(', ');
              // 前置：先自愈产物自身的 SFC 内嵌 style 括号缺失（与注入解耦，各自独立生效）
              const healedForN2 =
                microcodeHealer.healVueEmbeddedStyleBraces(targetFile);
              const patched = microcodeHealer.injectEchartsFallback(healedForN2, {
                chartType,
                chartSeries,
              });
              if (patched !== healedForN2) {
                // 🛡️ 注入器自检防线：注入后立即本地校验 SFC，失败即回滚（不注入比注入坏产物好）
                const guardN2 = validateVueSfc(patched, idxPathN2);
                if (guardN2.valid) {
                  codeResult.files[idxPathN2] = patched;
                  this.logger.warn(
                    `⚠️ [mc] 图表生成兜底：vision.charts.length=${chartsForGuard.length} 但产物无 echarts，已注入占位（type=${chartType} series=${chartSeries}，SFC 自检通过）。请人工补数据/样式`,
                  );
                } else {
                  this.logger.warn(
                    `⚠️ [mc] 图表兜底注入后 SFC 自检失败，已回滚（拒绝把合格产物改坏）：${(guardN2.errors || [])
                      .slice(0, 2)
                      .join(' | ')}`,
                  );
                  // style 括号自愈本身是无害改进，仍单独应用（自检通过才写）
                  if (
                    healedForN2 !== targetFile &&
                    validateVueSfc(healedForN2, idxPathN2).valid
                  ) {
                    codeResult.files[idxPathN2] = healedForN2;
                    this.logger.warn(
                      `🧩 N2 前置自愈已应用: ${idxPathN2}（SFC 内嵌 style 括号平衡，注入回滚不影响该修复）`,
                    );
                  }
                }
              } else if (healedForN2 !== targetFile) {
                codeResult.files[idxPathN2] = healedForN2;
              }
            }
          }
        } catch (n2err) {
          this.logger.warn('N2 图表兜底失败（非阻断）', {
            error: n2err.message,
          });
        }

        // 🎯 N3 bg→父容器强制挂载（2026-08-25 用户规则）：bg 是父元素的背景图/背景样式；
        // 嵌套容器 bg（mountTarget）必须挂到对应容器；面板直接子 bg（skipMount）不还原；icon/img 不挂载。
        try {
          const mappingN3 =
            resolveResourceDomMapping(resourceDomMapping, outputPath) || [];
          // 只强制挂「整块背景」（bgRole=container）；局部/状态背景（sub-state，如激活 tab 背景）
          // 应挂到父容器内的子项而非父容器整体，不在此强制挂载（2026-08-25 几何推导）。
          const bgMounts = mappingN3.filter(
            (m) =>
              m &&
              m.previewAnalysisRole === 'bg' &&
              m.mountTarget &&
              !m.skipMount &&
              m.bgRole === 'container',
          );
          if (bgMounts.length > 0) {
            const wordsOf = (s) =>
              String(s || '')
                .toLowerCase()
                .split(/[^a-z0-9\u4e00-\u9fa5]+/)
                .filter(Boolean);
            let mountedCount = 0;
            for (const bg of bgMounts) {
              const targetWords = new Set(wordsOf(bg.mountTarget));
              if (targetWords.size === 0) continue;
              const varName = bg.assignedVarName;
              const hasImage = !!(bg.resourceFile && varName);
              const fills = String(
                (bg.visualMeta && bg.visualMeta.fillsSummary) || '',
              ).trim();
              if (!hasImage && !fills) continue;
              // 🎯 背景完整四件套（2026-08-30，P1-4 统一口径；P2-1 增强推断）：
              // size 按 figmaBox 覆盖 parentBox 的面积比推断（≥0.9 → 100% 100%）、
              // position 用相对父容器偏移、repeat 双重约束，统一走 _buildBackgroundStyle。
              const bgStyle = this._buildBackgroundStyle(bg);
              // 背景值：有图用图（import 变量已注入），无图用 Figma 渐变/纯色
              //
              // 🛡️ P2-1：无图（纯渐变/纯色）分支此前只写 `background: '<fills>'`，四件套全丢，
              // 而 `background:` 简写会把 background-size 重置为 auto → 局部色块/渐变条会
              // 溢出铺满整个挂载元素（78×21 的激活态渐变条铺满 295×27 的 tabs-list）。
              // 铺满父容器时默认行为即铺满，无需冗余属性；未铺满时必须显式限定区域。
              // ⚠️ repeat 恒 no-repeat：平铺渐变会产生硬接缝，视觉上几乎总是错误。
              const fillBgSuffix = bgStyle.cover
                ? ''
                : ", backgroundSize: '" +
                  bgStyle.size +
                  "', backgroundPosition: '" +
                  bgStyle.position +
                  "', backgroundRepeat: 'no-repeat'";
              const bgCss = hasImage
                ? 'backgroundImage: `url(\${' +
                  varName +
                  "})`, backgroundSize: '" +
                  bgStyle.size +
                  "', backgroundPosition: '" +
                  bgStyle.position +
                  "', backgroundRepeat: '" +
                  bgStyle.repeat +
                  "'"
                : "background: '" +
                  fills.replace(/'/g, "\\'") +
                  "'" +
                  fillBgSuffix;
              // 在所有 .vue 产物中收集候选元素：class 词集与 mountTarget 词集求交集，取最高分且无背景者
              let best = null; // { fpath, index, length, insertStyle }
              for (const [fpath, fcontent] of Object.entries(
                codeResult.files || {},
              )) {
                if (typeof fcontent !== 'string' || !fpath.endsWith('.vue'))
                  continue;
                const tagRe =
                  /<([a-zA-Z][a-zA-Z0-9-]*)((?:(?!>).)*?)class="([^"]*)"((?:(?!>).)*?)>/g;
                let mt;
                while ((mt = tagRe.exec(fcontent)) !== null) {
                  const cls = mt[3];
                  const score = wordsOf(cls).filter((w) =>
                    targetWords.has(w),
                  ).length;
                  if (score === 0) continue;
                  const attrs = mt[2] + 'class="' + cls + '"' + mt[4];
                  if (/background/i.test(attrs)) continue; // 已有背景，不重复挂
                  const cand = {
                    fpath,
                    index: mt.index,
                    full: mt[0],
                    tag: mt[1],
                    before: mt[2],
                    cls,
                    after: mt[4],
                    score,
                  };
                  if (!best || score > best.score) best = cand;
                }
              }
              if (!best) continue;
              // 注入 :style（已有 :style 对象则在 { 后插入，否则新增；静态 style 与 :style 可共存由 Vue 合并）
              let replacement;
              if (/ :style="\{/.test(best.full)) {
                replacement = best.full.replace(
                  / :style="\{/,
                  ' :style="{ ' + bgCss + ', ',
                );
              } else if (/ :style=/.test(best.full)) {
                continue; // 非对象字面量 :style，跳过防破坏
              } else {
                replacement =
                  '<' +
                  best.tag +
                  best.before +
                  'class="' +
                  best.cls +
                  '"' +
                  best.after +
                  ' :style="{ ' +
                  bgCss +
                  ' }">';
              }
              const src = codeResult.files[best.fpath];
              codeResult.files[best.fpath] =
                src.slice(0, best.index) +
                replacement +
                src.slice(best.index + best.full.length);
              mountedCount++;
            }
            if (mountedCount > 0) {
              this.logger.warn(
                `🎯 [mc] bg→父容器强制挂载：${mountedCount} 处（${bgMounts.map((b) => b.mountTarget).join(', ')}）`,
              );
            }
          }
        } catch (n3err) {
          this.logger.warn('N3 bg 挂载失败（非阻断）', {
            error: n3err.message,
          });
        }

        // 🎯 N4 根容器尺寸锚定 + 面板整体背景 —— 已于 2026-08-31 中性化并迁出为共享规则。
        // 旧实现三宗罪（已删，见 validators/code-fix-rules.js 的 anchor-root-container）：
        //  1. 写死 width:Wpx/height:Hpx，违反 root-container.md:13/:27 自家规范
        //    （根容器默认 100%，比例应走 aspect-ratio 真值）；
        //  2. lazy 正则跨进 <template #xxx> 具名插槽，把插槽内装饰元素（如 8×8 菱形
        //    c-monitor-header-diamond）误判为根容器撑爆面板（mc-max-1788258252381-9168ed08）；
        //  3. px 锚定被后续轮次改回 width:100%，拉锯无解（mc-max-1788248984779-862c6b29）。
        // 现由 fixPipeline 的 STYLE 阶段规则 anchor-root-container 接管（中性语义：
        // 已有尺寸不覆盖、缺则补 100%、注入 aspect-ratio 真值比例、panelBg R7 剥离再注入）。
        // N4b 子容器尺寸锚定保留在下方（autoFixNodeSizes 有真值校验口径，非臆造覆盖）。

        // 🎯 N4b 子容器尺寸锚定（2026-09-01 NODE-001 自愈）：把挂载目标容器的
        // width/height 锚定到 figmaBox 真值，消除「LLM 臆造尺寸 → NODE-001 BLOCK →
        // 重试白烧」事故（mc-max-1788248984779-862c6b29：tabs-list 高度 32px，真值 27px）。
        // 复用 node-size-validator 的 autoFixNodeSizes（与 L0-B 校验 validateNodeSizes
        // 同源的 findMatchingClass/extractCssDimensions），零口径漂移。
        try {
          const { autoFixNodeSizes } =
            await import('../utils/node-size-validator.js');
          const mapping = resolveResourceDomMapping(
            resourceDomMapping,
            outputPath,
          );
          const filesArr = Object.entries(codeResult.files).map(
            ([path, content]) => ({ path, content }),
          );
          const sizeFix = autoFixNodeSizes(filesArr, mapping, { tolerance: 2 });
          if (sizeFix.fixed > 0) {
            for (const f of sizeFix.files) {
              codeResult.files[f.path] = f.content;
            }
            this.logger.info(
              `🎯 [mc] 子容器尺寸锚定: ${sizeFix.fixed} 处 → ${sizeFix.fixes.join('；')}`,
            );
          }
        } catch (n4bErr) {
          this.logger.warn('N4b 子容器尺寸锚定失败（非阻断）', {
            error: n4bErr.message,
          });
        }

        // 🎯 N5 白边框剥离（2026-08-25）：挂载了背景图的容器不应再有 border（Figma 描边
        // 被 LLM 误读为 border，如 tabs-list/tab-active-bg 的 0.72px solid #fff → 多余白边框）。
        // 注入目标优先 index.vue 的 <style> 块（始终存在、不依赖 common.less）。
        try {
          const idxPathN5 = 'package/index.vue';
          const lessPathN5 = 'resources/styles/common.less';
          const srcN5 = codeResult.files[idxPathN5];
          const lessSrcN5 = codeResult.files[lessPathN5];
          if (typeof srcN5 === 'string') {
            const bgClasses = new Set();
            const tagReN5 = /<[a-zA-Z][a-zA-Z0-9-]*(?:(?!>).)*?>/g;
            let t;
            while ((t = tagReN5.exec(srcN5)) !== null) {
              if (!/backgroundImage/.test(t[0])) continue;
              const cm = t[0].match(/\bclass="([\w-]+)"/);
              if (cm) bgClasses.add(cm[1]);
            }
            const stripBorderInSource = (s) => {
              if (typeof s !== 'string') return s;
              let fixed = s;
              for (const cls of bgClasses) {
                const re = new RegExp(`(\\.${cls}\\s*\\{)([^}]*)`, 'm');
                fixed = fixed.replace(re, (m, head, body) => {
                  if (!/border/.test(body)) return m;
                  const nb = body
                    .replace(/(^|[\s;])border\s*:[^;}]+\s*;?/g, '$1')
                    .replace(
                      /(^|[\s;])border-(top|right|bottom|left)\s*:[^;}]+\s*;?/g,
                      '$1',
                    );
                  return head + nb;
                });
              }
              return fixed;
            };
            let changed = false;
            // 优先剥离 index.vue <style> 块
            const vm = srcN5.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
            if (vm) {
              const newStyle = stripBorderInSource(vm[1]);
              if (newStyle !== vm[1]) {
                codeResult.files[idxPathN5] = srcN5.replace(
                  vm[0],
                  vm[0].replace(vm[1], newStyle),
                );
                changed = true;
              }
            }
            // 若 common.less 也存在则同步剥离
            if (typeof lessSrcN5 === 'string') {
              const newLess = stripBorderInSource(lessSrcN5);
              if (newLess !== lessSrcN5) {
                codeResult.files[lessPathN5] = newLess;
                changed = true;
              }
            }
            if (changed) {
              this.logger.info('🎯 [mc] 白边框已剥离（背景图容器）');
            }
          }
        } catch (n5err) {
          this.logger.warn('N5 白边框剥离失败（非阻断）', {
            error: n5err.message,
          });
        }
      } catch (postErr) {
        this.logger.warn('mc 确定性后处理失败（非阻断）', {
          error: postErr.message,
        });
      }

      // 2. 写入文件
      const codeFilePaths = Object.keys(codeResult.files || {});
      onProgress?.({
        fileLifecycle: {
          phase: 'writing',
          summary: `正在写入 ${codeFilePaths.length} 个生成文件`,
          files: codeFilePaths.map((path) => ({ path, state: 'writing' })),
        },
      });
      const { written: writtenFiles, skipped: writeSkipped1 } = this.writeFiles(
        codeResult.files,
        outputPath,
      );
      if (writeSkipped1.length > 0) {
        this.logger.warn('⚠️ 首批写盘有文件被跳过', {
          skipped: writeSkipped1,
          count: writeSkipped1.length,
        });
      }
      onProgress?.({
        fileLifecycle: {
          phase: 'writing',
          summary: '生成文件已写入',
          files: codeFilePaths.map((path) => ({ path, state: 'modified' })),
        },
      });

      // 3. 补充标准文件：component.js、declare.js、index.less、主题包装文件（固定模板，不需要AI生成）
      const standardFiles = {
        'component.js': `import component from './package/index.vue'
import './resources/styles/index.css'
export default component
`,
        'resources/styles/index.less':
          this._buildIndexLessTemplate(backgroundBrightness),
        'resources/styles/themes/dark.less': THEME_WRAPPER_TEMPLATES.dark,
        'resources/styles/themes/light.less': THEME_WRAPPER_TEMPLATES.light,
        'declare.js': `import declareConfig from './declare.json'
// 设置微码组件信息
let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig
})
// 导出组件配置信息
export default declareInfo
`,
      };

      const { written: standardWritten, skipped: writeSkipped2 } =
        this.writeFiles(standardFiles, outputPath);
      const allWrittenFiles = [...writtenFiles, ...standardWritten];
      if (writeSkipped2.length > 0) {
        this.logger.warn('⚠️ 标准文件写盘有文件被跳过', {
          skipped: writeSkipped2,
          count: writeSkipped2.length,
        });
      }

      this.logger.info('✅ 已补充标准文件', {
        standardFiles: Object.keys(standardFiles),
        totalFiles: allWrittenFiles.length,
      });

      // 🛡️ P1-4 清洗层（永远最先）：剥离模型输出「夹带」的说明性文本。
      //
      // 为什么必须放在这里：这是修复「时机错位」的关键落点。
      //  - 旧实现把等效清理埋在 _sanitizeFileContent 第 4 步，而该函数只在写盘阶段（writeFiles）调用；
      //  - 判死的语法校验却在生成阶段（下方 validateAndFixGeneratedFiles / validateVueSfc）更早执行；
      //  - 结果：清理永远等不到执行机会，任务在校验阶段就 fail-closed。
      // 实锤：mc-max-1787908432082-62f89b1f —— 模型输出尾巴带「## 生成说明」，其第 7 条含反引号包裹的
      // `<style lang="less" scoped>`，被 SFC 编译器当成真实开标签 → 109:18 Element is missing end tag。
      // 只清洗模型产出（codeResult.files）；standardFiles 由系统生成，无夹带风险。
      let modelFiles = codeResult.files;
      try {
        const { CodeFixPipeline } =
          await import('../validators/code-fix-pipeline.js');
        const { registerBuiltinFixRules } =
          await import('../validators/code-fix-rules.js');
        const cleanPipeline = new CodeFixPipeline({
          logger: this.logger,
          context: { componentName, outputPath },
        });
        // 规则来源统一到 code-fix-rules.js，避免「清洗用一套、修复用另一套」再次分叉
        registerBuiltinFixRules(cleanPipeline, this, {
          componentName,
          outputPath,
          resourceDomMapping: resolveResourceDomMapping(
            resourceDomMapping,
            outputPath,
          ),
          input: params,
        });
        const cleanRes = cleanPipeline.applyCleanOnly(modelFiles, {
          componentName,
          outputPath,
        });
        modelFiles = cleanRes.files;
        if (cleanRes.applied.length > 0) {
          this.logger.warn(
            `🛡️ 清洗层剥离了 ${cleanRes.applied.length} 处模型输出夹带`,
            { detail: cleanRes.applied },
          );
          onProgress?.({
            stage: '代码清洗',
            message: `🧹 已剥离 ${cleanRes.applied.length} 处模型输出夹带（说明性文本）`,
            status: 'warning',
            details: cleanRes.applied,
          });
        }
      } catch (cleanErr) {
        // 清洗失败不阻断：确定性修复是「尽力而为」，残留交由下游校验兜底
        this.logger.warn('清洗层执行失败（非阻断，交由下游校验兜底）', {
          error: cleanErr?.message || String(cleanErr),
        });
      }

      // 🛡️ P1-4 完整确定性修复（清洗之后、校验之前）
      // 跑 STRUCTURE / NAMING / RESOURCE / STYLE / POLISH 五个阶段：
      //  orphan-jsdoc、双 c- 坍缩、裸键引号、实例 ID 前缀剥离、资源挂载兜底、
      //  样式 import 保障、背景图尺寸、头部插槽、base-panel 外壳泄漏剥离、子组件接线。
      // 这些原是散落在 generateCode 各处的裸调用，现统一由 CodeFixPipeline 按阶段调度。
      // 全部规则幂等，与既有调用点重复执行结果一致——这是零回归风险的迁移方式。
      try {
        const { CodeFixPipeline } =
          await import('../validators/code-fix-pipeline.js');
        const { registerBuiltinFixRules } =
          await import('../validators/code-fix-rules.js');
        const fixPipeline = new CodeFixPipeline({
          logger: this.logger,
          context: { componentName, outputPath },
        });
        // 注入竖排文字检测器（供 ensure-vertical-text-writing-mode 规则使用）。
        // 只注入一次，后续复用；检测器为纯函数，无状态。
        if (typeof this._verticalTextDetector !== 'function') {
          const { detectVerticalText } =
            await import('../utils/text-trait-detector.js');
          this._verticalTextDetector = detectVerticalText;
        }
        registerBuiltinFixRules(fixPipeline, this, {
          componentName,
          outputPath,
          resourceDomMapping: resolveResourceDomMapping(
            resourceDomMapping,
            outputPath,
          ),
          figmaNodeData,
          sectionHeights: this._buildSectionHeightsMap(
            modelFiles,
            layoutStructure,
            params,
          ),
          // 🛡️ 删减法批次 3 loop 3a（2026-09-14）：布局事实单一事实源（display/gridColumns/
          // flexDirection/flexGrow），供 fix-section-heights 规则⑤ 确定性写出布局 block ——
          // 取代 healGridContainer/ensureGridDisplay 的事后猜测修补。
          sectionLayoutFacts: buildSectionLayoutFacts(
            modelFiles,
            layoutStructure,
            params,
          ),
          // 🛡️ R1-2：布局事实（fix-section-heights 规则②豁免依据，退役命名枚举）
          rootLayoutFacts,
          input: params,
        });
        const fixRes = fixPipeline.apply(modelFiles, {
          componentName,
          outputPath,
        });
        modelFiles = fixRes.files;
        if (fixRes.applied.length > 0) {
          const byPhase = fixRes.applied.reduce((acc, a) => {
            acc[a.phase] = (acc[a.phase] || 0) + 1;
            return acc;
          }, {});
          this.logger.info(`🛡️ 确定性修复完成（${fixRes.applied.length} 处）`, {
            byPhase,
          });
          onProgress?.({
            stage: '确定性修复',
            message: `🔧 已应用 ${fixRes.applied.length} 处确定性修复`,
            status: 'warning',
            details: fixRes.applied,
          });
        }
      } catch (fixErr) {
        this.logger.warn('确定性修复执行失败（非阻断，交由下游校验兜底）', {
          error: fixErr?.message || String(fixErr),
        });
      }

      const allFiles = { ...modelFiles, ...standardFiles };
      if (process.env.DEBUG_STOP_AFTER_STEP3 === 'true') {
        this.logger.warn('🛑 DEBUG_STOP_AFTER_STEP3 已触发：在标准文件补充后停止，跳过后续校验/修复/写盘/预览', {
          componentName,
          outputPath,
          fileCount: Object.keys(allFiles).length,
        });
        return {
          success: false,
          files: allFiles,
          generatedFiles: allFiles,
          autoFixes: codeResult.autoFixes || [],
          degradedFiles: codeResult.degradedFiles || [],
        };
      }

      // 🏢 一体化平台文件生成（mc-only，vue3 不要求；2026-08-30）
      // 补齐 M2-3（css-vars.js）/ M4-1/4-2（declare.js 带 cssVars）/ M4-3（component.js），
      // 由确定性模板生成，不依赖 LLM；M2-2 预览图仍由前端/人工补。
      // ⚠️ 必须覆盖 standardFiles 同名文件：standardFiles.declare.js 是旧格式（无 cssVars，
      // M4-2 检查失败），component.js 是 import index.css 版——一体化规范版优先级更高。
      if (this.componentType === 'microcode') {
        try {
          // 🛡️ 2026-09-03 修复：原调用传入未定义变量 componentId → ReferenceError
          // 被下方 catch 非阻断吞掉，全天 21 次生成全部静默失败（css-vars.js 从未落盘、
          // declare.js 停在旧格式无 cssVars）。buildDeclareJsFile 已改为从 declareConfig
          // 读 componentId，无需再传。
          // 🎨 styleTokens 契约接入（utils/style-tokens.js，双轨制）：
          // dark 槽位 = 枚举三核心 + 设计变量轨（原 UI 深色时 Figma 深色真值自定义变量）；
          // light 槽位 = Figma 提取（浅色稿）或派生算法（深色稿）。
          const { buildStyleTokens } =
            await import('../utils/style-tokens.js');
          const styleTokens = buildStyleTokens(
            { figmaNodeData, backgroundBrightness },
            { logger: this.logger },
          );
          // 供下游 declare.json 归一（cssVariableConfig 双向声明 / themeConfig 兜底）
          // 与 validator 事件对齐使用——单一事实源，随本次生成上下文刷新。
          this._lastStyleTokens = styleTokens;
          const mcPlatformFiles = microcodeWriter.buildMcPlatformFiles({
            fontSize: '12',
            styleTokens,
          });
          for (const [p, c] of Object.entries(mcPlatformFiles)) {
            allFiles[p] = c;
          }
          this.logger.info(
            '🏢 已生成一体化平台文件（css-vars.js/declare.js/component.js）',
            {
              files: Object.keys(mcPlatformFiles),
            },
          );
        } catch (pfErr) {
          this.logger.warn('🏢 一体化平台文件生成失败（非阻断）', {
            error: pfErr?.message || String(pfErr),
          });
        }
      }

      // 🔁 层② 反转（2026-09-11）：原「③ Props 接线确定性自愈（autoWireSubComponentProps）」整块移除。
      // 移除原因：该自愈是为旧 P0/D 契约（资源归主组件、子组件 defineProps 接收 + 父透传）服务的
      // 兜底——父组件漏传 props 时确定性补 `:prop="prop"`。反转后子组件各自 import 资源、不再声明
      // 资源 props，CODE-019 检测面归零，自愈已无对象；保留反而会往系统生成的子组件标签上塞多余
      // 属性（层① 生成的 <TabsSection /> 不带 props）。

      // 🔍 4. 验证和修复生成的文件（防止反复出现相同错误）
      const allFilePaths = Object.keys(allFiles);
      onProgress?.({
        fileLifecycle: {
          phase: 'validating',
          summary: '正在校验生成文件（语义 / SFC / LESS）',
          files: allFilePaths.map((path) => ({ path, state: 'validating' })),
        },
      });
      const { fixedFiles, fixes } = await this.validateAndFixGeneratedFiles(
        allFiles,
        componentName,
        outputPath,
        backgroundBrightness,
        compDisplayName,
        figmaNodeData,
      );

      // 🛡️ 合并分块阶段自动修复记录（TAIL-GARBAGE 尾部垃圾剥离 / P1-4 坏文件隔离降级）。
      // 这些修复发生在 generateCode 内，此前因 generateCode 无 fixes 变量而只能丢弃
      // （更糟：引用未声明变量会直接 ReferenceError）。合并后统一走 autoFixes 上报前端。
      if (
        Array.isArray(codeResult.autoFixes) &&
        codeResult.autoFixes.length > 0
      ) {
        fixes.push(...codeResult.autoFixes);
      }

      // 🛡️ P1-6 视觉真值校验（2026-08-28）：拿 Figma 设计值约束产物样式。
      // LLM 生成的间距/圆角/装饰此前全凭臆测，无真值校验 → 组件"能跑但不好看"。
      // 实锤（mv-max-1787908524561-75ed1f2d）：根容器自加 box-shadow 变"浮起卡片"、
      // .monitor-tabs 显式 gap:0 使 tab 紧贴、tab 圆角 2px 远小于设计 29px。
      // 仅告警不阻断（WARN 级）：视觉偏差不该让已生成的成果 fail-closed。
      try {
        const mergedForVisual = { ...allFiles, ...(fixedFiles || {}) };
        const { validateVisualTruth } =
          await import('../validators/visual-truth-validator.js');
        const visualRes = validateVisualTruth(figmaNodeData, mergedForVisual);
        if (visualRes.issues.length > 0) {
          this.logger.warn(
            `⚠️ 视觉真值校验发现 ${visualRes.issues.length} 处偏差`,
            { issues: visualRes.issues.map((i) => `${i.id}: ${i.message}`) },
          );
          fixes.push(
            ...visualRes.issues.map((i) => `${i.id}（视觉偏差）: ${i.message}`),
          );
          onProgress?.({
            stage: '视觉真值校验',
            message: `⚠️ ${visualRes.issues.length} 处样式与 Figma 设计值存在偏差`,
            status: 'warning',
            details: visualRes.issues,
          });
        }
      } catch (visualErr) {
        // 视觉校验失败不阻断主流程
        this.logger.warn('视觉真值校验执行失败（非阻断）', {
          error: visualErr?.message || String(visualErr),
        });
      }

      // 校验结果：命中确定性修复的文件标记 failed（即将被重写），其余 passed
      const failedPaths = new Set(Object.keys(fixedFiles || {}));
      onProgress?.({
        fileLifecycle: {
          phase: 'validating',
          summary:
            fixes.length > 0
              ? `校验发现 ${fixes.length} 处需自动修复`
              : '文件校验通过',
          files: allFilePaths.map((path) => ({
            path,
            state: failedPaths.has(path) ? 'failed' : 'passed',
          })),
        },
      });

      // 🛡️ 修复 2.1（锁定终态）：会话已锁定（用户点「满意，锁定此版本」）→ 跳过覆写落盘，
      // 保留已发布到 workspace 的好快照，不被 fixedFiles 覆写改坏。跳过仍保持变量有值，
      // 后续收尾逻辑（component-meta 留痕等）不因 undefined 报错。
      const _lockedForFix = isSessionLocked(ctx?.sessionId);
      if (_lockedForFix) {
        this.logger.info('🔒 会话已锁定，跳过覆写落盘（保留已发布版本）', {
          sessionId: ctx?.sessionId,
        });
      }
      const { written: fixWritten, skipped: fixSkipped } = _lockedForFix
        ? { written: [], skipped: [] }
        : this.writeFiles(fixedFiles, outputPath);
      if (fixSkipped.length > 0) {
        this.logger.warn('⚠️ 修复文件写盘有文件被跳过', {
          skipped: fixSkipped,
          count: fixSkipped.length,
        });
      }
      this.logger.info('✅ 修复文件写入完成', {
        written: fixWritten.length,
        skipped: fixSkipped.length,
      });

      // 🔒 R1（2026-09-01）：内存 files map 单一事实源——统一终态落盘。
      // 此前的三个分叉点：P1-4 清洗/确定性修复只改内存不落盘（仅 fixedFiles 二次落盘）、
      // buildMcPlatformFiles 只合内存（磁盘 declare.js 停在 standardFiles 旧格式）、
      // writeFiles 自愈只写磁盘不回写内存 → workspace / candidate / 磁盘三方分叉。
      // 此处把最终事实（allFiles + fixedFiles）一次性落盘：writeFiles 自愈幂等（不会二次改动），
      // 且自带用户编辑保护（isUserPatched 跳过不覆盖）。候选快照与 workspace 从此同内容。
      const finalTruthFiles = { ...allFiles, ...fixedFiles };
      // 🛡️ 资源 import 终验兜底注入（落盘前，2026-09-02 事故 mc-max-1788330634941-53e4d387）：
      // CODE-018「子组件资源依赖缺失」确定性复现的根因——generateCode 内注入（约 1725 行）成功补了
      // bg1 import，但后续 CodeFixPipeline / validateAndFixGeneratedFiles 产出的 fixedFiles 覆盖了
      // 注入后的子组件，导致最终落盘缺 bg1 import → L0-B 误报 CODE-018 → 全量重写 3 轮空转、
      // 「好的改坏」。LLM 重试无法修复「系统注入被覆盖」的问题，故在最终事实源落盘前再做一次
      // 幂等兜底注入（injectResourceImports 只补缺失 import、绝不删已有内容，零回归风险）。
      const _finalMapping = resolveResourceDomMapping(
        resourceDomMapping,
        outputPath,
      );
      if (Array.isArray(_finalMapping) && _finalMapping.length > 0) {
        for (const [fp, fc] of Object.entries(finalTruthFiles)) {
          if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
          const relBase = /^package\/components\//.test(fp)
            ? '../../resources/images/'
            : '../resources/images/';
          // 🔁 层② 反转（2026-09-11）：落盘终验兜底不再按契约注入主组件 import。资源归各自组件
          // 本地持有，主/子组件统一走默认分支（仅补模板实际引用而缺失的资源 import，幂等只补不删）。
          const injected = injectResourceImports(
            fc,
            _finalMapping,
            relBase,
          );
          if (injected !== fc) {
            finalTruthFiles[fp] = injected;
            this.logger.info('🛡️ 资源 import 终验兜底注入（落盘前）', {
              file: fp,
            });
          }
        }
      }
      // 🛡️ 修复 B（运行库 import 兜底，2026-09-02）：资源 import 终验之后、落盘之前，
      // 幂等补齐 vue/echarts 运行库 import（fixedFiles 覆写可能丢 vue/echarts → 预览 echarts is not defined）。
      // 纯函数只补缺失、绝不删已有，零回归；且放在资源兜底之后，确保二者叠加后 import 完整。
      for (const [fp, fc] of Object.entries(finalTruthFiles)) {
        if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
        const ensured = ensureRuntimeLibraryImports(fc);
        if (ensured !== fc) {
          finalTruthFiles[fp] = ensured;
          this.logger.info('🛡️ 运行库 import 兜底补齐（落盘前）', { file: fp });
        }
      }
      // 🛡️ CODE-022 修复器（2026-09-11 根治方案 R3-2）：未挂载的资源 import 确定性删除。
      // LLM 偶发「import bg1 后 0 处引用」→ CODE-022 BLOCK → 重试常犯同一错 → 耗尽。
      // 确定性自愈优先于重试；放在运行库 import 兜底之后、FLEX 归一之前（同为幂等纯函数）。
      {
        const _pruneMapping = resolveResourceDomMapping(
          resourceDomMapping,
          outputPath,
        );
        if (Array.isArray(_pruneMapping) && _pruneMapping.length > 0) {
          for (const [fp, fc] of Object.entries(finalTruthFiles)) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            try {
              const _pr = pruneUnmountedResourceImports(fc, _pruneMapping);
              if (_pr.changed) {
                finalTruthFiles[fp] = _pr.content;
                this.logger.warn('🛡️ CODE-022 修复：删除未挂载的资源 import', {
                  file: fp,
                  pruned: _pr.pruned,
                });
              }
            } catch (prErr) {
              this.logger.warn('🛡️ CODE-022 修复器异常（非阻断）', {
                file: fp,
                error: prErr?.message || String(prErr),
              });
            }
          }
        }
      }
      // 🛡️ FLEX-003 确定性归一（2026-09-02，mc-max-1788362388732-1ae956dc 重试耗尽）：
      // 同一 class 跨文件 flex grow 量纲冲突（scoped 像素量级 vs common.less 比例量级）时，
      // 把比例量级那份对齐到像素量级（规范 `flex: <Figma高度px> 1 0`）。LLM 重试反复犯同一
      // 错误（冗余写死样式 + 量纲误写），系统必须归一，否则 FLEX-003 每轮 BLOCK → 重试必耗尽。
      const _flexFilesArr = Object.entries(finalTruthFiles).map(
        ([path, content]) => ({ path, content }),
      );
      const _flexNormalized = normalizeFlexSourceConflicts(_flexFilesArr);
      if (_flexNormalized !== _flexFilesArr) {
        let _flexNormCount = 0;
        for (const nf of _flexNormalized) {
          const prev = finalTruthFiles[nf.path];
          if (prev !== undefined && prev !== nf.content) {
            finalTruthFiles[nf.path] = nf.content;
            _flexNormCount++;
          }
        }
        if (_flexNormCount > 0) {
          this.logger.info('🛡️ FLEX-003 量纲归一（落盘前）', {
            files: _flexNormCount,
          });
        }
      }
      // 🛡️ FLEX-005 确定性归一（2026-09-03，mc-max-1788373364090 重试耗尽）：
      // 不同兄弟 class 之间量纲混用（SummaryCards flex:1 比例 vs TabAndContent flex:317 像素）。
      // LLM 拿不到 section Figma 高度真值（vision section 无 absoluteBoundingBox.height），
      // 重试确定性复现 flex:1 vs flex:317 → FLEX-005 每轮 BLOCK → 重试耗尽。此处把像素量级
      // 兄弟统一改写为 flex:1 1 0（等分近似），消除混用，避免耗尽与像素 section 独占 90% 高度。
      const _flexSiblingArr = Object.entries(finalTruthFiles).map(
        ([path, content]) => ({ path, content }),
      );
      const _flexSiblingNormalized = normalizeFlexSiblingScale(_flexSiblingArr);
      if (_flexSiblingNormalized !== _flexSiblingArr) {
        let _sibNormCount = 0;
        for (const nf of _flexSiblingNormalized) {
          const prev = finalTruthFiles[nf.path];
          if (prev !== undefined && prev !== nf.content) {
            finalTruthFiles[nf.path] = nf.content;
            _sibNormCount++;
          }
        }
        if (_sibNormCount > 0) {
          this.logger.info('🛡️ FLEX-005 量纲归一（落盘前，统一到比例量级）', {
            files: _sibNormCount,
          });
        }
      }
      // 🛡️ 层①配套（2026-09-11 · c-device-monitor-1fduq67s 实锤）：子组件 import 落盘终验兜底。
      // 后处理/AI 修复可能重写 index.vue script 并丢掉子组件 import（实测：模板 4 个标签只剩
      // 1 个 import，其余 3 个文件已生成但引用悬空 → 渲染断裂）。语义门禁对子组件标签是白名单
      // 放行（_finalSubCompTags），拦不住此类悬空 → 必须在落盘前确定性幂等补齐（ensureSubComponentImport
      // 只补模板已引用标签的缺失 import，绝不删除已有内容）。文件存在性由批 5+ 的标签并入清单保证。
      {
        const _idxPath = 'package/index.vue';
        const _idxContent = finalTruthFiles[_idxPath];
        if (typeof _idxContent === 'string' && _idxContent) {
          const _ensured = this._ensureSubComponentImport(_idxContent);
          if (_ensured !== _idxContent) {
            finalTruthFiles[_idxPath] = _ensured;
            this.logger.warn('🛡️ 子组件 import 终验兜底（模板标签→import 幂等补齐）', {
              file: _idxPath,
            });
          }
        }
      }
      // 🛡️ 层③（2026-09-11）：模板类名统一补前缀（CODE-020 确定性自愈，落盘前）。
      // 判据与 findUndefinedComponentClasses 严格同口径（后缀命中才改写，取最短候选），LLM 重试
      // 反复犯同一漏前缀错误 → 系统直接归一，否则 CODE-020 每轮 BLOCK → 重试必耗尽。
      {
        const _clsArr = Object.entries(finalTruthFiles).map(
          ([path, content]) => ({ path, content }),
        );
        const _clsFixed = fixMissingClassPrefixes(_clsArr, {
          // 🛡️ P1.3：DOM 类事实作为唯一判据（修「修饰符类前缀不一致」）
          classFacts: collectClassFacts(_clsArr),
        });
        if (_clsFixed.fixes.length > 0) {
          for (const nf of _clsFixed.files) {
            const prev = finalTruthFiles[nf.path];
            if (prev !== undefined && prev !== nf.content) {
              finalTruthFiles[nf.path] = nf.content;
            }
          }
          this.logger.warn('🛡️ CODE-020 模板类名统一补前缀（落盘前）', {
            fixes: _clsFixed.fixes.slice(0, 20),
          });
        }
      }
      // 🛡️ 治本（2026-09-11 · c-env-monitor-xh8jdcpy-2aa25837 复发实锤）：内容根容器高度归一。
      // 宿主 .pannel-content 是 block（无 display:flex），内容根（-slot-con / -root）的
      // flex:1 1 0 必然失效 → 图表区 flex:1 min-height:0 拿到 0 → 「只有上面一部分」。
      // 规则②豁免只防「height:100% 被改写」这一条来源，LLM 直写 flex:1 1 0 防不住 →
      // 落盘前统一归一为 height:100%（规则②豁免 + 本归一器双防）。
      {
        const _rootArr = Object.entries(finalTruthFiles).map(
          ([path, content]) => ({ path, content }),
        );
        const _rootNorm = normalizeRootContainerLayout(_rootArr, {
          logger: this.logger,
          // 🛡️ P2-1 时序治理（2026-09-11）：figma bbox 有效时终验链补 aspect-ratio ——
          // fix pipeline 中 anchor 对 common.less 的补丁会被 writeFiles 出口的
          // consolidateSubComponentClasses 等产物重建类步骤覆盖，布局修复必须在
          // 写盘前最后一刻重跑（I4 不变量终验兜底）。
          figmaNodeData,
          // 🛡️ R1-2：根容器类改读 facts（确定性模板单一事实源），命名猜测降为兜底
          rootLayoutFacts,
        });
        if (_rootNorm.fixes.length > 0) {
          for (const nf of _rootNorm.files) {
            const prev = finalTruthFiles[nf.path];
            if (prev !== undefined && prev !== nf.content) {
              finalTruthFiles[nf.path] = nf.content;
            }
          }
        }
      }
      // 🛡️ 修复 B（覆写后重校验，2026-09-02）：fixedFiles 覆写可能引入语义问题（模板引用未声明变量/
      // 自由变量/TDZ），此前语义校验跑在覆写前、覆写后的坏版本零拦截。此处对终态 .vue 重跑语义校验，
      // 命中 issue 则回退到覆写前版本（allFiles，已通过门禁的好版本）并告警，杜绝坏版本落盘。
      let _revertedSemanticFiles = 0;
      for (const [fp, fc] of Object.entries(finalTruthFiles)) {
        if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
        const _sem = validateVueScriptSemantics(fc, fp, {});
        if (_sem.issues && _sem.issues.length > 0) {
          const _before = allFiles[fp];
          if (typeof _before === 'string' && _before !== fc) {
            finalTruthFiles[fp] = _before;
            _revertedSemanticFiles++;
            this.logger.warn('🛡️ 覆写后语义校验命中，回退覆写前版本', {
              file: fp,
              issues: _sem.issues.slice(0, 5),
            });
          }
        }
      }
      if (_revertedSemanticFiles > 0) {
        this.logger.warn(
          '⚠️ 覆写后重校验：回退 ' + _revertedSemanticFiles + ' 个坏文件',
        );
      }
      // 🛡️ 修复 2.1（锁定终态）：会话已锁定 → 跳过统一终态落盘，保留已发布版本。
      // 跳过仍保持 finalTruthWritten/Skipped 有值，后续 component-meta 留痕不报错。
      const _lockedForFinal = isSessionLocked(ctx?.sessionId);
      if (_lockedForFinal) {
        this.logger.info('🔒 会话已锁定，跳过统一终态落盘（保留已发布版本）', {
          sessionId: ctx?.sessionId,
        });
      }
      // 🛡️ Loop 4 双裁判门禁接入（落盘前最后一道硬门禁）：
      // 从最终事实源（finalTruthFiles）反推 Working Manifest，跑 manifest-auditor。
      //  - 无 Golden（活流量）：只跑 auditSelfConsistency（契约声明即写入，verifyProduct 口径），
      //    确定性、不误杀（audit(null) 会把每个资源判臆造而全量 BLOCK，故禁用）。
      //  - 有 Golden（this.goldenManifest 由外部重建/CI 注入，与活流量零耦合）：
      //    跑完整 audit（structural/resource/contract 三类 BLOCK）+ 产物 verifyProduct。
      //  默认仅 WARN 记录（不打断正在测试的流程）；MANIFEST_AUDIT_ENFORCE=1 升级为 BLOCK（fail-closed，拒绝落盘）。
      //  注：门禁自身异常（审计器故障）不视为业务阻断 → 捕获后仅告警，避免门禁 bug 拖垮生成。
      let _auditBlocked = false
      try {
        const _auditWorking = {
          ...(codeResult?.workingManifest || workingManifest || { contracts: [] }),
          contracts:
            codeResult?.workingManifest?.contracts ||
            workingManifest?.contracts ||
            [],
        }
        const _enforce = process.env.MANIFEST_AUDIT_ENFORCE === '1'
        const _auditResult = this.goldenManifest
          ? auditManifest(this.goldenManifest, _auditWorking, finalTruthFiles)
          : auditSelfConsistency(_auditWorking, finalTruthFiles)
        if (_auditResult && _auditResult.issues.length > 0) {
          const _sev = _enforce ? 'BLOCK' : 'WARN'
          this.logger[_enforce ? 'error' : 'warn'](
            `🛡️ Loop4 双裁判门禁命中 ${_auditResult.summary.blocked} 项阻断 / 共 ${_auditResult.summary.total} 项（${_enforce ? 'ENFORCE=BLOCK' : '默认 WARN，不阻断'}）`,
            { byCode: _auditResult.summary.byCode, enforce: _enforce },
          );
          for (const _iss of _auditResult.issues.slice(0, 12)) {
            this.logger[_enforce ? 'error' : 'warn'](
              `   · [${_sev}] ${_iss.code}: ${_iss.detail}`,
            );
          }
          _auditBlocked = _enforce;
        } else {
          this.logger.info('✅ Loop4 双裁判门禁通过（无阻断项）', {
            golden: Boolean(this.goldenManifest),
          });
        }
      } catch (_auditErr) {
        // 审计器自身异常（非业务 BLOCK）→ 不阻断生成成果，仅告警，避免门禁故障拖垮流程。
        this.logger.warn('⚠️ Loop4 双裁判门禁执行异常（已跳过，不阻断）', {
          error: _auditErr?.message || String(_auditErr),
        });
      }
      if (_auditBlocked) {
        throw new Error(
          'Loop4 双裁判门禁 BLOCK（MANIFEST_AUDIT_ENFORCE=1）：拒绝统一终态落盘',
        );
      }

      const { written: finalTruthWritten, skipped: finalTruthSkipped } =
        _lockedForFinal
          ? { written: [], skipped: [] }
          : this.writeFiles(finalTruthFiles, outputPath);
      if (finalTruthSkipped.length > 0) {
        this.logger.warn('⚠️ 统一终态落盘有文件被跳过', {
          skipped: finalTruthSkipped,
          count: finalTruthSkipped.length,
        });
      }
      // 🛡️ R2（2026-09-08 补强）：writeFiles 的写盘门禁自愈（SFC 内嵌 style 括号平衡、
      // Tab UI 骨架注入、style 变量归一化、LESS 变量兜底等）只写磁盘、不回写内存 files map
      // → 磁盘是「自愈后」版本，而 finalTruthFiles（候选快照源）仍是「自愈前」坏版本
      // → 快照预览 LESS 编译失败（mc-max-1788850109464-06cfa312 实锤：index.vue style 漏右大括号，
      // workspace 自愈可看、快照 revision 冻结坏版 → TaskDetail 走快照源空白）。
      // 此处把实际写盘（含自愈）的文件从磁盘回读，回写内存 map，保证「快照 = 磁盘终态」。
      let _healReadbackCount = 0;
      for (const rel of finalTruthWritten) {
        const abs = join(outputPath, rel);
        if (existsSync(abs) && typeof finalTruthFiles[rel] === 'string') {
          try {
            const healed = readFileSync(abs, 'utf-8');
            if (healed !== finalTruthFiles[rel]) {
              finalTruthFiles[rel] = healed;
              _healReadbackCount++;
            }
          } catch (_readbackErr) {
            /* 回读失败保持内存版，快照仍可预览旧版，不阻断 */
          }
        }
      }
      if (_healReadbackCount > 0) {
        this.logger.info('🛡️ 写盘自愈回读：内存已同步磁盘终态（快照不再冻结自愈前坏版）', {
          files: _healReadbackCount,
        });
      }
      this.logger.info('✅ 统一终态落盘完成（内存=磁盘=候选快照同源）', {
        files: finalTruthWritten.length,
      });

      // 🛡️ P1-4 留痕 + 🛡️ D+ 写盘门禁跳过留痕：统一合并落盘 component-meta.json。
      // phase2.service 的候选快照会把根级 component-meta.json 一起收进 snapshot
      // （见 phase2.service.ts 根级标准文件清单），前端据此提示「N 个子组件生成不完整，可二次生成」。
      // D+（2026-08-31）：gateSkippedFiles 是「已生成但被 Vue SFC 写盘门禁跳过」的文件清单，
      // L0-B 读它做 EMPTY_ARTIFACT 成因判定（区分「LLM 未生成」vs「被门禁跳过」），修复指导不再指错方向。
      const degradedFiles = Array.isArray(codeResult.degradedFiles)
        ? codeResult.degradedFiles.filter(Boolean)
        : [];
      const gateSkippedFiles = [
        ...new Set([
          ...writeSkipped1,
          ...writeSkipped2,
          ...fixSkipped,
          ...finalTruthSkipped,
        ]),
      ].filter(Boolean);
      // 🛡️ R3-B（2026-09-11）：无条件把 codeVersion 写入 component-meta.json —— 让 TaskDetail
      // 可回查「这份产物是哪个 dist/git 生成的」，杜绝「旧 dist 产物被当成新代码效果」的误判。
      // 降级/门禁跳过字段仍按条件写（只在发生时才追加），codeVersion 恒写。
      if (outputPath) {
        try {
          const metaPath = join(outputPath, 'component-meta.json');
          let prevMeta = {};
          try {
            prevMeta = existsSync(metaPath)
              ? JSON.parse(readFileSync(metaPath, 'utf-8'))
              : {};
          } catch (_) {
            /* 旧 meta 损坏则重建 */
          }
          const { gitHash, distBuildAt } = getBuildVersion();
          const nextMeta = {
            ...prevMeta,
            codeVersion: {
              gitHash,
              distBuildAt,
              writtenAt: Date.now(),
            },
            ...(degradedFiles.length > 0
              ? {
                  degradedFiles,
                  degradedAt: Date.now(),
                  reason: 'SFC 编译失败，已隔离降级（可二次生成）',
                }
              : {}),
            ...(gateSkippedFiles.length > 0
              ? {
                  gateSkippedFiles,
                  gateSkippedAt: Date.now(),
                  gateSkipReason:
                    'Vue SFC 写盘门禁失败（validateVueSfc），文件未落盘',
                }
              : {}),
          };
          writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2), 'utf-8');
          if (degradedFiles.length > 0 || gateSkippedFiles.length > 0) {
            this.logger.warn('🩹 P1-4/D+ 降级与门禁跳过留痕已写入 component-meta.json', {
              degradedFiles: degradedFiles.length,
              gateSkippedFiles: gateSkippedFiles.length,
              codeVersion: { gitHash, distBuildAt },
            });
          }
        } catch (metaErr) {
          this.logger.warn('⚠️ component-meta.json 写入失败（非阻断）', {
            error: metaErr?.message || String(metaErr),
          });
        }
      }

      // 5. 编译 index.less → index.css（Vite 会拦截 custom-components 下的 .less 文件，必须用 .css）
      // CSS url() 只做非阻断告警：不改变生成样式，不因历史相对路径写法误杀组件。
      const cssResourceAudit = validateCssUrlsInWorkspace(outputPath, {
        logger: this.logger,
        failOnMissing: false,
      });
      if (cssResourceAudit.errors.length > 0) {
        this.logger.warn('⚠️ 生成后 CSS 资源路径审计发现问题（非阻断）', {
          checked: cssResourceAudit.checked,
          errors: cssResourceAudit.errors.length,
        });
      }
      try {
        const indexLessPath = join(outputPath, 'resources/styles/index.less');
        if (existsSync(indexLessPath)) {
          const less = await import('less');
          const result = await less.default.render(
            readFileSync(indexLessPath, 'utf-8'),
            {
              paths: [join(outputPath, 'resources/styles')],
              javascriptEnabled: true,
            },
          );
          const indexPath = join(outputPath, 'resources/styles/index.css');
          writeFileSync(indexPath, result.css, 'utf-8');
          this.logger.info('✅ 已编译 index.less → index.css', {
            size: result.css.length,
          });
        }
      } catch (e) {
        this.logger.warn(
          '⚠️ index.less → index.css 编译失败，降级使用 .less 原始文件',
          { error: e.message },
        );
        // 如果编译失败，回退 component.js 的 import 为 .less
        const componentJsPath = join(outputPath, 'component.js');
        writeFileSync(
          componentJsPath,
          `import component from './package/index.vue'
import './resources/styles/index.less'
export default component
`,
        );
      }

      // R1（2026-09-01）：候选快照直接复用统一终态 map（与磁盘同内容，见上方统一落盘）。
      const snapshotFiles = finalTruthFiles;
      // 以磁盘最终版本覆盖可能被 LESS fallback/确定性修复改写的标准文件。
      for (const relativePath of [
        'component.js',
        'resources/styles/index.css',
      ]) {
        const absolutePath = join(outputPath, relativePath);
        if (existsSync(absolutePath))
          snapshotFiles[relativePath] = readFileSync(absolutePath, 'utf-8');
      }

      // 🏢 一体化健康度检查（mc-only，vue3 不要求；2026-08-30）
      // 与 aidocs/frontend-mc-check 口径对齐（M1~M6 38 必须项 + W1~W2 2 警告项）。
      // 仅记录告警，不 fail-closed 阻断（报告类检查，上线前由 mc-check 最终把关）。
      if (this.componentType === 'microcode') {
        try {
          const { checkMcComponent } =
            await import('./microcode/mc-health-validator.js');
          const health = checkMcComponent(snapshotFiles, null, {
            componentType:
              (snapshotFiles['declare.json']
                ? JSON.parse(snapshotFiles['declare.json']).componentType
                : null) || 'business',
          });
          if (health.failed.length > 0) {
            this.logger.warn(
              `🏢 一体化健康度检查：${health.summary.failed} 项未通过`,
              {
                failed: health.failed.map((f) => `${f.id}: ${f.message}`),
              },
            );
            fixes.push(
              `🏢 一体化健康度 ${health.summary.failed} 项未通过：${health.failed
                .slice(0, 5)
                .map((f) => f.id)
                .join(', ')}${health.failed.length > 5 ? '...' : ''}`,
            );
          } else {
            this.logger.info(
              `🏢 一体化健康度检查通过（${health.summary.passed} 项）`,
            );
          }
          if (health.warnings.length > 0) {
            this.logger.warn('🏢 一体化健康度警告', {
              warnings: health.warnings.map((w) => `${w.id}: ${w.message}`),
            });
          }
        } catch (healthErr) {
          this.logger.warn('🏢 一体化健康度检查执行失败（非阻断）', {
            error: healthErr?.message || String(healthErr),
          });
        }
      }

      // 🛡️ R2-2（2026-09-11）：六条产物不变量终验（I1 根高度 / I2 标签↔绑定↔文件 / I3 tabs
      // 唯一 / I4 形态锚定 / I5 类名对齐 / I6 资源挂载）。与 scripts/artifact-invariants.mjs
      // CLI 共用同一实现。报告性校验：error 级违规落日志 + 随任务 result 暴露（前端可见），
      // 不 fail-closed 阻断 —— 悬空标签/内容根塌陷等历史事故形态自此必有可观测记录。
      let _artifactInvariants = null;
      try {
        const { runArtifactInvariants } = await import(
          '../utils/artifact-invariants.js'
        );
        _artifactInvariants = runArtifactInvariants(snapshotFiles, {
          // 🛡️ P1.4：复用生成期类事实（I7 修饰符双向一致的判据基准）
          classFacts: this._classFacts || undefined,
        });
        if (!_artifactInvariants.passed) {
          const _errs = _artifactInvariants.violations.filter(
            (v) => v.severity === 'error',
          );
          this.logger.warn(
            `🛡️ 产物不变量违规：${_errs.length} error / ${
              _artifactInvariants.violations.length - _errs.length
            } warn`,
            {
              violations: _artifactInvariants.violations.slice(0, 20),
            },
          );
        }
      } catch (invErr) {
        this.logger.warn('🛡️ 产物不变量校验执行失败（非阻断）', {
          error: invErr?.message || String(invErr),
        });
      }
      // 标准文件补齐、确定性修复及 LESS 预编译完成后，才暴露完整候选文件组。
      if (typeof onFilesReady === 'function') {
        try {
          await onFilesReady({
            stage: 'microcode-engineer',
            files: snapshotFiles,
          });
        } catch (snapshotError) {
          this.logger.warn(
            `候选代码快照发布失败，不阻断生成主流程：${snapshotError.message}`,
          );
        }
      }
      // 文件组已生成完毕，进入运行时质量门禁阶段
      onProgress?.({
        fileLifecycle: {
          phase: 'completed',
          summary: '文件组已生成完毕，等待运行时质量门禁',
        },
      });

      return {
        files: snapshotFiles,
        generatedFiles: snapshotFiles, // ✅ Phase 1 验证器需要的字段
        writtenFiles: allWrittenFiles,
        componentDir: outputPath, //组件生成路径（用于前端显示）
        componentName, //组件名称（用于前端显示）
        componentStructure: {
          mainComponent: 'package/index.vue',
          subComponents: allWrittenFiles.filter((f) =>
            f.startsWith('package/components/'),
          ),
          styles: allWrittenFiles.filter((f) =>
            f.startsWith('resources/styles/'),
          ),
        },
        autoFixes: fixes, //返回自动修复的问题列表
        degradedScriptParts: codeResult.degradedScriptParts || [], // 🛡️ 脚本子段降级清单（供任务状态/前端「不完整」标签）
        degradedFiles, // 🛡️ P1-4 坏文件隔离降级清单（与 degradedScriptParts 并列，计入统一产物完整度）
        // 🛡️ #10 静默失败降级：gateSkippedFiles 暴露到任务级 result（经 execute → tasks.service 落库）
        // 前端据此展示「N 个文件被写盘门禁跳过」+ 缺失清单，避免静默丢失
        gateSkippedFiles: gateSkippedFiles.length > 0 ? gateSkippedFiles : undefined,
        // 🛡️ R2-2：六条产物不变量结果（violations/passed/summary），供任务 meta 与前端展示
        artifactInvariants: _artifactInvariants || undefined,
        _attributionGuidance: codeResult._attributionGuidance || null, // 🛡️ 资源归属指导（供 graph 写回 state）
      };
    } catch (error) {
      // 🚨 崩溃堆栈追踪（2026-08-30 为排查 Cannot read properties of undefined (reading 'error') 添加）
      this.logger.error('代码生成执行失败', {
        error: error.message,
        errorName: error.name,
        errorStack: error.stack,
        errorCode: error.code,
      });
      throw error;
    }
  }

  /**
   * 解析输出（BaseAgent要求实现）
   */
  parseOutput(rawOutput) {
    return this.parseCodeOutput(rawOutput);
  }
}

// 🛡️ R4 `_imagesRelPrefixFor` 已删（2026-08-31）：唯一调用方是旧 N4 根容器锚定内联块，
// 该块已迁出为 validators/code-fix-rules.js 的 anchor-root-container 规则（复用同语义的
// 模块内 _imagesRelPrefix），此处不再需要重复实现。

/**
 * 🛡️ C 方案：判断某相对路径是否已被用户在 Playground 编辑过（生成应保留用户版本、跳过覆盖）。
 * 清单由 component.service.saveFileContent 写入 outputPath/.user-patch/manifest.json。
 * 模块级函数（非类方法），writeFiles 内同步调用，文件数少、开销可忽略。
 * @param {string} outputPath 组件产物根目录
 * @param {string} relativePath 待写相对路径（如 package/components/DailyTotal.vue）
 * @returns {boolean} 是否被用户编辑过（应跳过生成覆盖）
 */
function isUserPatched(outputPath, relativePath) {
  try {
    const p = join(outputPath, '.user-patch', 'manifest.json');
    if (!existsSync(p)) return false;
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(parsed?.files) && parsed.files.includes(relativePath);
  } catch {
    return false;
  }
}
