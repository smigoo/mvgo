/**
 * Vue3 Engineer - 普通 Vue3 组件代码生成器（C2/C3 新管线）
 *
 * 与微码工程师（microcode-engineer）的差异：
 * 1. 面板头部与背景 **真实还原**（微码流程为接入宿主 base-panel 而剥离头部/背景）
 * 2. 产物是标准 Vue3 组件包：<template> + <script setup>(JS) + <style lang="less" scoped">
 *    主组件 package/index.vue + 子组件 package/components/*.vue（按功能拆分）
 *    + 共享样式 resources/styles/{index,common,theme-vars}.less（仿微码 less 结构）
 *    **不含** declare.json / component.js / base-panel / $mcComponentBuilder / runtimeBuilder
 * 3. 复用父类的分块调用、截断重试、分隔符解析、文件写盘、资源 import 注入能力
 *
 * 设计参考：VUE3-GENERATION-DESIGN.md §2/§3/§4
 */

import { MicrocodeEngineer } from './microcode-engineer.js';
// P1-Slice2（增量补丁式更新）：分块快照推送器 —— 先合并再推送，杜绝并行 worker 交错导致快照回退
import { pushChunkSnapshot } from './microcode/chunk-snapshot-pusher.js';
import * as microcodeHealer from './microcode/code-healer.js';
import { validateVueSfc } from '../utils/sfc-syntax-validation.js';
import { backendRoot } from '../../config/backend-root.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../logger/index.js';
import {
  sanitizeVueStyleBlock,
  sanitizeCssContent,
} from '../utils/css-sanitizer.js';
import {
  resolveResourceDomMapping,
  injectVue3ResourceUrls,
  healPropImageFallbacks,
  filterAvailableResources,
} from '../utils/resource-import-guard.js';
import {
  validateResourceAttribution,
  generateAttributionGuidance,
} from '../validators/resource-attribution-validator.js';
import { buildResourceManifest } from '../utils/resource-manifest.js';
import { inferChartMinHeight } from '../utils/post-process.js';
import { assessNumericLiteralRewrite } from '../utils/numeric-literal-guard.js';
import { resolveEchartsType, normalizeSeriesInSource, normalizeChartAxesInSource } from '../utils/chart-type-guard.js';
import { stripLlmTailGarbage } from '../utils/llm-tail-garbage.js';
import { normalizeFlexSourceConflicts } from '../utils/flex-sibling-guard.js';
// 🧩 Vue3 拆分模块（2026-08-30：prompt / healer / style-entry 纯函数化，主类改委托壳）
import {
  buildVue3CodePrompt,
  buildVue3TrustGuidance,
  buildVue3ChunkMiddle,
  buildVue3TemplateMiddle,
  buildVue3ScriptMiddle,
  buildVue3StyleMiddle,
} from './microcode/vue3-prompt.js';
import {
  wrapBareConstWithRef as _wrapBareConstWithRef,
  sanitizeVue3FileContent,
  fixLlmTokenizationErrors as _fixLlmTokenizationErrors,
  normalizeVue3StyleImportPath as _normalizeVue3StyleImportPath,
  extractVue3SfcBlock,
  dedupImportsByLocalName as _dedupImportsByLocalName,
  fixImportSyntax as _fixImportSyntax,
} from './microcode/vue3-healer.js';
import {
  ensureVue3StyleEntry as _ensureVue3StyleEntry,
  wireVue3SubComponentImports as _wireVue3SubComponentImports,
  resolveVue3SubComponentPlan as _resolveVue3SubComponentPlan,
  assembleVue3IndexVue as _assembleVue3IndexVue,
} from './microcode/vue3-style-entry.js';
// 🛡️ P0 修复（2026-09-02，mv-max-1788356556816-9986a036）：extractComponentTagNames 漏 import。
// 8-18（61da00f1）本有 import（:24），8-30 拆分重构（15ea74f）把 import 移除、但 generateCode
// 尾部「模板 PascalCase 标签补全子组件清单」（:661）的调用保留 → 裸标识符 ReferenceError。
// 潜伏原因：此前 Vue3 任务先在前置环节失败（onFilesReady，d68b165）或未测 Vue3 路径，
// 修完 onFilesReady 后本轮走到此处才暴露。补回与 61da00f1 同源的 import。
import { extractComponentTagNames } from '../utils/sfc-semantics.js';
// 🎨 styleTokens 契约（1.4）：Vue3 路 theme-vars.less 兜底渲染与微码 css-vars.js 同源
// （微码路在 microcode-engineer.js 用动态 import + _lastStyleTokens 模式；本文件为静态 import，
//   静态导入会被 jest.mock 拦截、便于 spec 断言——勿改回 await import 形态）。
import { buildStyleTokens } from '../utils/style-tokens.js';

export class Vue3Engineer extends MicrocodeEngineer {
  constructor(config = {}) {
    super({ ...config, name: 'vue3-engineer' });
    this.name = 'vue3-engineer';
    // 覆盖父类 logger 标签：继承的父类方法（LLM 调用/写盘等）打印 [vue3-engineer]
    this.logger = createLogger({ name: 'vue3-engineer' });
    this.description = '普通 Vue3 组件代码生成器（面板头部+背景真实还原）';

    //  覆盖父类 componentType，Vue3 需要生成面板外壳（背景、头部、padding、阴影）
    this.componentType = 'vue3';

    // 加载 vue3 规范（skill context 镜像 references/vue3/），加载失败不阻断
    this.vue3Specs = this.loadReferenceFiles([
      'references/vue3/component-development.md',
      'references/vue3/naming-conventions.md',
      'references/vue3/code-quality.md',
      'references/vue3/user-experience.md',
    ]);

    this.logger.info('Vue3 Engineer 已初始化', {
      specsLoaded: Object.keys(this.vue3Specs).length,
    });
  }

  /**
   * L2 后处理：自动将数据型裸 const 转为 ref()
   *
   * 扫描 <script setup> 中的 const 声明，把数组/对象字面量改成 ref() 包裹。
   * 跳过：函数、计算属性、已包裹的 ref/reactive、import 语句等。
   */
  wrapBareConstWithRef(vueContent) {
  return _wrapBareConstWithRef(vueContent, this.logger);
  }

  /**
   * 覆写：Vue3 专属代码生成 prompt（自包含，不引用微码规范）
   * chunkSpec.middle 由各分块 middle builder 提供「任务要求 + 输出格式」段落
   */

  /**
   * 统一解析 subComponentPlan（来自 subcomponent-planner 结构规划阶段）
   * 集中处理「字段缺失 / 类型错误」兜底，避免 buildCodePrompt 与 generateCode 各写一套导致失同步。
   * 返回结构始终含完整字段：
   * - subPlan: 归一化后的 plan（含 effectiveSections / items / isForced / minFiles / reason）
   * - effectiveSections: subPlan.effectiveSections 或空数组
   * - requiredSubComps: subPlan.items 中 isRequired 为真的子组件
   * @param {object} input - 含 subComponentPlan 的输入对象
   * @returns {{ subPlan: object, effectiveSections: Array, requiredSubComps: Array }}
   */
  resolveSubComponentPlan(input) {
  return _resolveVue3SubComponentPlan(input);
  }

  /**
   * 构建上下文裁决约束文本（与 microcode-engineer 对齐）。
   * 从 generationInput 提取 trustVerdict/currentIssues/designFacts，生成 prompt 约束段落。
   */
  _buildTrustGuidance(generationInput) {
  return buildVue3TrustGuidance(generationInput);
  }

  buildCodePrompt(input, chunkSpec) {
  return buildVue3CodePrompt(input, chunkSpec, {
    resolveSubComponentPlan: this.resolveSubComponentPlan.bind(this),
    vue3Specs: this.vue3Specs,
  });
  }

  /**
   * Vue3 整文件分块 middle（默认路径：单批输出完整 SFC）
   */
  _buildVue3ChunkMiddle(chunk) {
  return buildVue3ChunkMiddle(chunk);
  }

  /**
   * Vue3 模板段 middle（降级路径）
   */
  _buildVue3TemplateMiddle(chunk) {
  return buildVue3TemplateMiddle(chunk);
  }

  /**
   * Vue3 脚本段 middle（降级路径）
   */
  _buildVue3ScriptMiddle(chunk) {
  return buildVue3ScriptMiddle(chunk);
  }

  /**
   * Vue3 样式段 middle（降级路径）
   */
  _buildVue3StyleMiddle(chunk) {
  return buildVue3StyleMiddle(chunk);
  }

  /**
   * 覆写：在父类清洗基础上，对 .vue 文件的 <style> 块执行 CSS 专项清洗
   *
   * 父类 _sanitizeFileContent 处理：markdown 围栏、<thinking>、闭合标签后文本、虚假换行
   * 本方法额外处理：<style> 内的分隔符碎片、非法 LLM 评论文本、跨行 @import、大括号闭合
   */
  _sanitizeFileContent(content, filePath = '') {
  return sanitizeVue3FileContent(content, filePath, {
    baseSanitize: super._sanitizeFileContent.bind(this),
    logger: this.logger,
  });
  }

  /**
   * 🛡️ LLM 分词错误修复：修复 AI 生成代码时常见的 token 拆分错误
   *
   * 典型案例：`formatter` 被拆成 `for matter`，导致 vue/compiler-sfc 报
   * "Unexpected keyword 'for'"。这是因为 LLM 在生成对象字面量 key 时，
   * 把 `formatter` 拆成了 `for matter`（两个 token）。
   *
   * 本方法使用正则匹配已知的错误模式并自动修复。
   */
  _fixLlmTokenizationErrors(code) {
  return _fixLlmTokenizationErrors(code, this.logger);
  }

  /**
   * Vue3 workspace 保持 package/ 与根 resources/ 目录：
   * package/index.vue 到 resources/ 退一级，package/components/*.vue 退两级。
   * 写盘前按 SFC 所在深度归一化共享样式路径。
   */
  _normalizeVue3StyleImportPath(content, filePath = '') {
  return _normalizeVue3StyleImportPath(content, filePath);
  }

  /**
   * 覆写：Vue3 拼装（真实 style 段，而非微码固定 @import 模板）
   */
  // 🛡️ 从某段内容中按块类型抽取唯一 SFC 块。
  // 容忍段间泄漏：三段降级路径里 script/style 段的 contextFiles 携带了完整 template，
  // LLM 可能在 script/style 段顺手生成整文件（含第二个 <template>），导致写盘门禁报
  // "SFC can contain only one <template> element"。这里按块类型抽取并唯一化。
  // 对嵌套 <template>（如 <template v-for>）做平衡匹配，避免截断根模板。
  _extractSfcBlock(content, tag) {
  return extractVue3SfcBlock(content, tag);
  }

  _assembleVue3IndexVue(
    templateContent,
    scriptContent,
    styleContent,
    input = {},
  ) {
  return _assembleVue3IndexVue(templateContent, scriptContent, styleContent, input, {
    postProcessIndexVue: this._postProcessIndexVue.bind(this),
  });
  }

  /**
   * 覆写：Vue3 简化分块生成流
   * 默认单批整文件；截断则降级 template → script → style 三段拼装；子组件按 import 检测补生成
   */
  async generateCode(input) {
    // 📡 明确标识：vue3 任务即使复用微码的 runChunk/子组件裁剪基础设施，入口先打 vue3 标记，
    // 让用户在日志中能立刻区分这是 Vue3 任务（chunk 级 [microcode-engineer] 前缀是已知的
    // 继承式 logger 标签泄露，需要把微码 logger 改造为实例 logger 才能彻底解决，单独 P2 跟进）。
    this.logger.info('🟢 [vue3-engineer] 开始生成 Vue3 组件代码', {
      componentName: input.componentName,
      target: input.target,
    });

    const {
      _l0CodeRetryGuidance,
      techStackHints,
      _selfOptimization,
      targetFiles,
      reviseTarget,
      outputPath,
      previousCritiques,
      // 🛡️ P0 修复（2026-09-02，mv-max-1788352276525-bdfe875b）：vue3 generateCode 覆写层此前漏解构
      // onFilesReady，而下方 runChunk 在 P1-Slice2（d68b165，09-02 17:02）把旧的 `typeof onFilesReady ===
      // 'function'` 安全守卫改成裸传 `onFilesReady` → 整文件截断降级三段生成、任一分块产出文件走到
      // pushChunkSnapshot 时，读取未声明裸标识符抛 ReferenceError「onFilesReady is not defined」。
      // 与 microcode 基类（microcode-engineer.js:4521 `onFilesReady = null`）对齐；pushChunkSnapshot
      // 内部对非函数值安全跳过（chunk-snapshot-pusher.js:95）。
      onFilesReady = null, //  完整 files map 候选快照回调（graph 已传 state.onFilesReady，见 mc-component-graph-vue3.js:744）
    } = input;

    // 强制子组件清单（来自结构规划阶段 subcomponent-planner）—— 统一由 resolveSubComponentPlan 解析
    const {
      subPlan,
      effectiveSections,
      requiredSubComps,
      internalSubcomponents,
    } = this.resolveSubComponentPlan(input);

    //  按问题类别只修目标文件
    // 仅在“修订模式 + 给定目标文件 + 非全量修订”时启用：只让 LLM 重新生成 targetFiles，
    // 其余文件从磁盘读取现有内容并保留，避免再次全量重做浪费模型调用与时间。
    const targetFileSet = new Set(
      Array.isArray(targetFiles) && targetFiles.length ? targetFiles : [],
    );
    const isRevision =
      (previousCritiques && previousCritiques.length > 0) ||
      !!_l0CodeRetryGuidance;
    const isPartialRevision =
      !!isRevision &&
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
    const STYLE_FILES = [
      'resources/styles/theme-vars.less',
      'resources/styles/common.less',
      'resources/styles/index.less',
    ];
    const allFiles = {};
    const chunkDebug = [];
    if (isPartialRevision) {
      this.logger.info('🎯 P1: 部分修订模式，仅重做目标文件，其余从磁盘保留', {
        targetFiles: [...targetFileSet],
        reviseTarget,
      });
      // 基线：先把未变更的目标外文件从磁盘读入 allFiles，保证部分修订不丢失既有产物
      const knownFiles = new Set(
        Array.isArray(input.generatedFiles) && input.generatedFiles.length
          ? input.generatedFiles
          : ['package/index.vue', ...STYLE_FILES],
      );
      // 🛡️ P1 子组件清单漂移（2026-09-02，mv-max-1788361436694-e145a6d3）：input.generatedFiles
      // 可能不含第1轮生成的全部子组件（L0-B 回退清单与磁盘实际存在文件不一致），导致含 echarts 的
      // 旧子组件（AreaChart.vue）不被读入 allFiles → 后续 N2 误判「产物无 echarts」注入占位 → CODE-012
      // 死循环重试耗尽。改为额外扫描 outputPath 磁盘上实际存在的 .vue/.less，合并进 knownFiles（
      // 幂等：仅补集合，不覆盖清单已有项；读不到文件时 diskContent 返回 null 自然跳过）。
      try {
        if (outputPath) {
          const scanDir = (dir) => {
            let entries;
            try {
              entries = readdirSync(join(outputPath, dir), { withFileTypes: true });
            } catch {
              return;
            }
            for (const e of entries) {
              const rel = `${dir}/${e.name}`;
              if (e.isDirectory()) scanDir(rel);
              else if (/\.(vue|less)$/i.test(e.name)) knownFiles.add(rel);
            }
          };
          scanDir('package');
          scanDir('resources');
        }
      } catch (scanErr) {
        // 非阻断：扫描失败回退原清单行为
        this.logger.warn('P1 磁盘基线扫描失败（非阻断）', {
          error: scanErr.message,
        });
      }
      for (const f of knownFiles) {
        if (targetFileSet.has(f)) continue;
        const c = diskContent(f);
        if (c != null) allFiles[f] = c;
      }
    }

    const appendGuidance = (p) => {
      if (_l0CodeRetryGuidance) p += _l0CodeRetryGuidance;

      // 默认技术栈规则（无论是否有 @xxx 标记都生效）
      p += '\n\n##默认技术栈规则（强制）\n\n';
      p +=
        '本项目已全局注册 ant-design-vue，组件中直接使用 `<a-xxx>` 标签即可，无需 import。\n\n';
      p += '| 场景 | 默认技术栈 | 说明 |\n|------|-----------|------|\n';
      p +=
        '| 表单组件（输入框/下拉/日期/开关/单选/多选） | ant-design-vue | `<a-input>` / `<a-select>` / `<a-date-picker>` / `<a-switch>` / `<a-radio-group>` / `<a-checkbox-group>` |\n';
      p += '| 数据表格 | ant-design-vue | `<a-table>` |\n';
      p += '| 弹窗 | ant-design-vue | `<a-modal>` |\n';
      p += '| 标签页 | ant-design-vue | `<a-tabs>` + `<a-tab-pane>` |\n';
      p += '| 按钮 | ant-design-vue | `<a-button>` |\n';
      p +=
        '| 图表 | ECharts | `echarts.init()` + `ResizeObserver` + `watch(chartRef)` |\n\n';
      p +=
        'Figma 节点名标注 `@antd/xxx` 时按标注匹配对应组件；未标注时按上表默认规则选择技术栈。\n\n';
      p += '### ⚠️ antd 样式覆盖必须使用 :deep()\n\n';
      p +=
        '组件使用 `<style lang="less" scoped>`，antd 内部 DOM（`.ant-xxx`）不携带 `data-v-xxx`，直接写 `.ant-xxx` **不生效**。\n\n';
      p +=
        '```less\n/* ✅ 正确 */\n:deep(.ant-input) { background: transparent; border-color: var(--border-color); }\n:deep(.ant-select-selector) { background: transparent; }\n:deep(.ant-table-thead) { background: rgba(0,0,0,0.3); }\n:deep(.ant-table-tbody > tr > td) { border-bottom: 1px solid var(--border-color); }\n:deep(.ant-btn) { border-radius: 4px; }\n\n/* ❌ 错误 — scoped 下不生效 */\n.ant-input { background: transparent; }\n```\n\n';

      // 🆕 技术栈节点样式处理规则（视觉识别驱动）
      p += '\n### 🎨 技术栈节点样式处理规则\n\n';
      p +=
        '对于标注了 **@技术栈** 的节点（如 `@ant/select`、`@echarts/bar`），遵循以下规则：\n\n';
      p += '#### ✅ 应保留的样式（容器级别）\n\n';
      p += '只还原 **视觉上可见的容器属性**，不深入子节点内部布局：\n\n';
      p += '- **背景**：`background`、`background-color`、`background-image`\n';
      p += '- **边框**：`border`、`border-radius`、`border-color`\n';
      p += '- **阴影**：`box-shadow`\n';
      p += '- **尺寸**：`width`、`height`、`min-width`、`max-width`\n';
      p += '- **间距**：`padding`（容器内边距）\n';
      p += '- **透明度**：`opacity`\n\n';
      p += '#### ❌ 不应还原的样式（内部实现）\n\n';
      p += '- **内部布局**：`display: flex`、`grid`、子元素间距、对齐方式\n';
      p += '- **子元素样式**：内部文本颜色、字体、图标样式\n';
      p +=
        '- **组件内部 DOM**：`.ant-select-dropdown`、`.echarts-tooltip` 等由库控制的内部元素\n\n';
      p += '#### 🚫 不使用 :deep() 的场景\n\n';
      p +=
        '对于 **UI 组件库**（ant-design-vue）、**图表库**（ECharts）、**地图库**（AMap/BMap），它们有自己的样式系统，**不需要使用 :deep() 深入修改内部样式**：\n\n';
      p += '```less\n/* ✅ 正确：只设置容器样式 */\n';
      p += '.chart-container {\n';
      p += '  width: 100%;\n';
      p += '  height: 400px;\n';
      p += '  background: rgba(0, 0, 0, 0.05);\n';
      p += '  border-radius: 8px;\n';
      p += '  padding: 16px;\n';
      p += '}\n\n';
      p += '/* ❌ 错误：不要深入修改图表/组件内部 */\n';
      p += ':deep(.echarts-legend-item) { color: red; }  // 不需要\n';
      p += ':deep(.ant-select-item) { padding: 8px; }   // 不需要\n';
      p += '```\n\n';
      p +=
        '**原则**：技术栈组件由库本身控制样式，只需设置容器的视觉外观（背景、边框、尺寸）。\n\n';

      if (techStackHints && techStackHints.length > 0) {
        p +=
          '\n##Figma 技术栈标记\n\n' +
          techStackHints
            .map(
              (h) =>
                `- **${h.library}**${h.component ? ` / ${h.component}` : ''}（节点：${h.nodeName}）`,
            )
            .join('\n');
      }
      if (_selfOptimization?.promptAugmentation) {
        p += '\n\n## 🧠 自优化增强\n\n' + _selfOptimization.promptAugmentation;
      }
      return p;
    };

    const runChunk = async (chunk, middleBuilder) => {
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

      // 🧩 SubcomponentContract：子组件分块 scopedInput 支持（与 microcode 路径同语义，fail-open）
      const effInput = chunk.scopedInput
        ? { ...input, ...chunk.scopedInput }
        : input;
      const prompt = appendGuidance(
        this.buildCodePrompt(effInput, {
          middle: middleBuilder.call(this, chunk),
        }),
      );
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
      res = res && typeof res === 'object' ? res : { files: {}, debug: {} };
      chunkDebug.push(res.debug || {});
      // 📡 分块完成：文件状态点亮 + 增量发布候选快照（代码 Tab 逐文件可见）
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
        // P1-Slice2：与 microcode-engineer 同源修复 —— 先合并进 allFiles，再推送累积全量。
        // 旧实现在此处直接推 `{ ...allFiles, ...res.files }`（调用时刻求值），而调用方的
        // Object.assign 发生在 runChunk 之外，并行 worker 交错会导致后推送的 revision
        // 缺掉先完成 worker 的文件 → 候选指针回退（「之前的不见了」）。
        await pushChunkSnapshot({
          allFiles,
          resFiles: res.files,
          onFilesReady,
          stage: 'vue3-engineer',
          logger: this.logger,
        });
      }
      return res;
    };

    try {
      // ── 全量生成闭包（默认路径 + 截断降级；部分修订失败时复用）──
      const runFullGeneration = async () => {
        try {
          const chunkFull = {
            title: 'Vue3 主组件 + 共享样式（index.vue + styles/*.less）',
            // 🔧 大分块超时修复：本分块要一次性产出 index.vue（三段 SFC）+ theme-vars.less + common.less，
            // 是「大上下文 + 大输出」分块，实测 180s 不够（mv-max-1787729232629 首轮 180s 超时）。
            // segmentType='component' 让超时预算走 300s（与微码 style/component 分块一致）。
            // 注意：index.less 不在此列表——它由 ensureVue3StyleEntry 系统确定性生成（2 行 @import），
            // 模型生成会被无条件覆盖，纯属浪费输出 tokens。
            segmentType: 'component',
            files: [
              'package/index.vue',
              'resources/styles/theme-vars.less',
              'resources/styles/common.less',
            ],
            index: 1,
            total: 1,
            contextFiles: [],
          };
          const resFull = await runChunk(chunkFull, this._buildVue3ChunkMiddle);
          const safeResFull = resFull && typeof resFull === 'object' ? resFull : { files: {}, debug: {} };
          Object.assign(allFiles, safeResFull.files || {});
        } catch (truncErr) {
          // ── 降级路径：template → script → style 三段拼装 ──
          this.logger.warn(
            '⚠️ Vue3 整文件生成截断，降级为 template/script/style 三段生成',
            { error: truncErr.message },
          );

          const chunkT = {
            title: 'index.vue 模板段',
            files: ['package/index.vue'],
            segmentType: 'template',
            index: 1,
            total: 3,
            contextFiles: [],
          };
          const resT = await runChunk(chunkT, this._buildVue3TemplateMiddle);
          const safeResT = resT && typeof resT === 'object' ? resT : { files: {}, debug: {} };
          const tpl = (safeResT.files?.['package/index.vue'] || '').trim();

          const chunkS = {
            title: 'index.vue 脚本段',
            files: ['package/index.vue'],
            segmentType: 'script',
            index: 2,
            total: 3,
            contextFiles: [
              { path: 'package/index.vue (template)', content: tpl },
            ],
          };
          const resS = await runChunk(chunkS, this._buildVue3ScriptMiddle);
          const safeResS = resS && typeof resS === 'object' ? resS : { files: {}, debug: {} };
          const scr = (safeResS.files?.['package/index.vue'] || '').trim();

          const chunkY = {
            title: 'index.vue 样式段',
            files: ['package/index.vue'],
            index: 3,
            total: 3,
            contextFiles: [
              {
                path: 'package/index.vue (template+script)',
                content: `${tpl}\n\n${scr}`,
              },
            ],
          };
          const resY = await runChunk(chunkY, this._buildVue3StyleMiddle);
          const safeResY = resY && typeof resY === 'object' ? resY : { files: {}, debug: {} };
          const sty = (safeResY.files?.['package/index.vue'] || '').trim();

          allFiles['package/index.vue'] = this._assembleVue3IndexVue(
            tpl,
            scr,
            sty,
            input,
          );
          this.logger.info('✅ Vue3 三段拼装完成', {
            length: allFiles['package/index.vue'].length,
          });
        }
      };

      if (isPartialRevision) {
        try {
          const wantIndex = targetFileSet.has('package/index.vue');
          const wantStyles = STYLE_FILES.some((f) => targetFileSet.has(f));
          this.logger.info('🎯 P1: 部分修订分支', { wantIndex, wantStyles });

          if (wantIndex) {
            // 仅重做 index.vue（分段生成，不触碰 less；less 已由基线从磁盘保留）
            // 🛡️ P1 子组件清单漂移（2026-09-02，mv-max-1788361436694-e145a6d3）：旧版 contextFiles 为空，
            // LLM 看不到旧 index.vue → 凭 Figma 数据自由重写模板 → 重命名子组件（AreaChart → ChartControls）
            // → 旧子组件成孤儿 + 新空壳子组件无 echarts → N2 误判「无 echarts」注入占位 → 死循环重试耗尽。
            // 修复：注入旧 index.vue 作为模板段上下文，并在 middle 明确「只修指定问题、子组件引用原样保留」。
            const _oldIndexContent = diskContent('package/index.vue') || '';
            const chunkT = {
              title: 'index.vue 模板段',
              files: ['package/index.vue'],
              segmentType: 'template',
              index: 1,
              total: 3,
              contextFiles: _oldIndexContent
                ? [
                    {
                      path: 'package/index.vue（旧版基线，仅修复 L0-B 反馈问题，子组件引用必须原样保留、不得重命名/新增/删除）',
                      content: _oldIndexContent,
                    },
                  ]
                : [],
            };
            const resT = await runChunk(chunkT, this._buildVue3TemplateMiddle);
            const safeResT = resT && typeof resT === 'object' ? resT : { files: {}, debug: {} };
            const tpl = (safeResT.files?.['package/index.vue'] || '').trim();

            const chunkS = {
              title: 'index.vue 脚本段',
              files: ['package/index.vue'],
              segmentType: 'script',
              index: 2,
              total: 3,
              contextFiles: [
                { path: 'package/index.vue (template)', content: tpl },
              ],
            };
            const resS = await runChunk(chunkS, this._buildVue3ScriptMiddle);
            const safeResS = resS && typeof resS === 'object' ? resS : { files: {}, debug: {} };
            const scr = (safeResS.files?.['package/index.vue'] || '').trim();

            const chunkY = {
              title: 'index.vue 样式段',
              files: ['package/index.vue'],
              index: 3,
              total: 3,
              contextFiles: [
                {
                  path: 'package/index.vue (template+script)',
                  content: `${tpl}\n\n${scr}`,
                },
              ],
            };
            const resY = await runChunk(chunkY, this._buildVue3StyleMiddle);
            const safeResY = resY && typeof resY === 'object' ? resY : { files: {}, debug: {} };
            const sty = (safeResY.files?.['package/index.vue'] || '').trim();

            if (tpl || scr || sty) {
              allFiles['package/index.vue'] = this._assembleVue3IndexVue(
                tpl,
                scr,
                sty,
                input,
              );
              this.logger.info('✅ P1 部分修订: index.vue 重新生成完成', {
                length: allFiles['package/index.vue'].length,
              });
            } else {
              throw new Error('部分修订生成 index.vue 失败（三段均为空）');
            }
          }

          if (wantStyles) {
            // 仅重做被 critique 引用的 less 文件；index.vue 由基线从磁盘保留
            const styleChunkFiles = STYLE_FILES.filter((f) =>
              targetFileSet.has(f),
            );
            const chunkStyle = {
              title: '样式文件',
              files: styleChunkFiles,
              index: 1,
              total: 1,
              contextFiles: [
                {
                  path: 'package/index.vue',
                  content: allFiles['package/index.vue'] || '',
                },
              ],
            };
            const resStyle = await runChunk(
              chunkStyle,
              this._buildVue3ChunkMiddle,
            );
            const safeResStyle = resStyle && typeof resStyle === 'object' ? resStyle : { files: {}, debug: {} };
            Object.assign(allFiles, safeResStyle.files || {});
          }
        } catch (partialErr) {
          this.logger.warn('⚠️ P1 部分修订失败，回退全量生成', {
            error: partialErr.message,
          });
          for (const k of Object.keys(allFiles)) delete allFiles[k];
          await runFullGeneration();
        }
      } else {
        await runFullGeneration();
      }

      // ── 子组件补生成（复用父类 import 检测）──
      const subComps = this._detectSubComponents(
        allFiles['package/index.vue'] || '',
      );
      // 🛡️ 模板中的 PascalCase 子组件标签（如 <SectionHeader>）也是有效的子组件引用，
      // 但模型在"三段降级"单独生成脚本段时往往漏写 import，导致 _detectSubComponents 仅靠 import 检测漏掉它们，
      // 进而子组件文件永不生成、主组件引用悬空。此处据模板标签补全候选子组件清单（去重）。
      {
        const tplMatch = (allFiles['package/index.vue'] || '').match(
          /<template>([\s\S]*?)<\/template>/,
        );
        if (tplMatch) {
          for (const tag of extractComponentTagNames(tplMatch[1])) {
            const p = `package/components/${tag}.vue`;
            if (!subComps.includes(p)) subComps.push(p);
          }
        }
      }
      let idx = 2;
      for (const subPath of subComps) {
        // 🧩 SubcomponentContract：vue3 子组件同样按 usage 关键词裁剪事实（省 60%+ tokens，fail-open 保真）
        const subTagName = subPath
          .split('/')
          .pop()
          .replace(/\.vue$/, '');
        const scopedInput = this._buildSubcomponentScopedInput(
          subPath,
          allFiles['package/index.vue'] || '',
          input,
        );
        const usage = this._extractUsageSnippet(
          subTagName,
          allFiles['package/index.vue'] || '',
        );
        const subChunk = {
          title: '子组件 ' + subPath,
          files: [subPath],
          index: idx++,
          total: 1 + subComps.length,
          scopedInput,
          contextFiles: usage
            ? [
                {
                  path: `package/index.vue（${subTagName} 使用处摘要）`,
                  content: usage,
                },
              ]
            : [
                {
                  path: 'package/index.vue',
                  content: allFiles['package/index.vue'] || '',
                },
              ],
        };
        const resSub = await runChunk(subChunk, this._buildVue3ChunkMiddle);
        const safeResSub = resSub && typeof resSub === 'object' ? resSub : { files: {}, debug: {} };
        Object.assign(allFiles, safeResSub.files || {});
      }

      // 诊断落盘
      try {
        const debugDir = dirname(input.outputPath || backendRoot);
        if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true });
        writeFileSync(
          join(debugDir, 'debug-vue3-ai-response.txt'),
          JSON.stringify(
            {
              mode: isPartialRevision ? 'vue3-partial' : 'vue3-adaptive',
              chunks: chunkDebug,
            },
            null,
            2,
          ),
          'utf-8',
        );
      } catch (e) {
        /* 非阻断 */
      }

      // 截断终检
      const truncationIssues = this._detectFileTruncation(allFiles);
      if (truncationIssues.length > 0) {
        throw new Error(`Vue3 输出文件不完整：${truncationIssues.join('；')}`);
      }
      if (Object.keys(allFiles).length === 0) {
        throw new Error('LLM 返回的 files 为空');
      }

      // 防御：剔除 LLM 越权产出的微码运行时文件（注意：Vue3 现合法产出 .less，不再剔除）
      for (const p of Object.keys(allFiles)) {
        if (/declare\.json$|component\.js$|declare\.js$/.test(p)) {
          this.logger.warn(`⚠️ Vue3 目标下剔除微码运行时文件产出: ${p}`);
          delete allFiles[p];
        }
      }

      // 🛡️ P1-4 清洗层（Vue3 路径，2026-08-28）
      // Vue3Engineer 覆盖了 generateCode，父类的清洗接入点走不到，必须在此单独接入。
      // 作用：剥离模型输出「夹带」的说明性文本（Markdown 围栏 / 闭合标签后的「生成说明」等），
      // 且必须早于下方所有注入、修复与校验——否则残留文本一旦被 SFC 编译器当成标签/表达式，
      // 会导致整个任务 fail-closed（微码路径 mc-max-1787908432082 已有实锤）。
      try {
        const { CodeFixPipeline, FIX_PHASE } = await import(
          '../validators/code-fix-pipeline.js'
        );
        // 🛡️ N4 中性化（2026-08-31）：根容器尺寸锚定迁入共享规则。
        // 旧内联实现（原 :1462，execute 后处理段）写死 px + R7 前旧背景逻辑
        // （LLM 已写背景就跳过注入），且 lazy 正则可跨具名插槽误检。现统一走
        // code-fix-rules 的纯函数（中性语义：不覆盖已有尺寸、缺补 100%、
        // aspect-ratio 真值比例、panelBg R7 剥离再注入）。
        const { anchorRootContainerInFiles } = await import(
          '../validators/code-fix-rules.js'
        );
        // 🆕 P6（2026-08-29）：Vue3 路径接入 S1 的 P1/P2 确定性修复规则。
        // Vue3Engineer 此前只用 CLEAN 阶段、且未注册 registerBuiltinFixRules，
        // 导致 inject-echarts-axis-ticks（轴刻度）与 strip-orphan-controls（臆造控件）
        // 对 Vue3 完全不生效（最差组件 mv-lite 仅 45% 的根因之一）。
        // 这两个方法继承自 MicrocodeEngineer，Vue3 直接 this._xxx 调用即可（ctx 形态一致）。
        const fixPipeline = new CodeFixPipeline({
          logger: this.logger,
          context: {
            componentName: input.componentName,
            outputPath: input.outputPath,
            figmaNodeData: input.figmaNodeData,
          },
        });
        fixPipeline.registerAll([
          {
            id: 'strip-trailing-garbage',
            name: '剥离闭合标签之后的说明性文本',
            phase: FIX_PHASE.CLEAN,
            // 🛡️ P0-4（2026-08-29）：与微码 code-fix-rules 对齐，先走统一工具
            // stripLlmTailGarbage（.vue/.less/.css 结构闭合截断），再旧方法兜底。
            fix: (content, ctx) => {
              const stripped = stripLlmTailGarbage(ctx.path, content);
              const afterUnified = stripped.stripped ? stripped.content : content;
              return this._stripTrailingGarbageAfterLastBlock(afterUnified, ctx.path);
            },
          },
          {
            id: 'strip-inter-block-prose',
            name: '剥离块间说明性文本',
            phase: FIX_PHASE.CLEAN,
            applyTo: /\.vue$/i,
            fix: (content, ctx) =>
              this._stripInterBlockProse(content, ctx.path),
          },
          // 🆕 P1：echarts 坐标轴刻度/标签兜底（模型显式 show:false → true；不臆造 data）
          {
            id: 'inject-echarts-axis-ticks',
            name: 'echarts 轴刻度/标签兜底',
            phase: FIX_PHASE.STYLE,
            applyTo: /\.vue$/i,
            fix: (content) => this._injectEchartsAxisTicks(content),
          },
          // 🆕 N4 中性化：根容器尺寸中性锚定（接管原 execute 段内联实现，见上方注释）
          {
            id: 'anchor-root-container',
            name: '根容器尺寸中性锚定（aspect-ratio 语义）',
            phase: FIX_PHASE.STYLE,
            fixFiles: (files) =>
              anchorRootContainerInFiles(files, {
                figmaNodeData: input.figmaNodeData,
                resourceDomMapping: resolveResourceDomMapping(
                  input.resourceDomMapping,
                  input.outputPath,
                ),
                logger: this.logger,
              }),
          },
          // 🆕 P2：剥离 Figma 节点树不存在的臆造交互控件
          {
            id: 'strip-orphan-controls',
            name: '剥离臆造交互控件',
            phase: FIX_PHASE.POLISH,
            applyTo: /\.vue$/i,
            fix: (content, ctx) => this._stripOrphanControls(content, ctx),
          },
          // ⚠️ 已移除 fix-section-heights 注册（2026-09-01，缺口③ 附带修复）：
          // 本文件从未定义 `this._fixSectionHeights`——全仓仅 microcode-engineer.js:3228
          // 有实现（委托 roles/microcode/resource-mounter.js:fixSectionHeightsForResource）。
          // 即此处调用的是 undefined 方法，属典型悬挂引用：apply 到该规则时抛 TypeError
          // （是否被吞取决于 CodeFixPipeline，表现为规则静默失效或整个 fix 阶段中断），
          // 且 id 与 validators/code-fix-rules.js:788 的 mc 注册重名，是「同 id 两份注册」的双轨隐患。
          // 若日后 Vue3 也需要该修复：把实现抽到公共模块后两边共用，禁止在此处挂空调用。
          // 🛡️ TEXT-001（2026-09-01）：文本兄弟顺序按 Figma 视觉坐标重排（与微码链路对齐）。
          // code-structure-validator 的 TEXT-001 BLOCK 门禁两链共用（vue3 调用点同样传
          // figmaNodeData），故 Vue3 必须有对应自愈通道，否则漂移产物会被门禁杀而无修复机会。
          // 实现走 microcode-engineer 继承的 _fixTextSiblingOrder → code-healer（公共模块，非空调用）。
          {
            id: 'fix-text-sibling-order',
            name: '文本兄弟顺序按视觉坐标重排',
            phase: FIX_PHASE.POLISH,
            fixFiles: (files) =>
              this._fixTextSiblingOrder(files, input.figmaNodeData),
          },
        ]);
        // 跑全阶段（CLEAN→STYLE→POLISH），让 P1/P2 规则对 Vue3 生效
        const fixRes = fixPipeline.apply(allFiles, {
          componentName: input.componentName,
          outputPath: input.outputPath,
        });
        if (fixRes.applied.length > 0) {
          for (const p of Object.keys(allFiles)) {
            allFiles[p] = fixRes.files[p];
          }
          this.logger.warn(
            `🛡️ Vue3 清洗+修复层应用了 ${fixRes.applied.length} 处规则（含 P1/P2 轴刻度/臆造控件）`,
            { detail: fixRes.applied },
          );
          input.onProgress?.({
            stage: '代码清洗',
            message: `🧹 已应用 ${fixRes.applied.length} 处确定性修复（含 P1/P2）`,
            status: 'warning',
            details: fixRes.applied,
          });
        }
      } catch (cleanErr) {
        this.logger.warn('Vue3 清洗层执行失败（非阻断，交由下游校验兜底）', {
          error: cleanErr?.message || String(cleanErr),
        });
      }

      // 🛡️ 样式文件后处理兜底（T05/T06/T07 覆盖 .less/.css）：
      // vue3 组件的真实样式主要写在 resources/styles/common.less，而 _assembleVue3IndexVue
      // 只处理 package/index.vue，导致 T06 容器尺寸校验漏掉 common.less 里的
      // 「子容器尺寸 == 根容器」BBox fallback（与微码同源问题）。此处对 .less/.css 统一补跑。
      const _vue3RootBox = input.figmaNodeData?.absoluteBoundingBox;
      for (const [p, c] of Object.entries(allFiles)) {
        if (typeof c !== 'string') continue;
        if (!p.endsWith('.less') && !p.endsWith('.css')) continue;

        // T05: 硬编码 background-size px → cover
        let vue3Style = this._fixBackgroundImageSize(c);
        if (vue3Style !== c) {
          allFiles[p] = vue3Style;
          this.logger.info(
            '🔧 T05: Vue3 样式文件 bg-size 修正（硬编码 px → cover）',
            { file: p },
          );
        }

        // T06: 容器尺寸校验 + 确定性自动修正（BBox fallback → auto，回写修正结果）
        if (_vue3RootBox?.width && _vue3RootBox?.height) {
          const t06 = this._validateContainerSize(
            vue3Style,
            _vue3RootBox.width,
            _vue3RootBox.height,
          );
          if (t06.fixed > 0) {
            vue3Style = t06.code;
            allFiles[p] = vue3Style;
            this.logger.info(
              `🔧 T06: Vue3 样式文件已自动修正 ${t06.fixed} 处 BBox fallback（子容器尺寸 → auto）`,
              { file: p },
            );
          }
        }

        // T07: 同一资源被多容器引用 → 告警
        this._validateResourceUsage(vue3Style);
      }

      // 🛡️ P1-6 视觉真值校验（Vue3 路径，2026-08-28）
      // Vue3Engineer 覆盖了自己的 generateCode，微码路径的接入点走不到，必须在此单独接入。
      // 实锤需求（mv-max-1787908524561-75ed1f2d 环境监测）：LLM 自加根容器 box-shadow 使组件
      // 变"浮起卡片"、.monitor-tabs 显式 gap:0 使 tab 紧贴、激活态圆角 2px 远小于设计 29px
      // —— 这些都是「能跑但不好看」，没有 Figma 真值校验就永远发现不了。
      // 仅告警不阻断：视觉偏差不该让已生成的成果 fail-closed。
      try {
        const { validateVisualTruth } = await import(
          '../validators/visual-truth-validator.js'
        );
        const vue3Visual = validateVisualTruth(input.figmaNodeData, allFiles);
        if (vue3Visual.issues.length > 0) {
          this.logger.warn(
            `⚠️ Vue3 视觉真值校验发现 ${vue3Visual.issues.length} 处偏差`,
            {
              issues: vue3Visual.issues.map((i) => `${i.id}: ${i.message}`),
            },
          );
          input.onProgress?.({
            stage: '视觉真值校验',
            message: `⚠️ ${vue3Visual.issues.length} 处样式与 Figma 设计值存在偏差`,
            status: 'warning',
            details: vue3Visual.issues,
          });
        }
      } catch (visualErr) {
        this.logger.warn('Vue3 视觉真值校验执行失败（非阻断）', {
          error: visualErr?.message || String(visualErr),
        });
      }

      return { files: allFiles };
    } catch (error) {
      this.logger.error('Vue3 代码生成失败', { error: error.message });
      throw error;
    }
  }

  /**
   * Vue3 共享样式入口属于固定基础设施，不应依赖模型完整输出。
   * 模型负责 theme-vars.less/common.less，系统确定性生成 index.less 导入链。
   */
  ensureVue3StyleEntry(files = {}, options = {}) {
  return _ensureVue3StyleEntry(files, { logger: this.logger, ...options });
  }

  /**
   * 🛡️ Vue3 子组件 import 自动接线（治本修复"模板引用未声明组件"）。
   *
   * 背景：三段降级单独生成脚本段时，模型常漏写子组件 import（如 <SectionHeader>），
   * 导致 (1) 写盘门禁报"模板引用了 script 中未声明的变量/组件"；(2) 运行期组件悬空。
   * 子组件文件已由 generateCode 阶段据模板标签生成到 package/components/<Tag>.vue，
   * 本方法确定性地把它们 import 进主组件 <script setup>，使其在 <script setup> 下自动注册，
   * 无需模型配合、不依赖重试，保证最终落盘文件语义完整且运行期可解析。
   *
   * 仅接线"确实已生成"的子组件文件；已 import / 已在 components:{} 注册的跳过，幂等安全。
   * @param {Object} files 文件映射（相对路径 → 内容）
   * @returns {Object} 同一 files 对象（原地修改 package/index.vue）
   */
  _wireVue3SubComponentImports(files) {
  return _wireVue3SubComponentImports(files, { logger: this.logger });
  }

  /**
   * 覆写：Vue3 execute — 仅补 Vue3 固定样式入口，不补微码运行时文件
   */
  async execute(params) {
    // 🛡️ 2026-08-25 修复：后处理区（T1/T2/T3/N1/N2/N3、根容器锚定）统一通过 input 引用
    // 参数（figmaNodeData/charts/resourceDomMapping/outputPath），但 execute 此前只解构了
    // 少数字段、作用域无 input 对象 → 后处理大 try 第一行即 ReferenceError，整条链从未执行
    // （日志 "figmaNodeData is not defined" / "input is not defined" 实锤）。加别名一锤定音。
    const input = params;
    const {
      componentName,
      outputPath,
      previousCritiques,
      resourceDomMapping,
      onFilesReady,
      onProgress = null,
    } = params;

    // 强制子组件清单（来自 subcomponent-planner）
    const { subPlan } = this.resolveSubComponentPlan(params);

    // 🛡️ 磁盘兜底重载（lite/max/develop/修订 任意路径映射丢失时仍可注入）
    const effectiveMapping = resolveResourceDomMapping(
      resourceDomMapping,
      outputPath,
    );

    const isRevision = previousCritiques && previousCritiques.length > 0;
    this.logger.info(`开始执行 Vue3 代码${isRevision ? '修订' : '生成'}`, {
      componentName,
      critiqueCount: previousCritiques?.length || 0,
    });

    try {
      // 文件生命周期：模型生成阶段（文件组级状态，不虚构单个活动文件）
      onProgress?.({
        fileLifecycle: {
          phase: 'modeling',
          summary: isRevision
            ? '正在修订 Vue3 组件文件组'
            : '正在生成 Vue3 组件文件组',
        },
      });

      const codeResult = await this.generateCode(params);
      // 🛡️ P0 防护：generateCode 异常路径可能返回 undefined
      if (!codeResult || typeof codeResult !== 'object' || !codeResult.files) {
        throw new Error('Vue3 代码生成返回空结果');
      }
      // 🎨 styleTokens 契约（1.4）：Vue3 theme-vars.less 兜底渲染与微码 css-vars.js 同源。
      // figmaNodeData/backgroundBrightness 从 params 读（mc-component-graph-vue3.js 已注入，
      // 缺省 'dark'——vision 未判明时按既有铁律 dark 优先）。
      const vue3StyleTokens = buildStyleTokens(
        {
          figmaNodeData: input.figmaNodeData || null,
          backgroundBrightness: input.backgroundBrightness || 'dark',
        },
        { logger: this.logger },
      );
      this._lastStyleTokens = vue3StyleTokens; // 供下游与微码路一致取用（单一事实源）
      codeResult.files = this.ensureVue3StyleEntry(codeResult.files, {
        styleTokens: vue3StyleTokens,
      });

      // 🛡️ 主组件 <style> 必须 @import '../resources/styles/index.less'（L0-B CODE-002 为 BLOCK，缺失即 fail-closed）。
      // 模型三段降级常漏写此行；复用父类 _ensureIndexVueStyleImport 确定性注入（仅当缺时补，幂等）。
      if (codeResult.files['package/index.vue']) {
        codeResult.files['package/index.vue'] = this._ensureIndexVueStyleImport(
          codeResult.files['package/index.vue'],
        );
      }

      // 🛡️ 子组件 import 自动接线：把模板引用的 package/components/*.vue 接入主组件 <script setup>，
      // 根治"模板引用未声明组件"（三段降级漏写 import 导致 fail-closed / 运行期悬空）。须在写盘门禁前完成。
      this._wireVue3SubComponentImports(codeResult.files);

      // Vue3 图片统一使用标准 URL 构造语义：
      // - 正式 Vite 构建会把 new URL(..., import.meta.url) 转换为产物资源 URL；
      // - 动态预览加载器会在浏览器编译前改写为同源 /__raw 或 /api/preview URL；
      // - 不再依赖 vue3-sfc-loader 对二进制 ESM import 的实现细节。
      if (effectiveMapping) {
        const source =
          resourceDomMapping && resourceDomMapping.length > 0
            ? 'in-memory'
            : 'disk-fallback';
        const vueFiles = Object.keys(codeResult.files).filter((f) =>
          f.endsWith('.vue'),
        );
        let injectedCount = 0;
        for (const filePath of vueFiles) {
          const resourceBase = /^package\/components\//.test(filePath)
            ? '../../resources/images/'
            : '../resources/images/';
          const before = codeResult.files[filePath];
          codeResult.files[filePath] = injectVue3ResourceUrls(
            codeResult.files[filePath],
            effectiveMapping,
            resourceBase,
          );
          if (codeResult.files[filePath] !== before) {
            injectedCount++;
            this.logger.info('✅ 已自动注入资源URL导入（Vue3）', {
              file: filePath,
              source,
            });
          }
        }
        this.logger.info('Vue3 资源import注入完成', {
          source,
          vueFileCount: vueFiles.length,
          injectedCount,
          mappingCount: effectiveMapping.length,
        });
      } else {
        this.logger.warn(
          '⚠️ Vue3 资源映射完全缺失（内存与磁盘 .mc-gen/resource-dom-mapping.json 均无），跳过 import 注入',
          {
            componentName,
            outputPath,
            hadInMemory: !!(
              resourceDomMapping && resourceDomMapping.length > 0
            ),
          },
        );
      }

      // 兜底移除 LLM 手写的同名本地图片 import，确保最终产物只保留 URL 常量。
      for (const filePath of Object.keys(codeResult.files)) {
        if (!filePath.endsWith('.vue')) continue;
        const dedupRes = this.dedupImportsByLocalName(
          codeResult.files[filePath],
        );
        if (dedupRes.modified) {
          codeResult.files[filePath] = dedupRes.code;
          this.logger.warn(
            `🛡️ 已对 ${filePath} 的资源声明按本地名去重（防止重复声明导致预览崩溃）`,
          );
        }
      }

      // 🛡️ 图片背景绑定本地图兜底（防复发）：宿主未注入 props.bgX 时回退本地导入图，避免背景整体消失。
      for (const filePath of Object.keys(codeResult.files)) {
        if (!filePath.endsWith('.vue')) continue;
        const healed = healPropImageFallbacks(codeResult.files[filePath]);
        if (healed !== codeResult.files[filePath]) {
          codeResult.files[filePath] = healed;
          this.logger.info('🛡️ 已为图片背景绑定加本地图兜底（props.X || X）', {
            file: filePath,
          });
        }
      }

      //L2 后处理：自动将数据型裸 const 转为 ref()（防止绑定阶段符号冲突）
      for (const [filePath, content] of Object.entries(codeResult.files)) {
        if (filePath.endsWith('.vue') && content.includes('<script setup>')) {
          codeResult.files[filePath] = this.wrapBareConstWithRef(content);
        }
      }

      // 🎯 确定性后处理（治本，不依赖 LLM 遵守 prompt）：
      //   T1 面板标题剥离：预览/宿主外壳已渲染标题，组件内渲染相同文字即重复（mv-max-1787576934056 实锤）
      //   T2 echarts 容器最小高度：图表容器被 flex 兄弟挤压到 ~10px，折线视觉变形
      try {
        // 🎯 T1 标题剥离在 vue3 端禁用（2026-08-25）：
        // 该逻辑是微码语义——mc 有 base-panel 外壳渲染标题、组件内渲染即重复；
        // 但 vue3 组件自带完整外壳，标题必须由组件自己渲染（mv-max-1787641114026 标题被误剥实锤）。
        // 故 vue3 不剥标题，保留 LLM 生成的 header 标题元素。

        // T2：echarts 挂载容器最小高度注入
        for (const [fp, fc] of Object.entries(codeResult.files)) {
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
          // template 中 ref="xxx" 的元素 class（class 与 ref 顺序两种形态）
          const elMatch =
            fc.match(
              new RegExp(`<div[^>]*ref="${refName}"[^>]*class="([\\w -]+)"`),
            ) ||
            fc.match(
              new RegExp(`<div[^>]*class="([\\w -]+)"[^>]*ref="${refName}"`),
            );
          if (!elMatch) continue;
          const chartCls = elMatch[1].trim().split(/\s+/)[0];
          // 给该 class 的样式块注入分级 min-height：主图 160px，紧凑图 100px。
          // 已有值不覆盖；已有过小值也保留，避免后处理替换真实 Figma 尺寸。
          const targetMinHeight = inferChartMinHeight(chartCls, '', {
            chartType: input.charts?.[0]?.type,
            chartRole: input.charts?.[0]?.role,
          });
          const blockRe = new RegExp(`(\\.${chartCls}\\s*\\{)([^}]*)`, 'm');
          const patched = fc.replace(blockRe, (m, head, body) => {
            if (/min-height\s*:/i.test(body)) return m;
            return `${head}${body.replace(/\s*$/, '')}\n  min-height: ${targetMinHeight}px; /* 🎯 防挤压：echarts 容器最小高度（主图160/紧凑图100） */\n`;
          });
          if (patched !== fc) {
            codeResult.files[fp] = patched;
            this.logger.info(
              `🎯 echarts 容器最小高度已注入: ${fp} → .${chartCls} min-height: ${targetMinHeight}px`,
            );
          }
        }

        // T3 图表 type 强约束：vision 指定的图表 type 必须与 product 一致（防止 LLM 把 area/line 改 bar）
        const chartsArr3 = Array.isArray(input.charts) ? input.charts : [];
        // 🔴 2026-09-11：真值先归一到 echarts 注册名，避免把 'area-line'/'面积折线图'
        // 当作合法目标写进 series.type（真值洗白，实锤 mc-max-1789062564333-f1ff01eb）。
        const targetType3 = resolveEchartsType(chartsArr3[0]?.type) || '';
        const visionTypes3 = new Set(
          chartsArr3
            .map((c) => resolveEchartsType(c?.type))
            .filter(Boolean),
        );
        if (targetType3 && targetType3 !== 'bar' && !visionTypes3.has('bar')) {
          let fixedCount3 = 0;
          for (const [fp, fc] of Object.entries(codeResult.files)) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            const before = fc;
            const after = before.replace(
              /type:\s*['"]bar['"]/g,
              `type: '${targetType3}'`,
            );
            if (after !== before) {
              fixedCount3 += (before.match(/type:\s*['"]bar['"]/g) || [])
                .length;
              codeResult.files[fp] = after;
            }
          }
          if (fixedCount3 > 0) {
            this.logger.info(
              `🎯 图表 type 强约束：${fixedCount3} 处 'bar' 强制改 '${targetType3}'（vision types: ${[...visionTypes3].join(',') || '无'}）`,
            );
          }
        }

        // 🛡️ Loop 2.1.E（2026-09-11 vue3 端补齐，与 mc 端对齐）：非法 series.type 拒收。
        // 背景：vue3 侧此前**完全没有**该环节（mc 端 2026-09-10 已立），且 T3 的目标类型
        // 取自未校验真值 → 'area-line'/'面积折线图' 等非法别名会直落 series.type，
        // 运行时 ECharts 报 `Unknown series area-line` 并**整条 series 被丢弃**（只剩空坐标轴）。
        // 治本同 mc：真值先归一 + 括号配平 + 只改元素顶层 type（不碰 lineStyle/渐变 type）。
        try {
          const _truthChartType3 = resolveEchartsType(chartsArr3[0]?.type);
          let _illegalFixed3 = 0;
          for (const [fp, fc] of Object.entries(codeResult.files)) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            if (!fc.includes('series')) continue;
            const r = normalizeSeriesInSource(fc, { chartType: _truthChartType3 });
            if (r.changed > 0) {
              codeResult.files[fp] = r.text;
              _illegalFixed3 += r.changed;
            }
          }
          if (_illegalFixed3 > 0) {
            this.logger.warn(
              `🛡️ [vue3] 2.1.E 非法 series.type 已收敛 ${_illegalFixed3} 处（真值=${_truthChartType3 || 'none→line'}）`,
            );
          }
        } catch (ctErr3) {
          this.logger.warn('⚠️ [vue3] 2.1.E chartType 收敛失败（非阻塞）', {
            error: ctErr3?.message,
          });
        }

        // 🛡️ Loop 2.1.F（2026-09-11）：坐标轴格式守卫，根治 `xAxis "0" not found`（与 mc 端对齐）。
        try {
          let _axisFixed3 = 0;
          for (const [fp, fc] of Object.entries(codeResult.files)) {
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
              _axisFixed3 += r.changed;
            }
          }
          if (_axisFixed3 > 0) {
            this.logger.warn(
              `🛡️ [vue3] 2.1.F 坐标轴格式已收敛 ${_axisFixed3} 处（xAxis/yAxis 数组化 + 显式索引）`,
            );
          }
        } catch (axisErr3) {
          this.logger.warn('⚠️ [vue3] 2.1.F 坐标轴格式收敛失败（非阻塞）', {
            error: axisErr3?.message,
          });
        }

        // 🎯 N1 数字字面量确定性剥离（vue3 端，mc 端已有）：vision TEXT 字符集 vs 产物数字字面量差集
        // mv-max-1787624270789 实锤：vision 漏识别 sections=0 时 LLM 臆造 chartData = [{time:'2',value:5},...]
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
          collectTextChars(
            input.figmaNodeData?.document || input.figmaNodeData,
          );
          const numericRewriteDecision = assessNumericLiteralRewrite({
            layoutStructure: input.layoutStructure,
            visualElements: input.visualElements,
            elements: input.elements,
            chunks: input.chunks,
            charts: input.charts,
            subComponentPlan: input.subComponentPlan,
            componentPlan: input.generationInput?.componentPlan,
          });
          if (textSet.size > 0) {
            let ghostCount = 0;
            for (const [fp, fc] of Object.entries(codeResult.files)) {
              if (
                !fp.endsWith('.vue') &&
                !fp.endsWith('.ts') &&
                !fp.endsWith('.js')
              )
                continue;
              if (typeof fc !== 'string') continue;
              const ghostInFile = new Set();
              const styleBlockRe = /<style[\s\S]*?<\/style>/g;
              const styleBlocks = [];
              const fcNoStyle = fc.replace(styleBlockRe, (m) => {
                styleBlocks.push(m);
                return `\x00STYLE${styleBlocks.length - 1}\x00`;
              });
              let patched = fcNoStyle;
              const rewriteNumeric = numericRewriteDecision.rewrite;
              patched = patched.replace(
                />\s*([-+]?\d+\.?\d*%?)\s*</g,
                (m, lit) => {
                  if (textSet.has(lit)) return m;
                  ghostInFile.add(lit);
                  return rewriteNumeric ? `>0<!-- 🎯 待接入(${lit}) --><` : m;
                },
              );
              patched = patched.replace(
                /\{\{\s*([-+]?\d+\.?\d*%?)\s*\}\}/g,
                (m, lit) => {
                  if (textSet.has(lit)) return m;
                  ghostInFile.add(lit);
                  return rewriteNumeric ? `{{0 /* 🎯 待接入(${lit}) */}}` : m;
                },
              );
              // ⚠️ 2026-08-25 移除 JS 数字剥离（原第3步）：正则 /(['"`]?)(数字)\1([,\]})/ 误伤样式值
              // （bgStyle width/height/opacity、rgba 颜色分量、渐变百分比全被清零 → 面板背景消失/颜色变黑）。
              // 与 mc 端对齐：JS/TS 字符串与数字字面量剥离风险大，仅保留上方模板区 >数字< / {{数字}} 剥离。
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
                `🎯 [vue3] 数字字面量诊断：${ghostCount} 处未命中 Figma TEXT 数字（rewrite=${numericRewriteDecision.rewrite}，${numericRewriteDecision.reason}；vision 真值数字 ${textSet.size} 个）`,
              );
            }
          }
        } catch (n1err) {
          this.logger.warn('N1 数字剥离失败（非阻断）', {
            error: n1err.message,
          });
        }

        // 🎯 N2 图表生成兜底（vue3 端，2026-08-31 与 mc 端对齐治本版）：
        // 旧版盲目注入 `import { ref,... } from 'vue'` 与 LLM 已有 import 重复声明 →
        // SFC 编译失败（mc 端事故 mc-max-1788174922721-1034fb6d 同根因，vue3 端同代码复用风险）。
        // 改用 code-healer.injectEchartsFallback（import 差集 + 符号冲突检测 + 根容器内注入），
        // 并加注入器自检防线：注入后 validateVueSfc，失败即回滚。
        try {
          const chartsForGuard = Array.isArray(input.charts)
            ? input.charts
            : [];
          const hasEcharts = Object.values(codeResult.files).some(
            (f) => typeof f === 'string' && f.includes('echarts.init('),
          );
          if (chartsForGuard.length > 0 && !hasEcharts) {
            const idxPathN2 = 'package/index.vue';
            const targetFile = codeResult.files[idxPathN2];
            if (typeof targetFile === 'string') {
              const firstChart = chartsForGuard[0] || {};
              const chartType = resolveEchartsType(firstChart.type) || 'line';
              const chartSeries = (
                Array.isArray(firstChart.series) ? firstChart.series : ['trend']
              ).join(', ');
              const healedForN2 =
                microcodeHealer.healVueEmbeddedStyleBraces(targetFile);
              const patched = microcodeHealer.injectEchartsFallback(healedForN2, {
                chartType,
                chartSeries,
              });
              if (patched !== healedForN2) {
                const guardN2 = validateVueSfc(patched, idxPathN2);
                if (guardN2.valid) {
                  codeResult.files[idxPathN2] = patched;
                  this.logger.warn(
                    `⚠️ [vue3] 图表生成兜底：vision.charts.length=${chartsForGuard.length} 但产物无 echarts，已注入占位（type=${chartType} series=${chartSeries}，SFC 自检通过）。请人工补数据/样式`,
                  );
                } else {
                  this.logger.warn(
                    `⚠️ [vue3] 图表兜底注入后 SFC 自检失败，已回滚（拒绝把合格产物改坏）：${(guardN2.errors || [])
                      .slice(0, 2)
                      .join(' | ')}`,
                  );
                  if (
                    healedForN2 !== targetFile &&
                    validateVueSfc(healedForN2, idxPathN2).valid
                  ) {
                    codeResult.files[idxPathN2] = healedForN2;
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

        // 🎯 N3 bg→父容器强制挂载（vue3 端，mc 端已有；2026-08-25 用户规则）：
        // bg 是父元素的背景图/背景样式；嵌套容器 bg（mountTarget）必须挂到对应容器；
        // 面板直接子 bg（skipMount）不还原；icon/img 不挂载。
        try {
          const mappingN3 =
            resolveResourceDomMapping(
              input.resourceDomMapping,
              input.outputPath,
            ) || [];
          // 只强制挂「整块背景」（bgRole=container）；局部/状态背景（sub-state）挂子项，不强制挂父容器
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
              // 🎯 背景完整四件套（2026-08-25）：size 用 figmaBox 实际尺寸、position 用相对父容器偏移、repeat 按面积比
              const fw = Math.round(
                bg.figmaBox?.width || bg.visualMeta?.width || 0,
              );
              const fh = Math.round(
                bg.figmaBox?.height || bg.visualMeta?.height || 0,
              );
              let posX = 0,
                posY = 0;
              if (
                bg.parentBox &&
                bg.figmaBox &&
                (bg.parentBox.width || bg.parentBox.height)
              ) {
                posX = Math.round((bg.figmaBox.x || 0) - (bg.parentBox.x || 0));
                posY = Math.round((bg.figmaBox.y || 0) - (bg.parentBox.y || 0));
              }
              let repeatMode = 'no-repeat';
              if (bg.parentBox && fw > 0 && fh > 0) {
                const pa =
                  (bg.parentBox.width || 0) * (bg.parentBox.height || 0);
                if (pa > 0 && fw * fh < pa * 0.5) repeatMode = 'repeat';
              }
              const sizeStr =
                fw > 0 && fh > 0 ? fw + 'px ' + fh + 'px' : '100% 100%';
              // 背景值：有图用图（import 变量已注入），无图用 Figma 渐变/纯色
              const bgCss = hasImage
                ? 'backgroundImage: `url(\${' +
                  varName +
                  "})`, backgroundSize: '" +
                  sizeStr +
                  "', backgroundPosition: '" +
                  posX +
                  'px ' +
                  posY +
                  "px', backgroundRepeat: '" +
                  repeatMode +
                  "'"
                : "background: '" + fills.replace(/'/g, "\\'") + "'";
              // 在所有 .vue 产物中收集候选元素：class 词集与 mountTarget 词集求交集，取最高分且无背景者
              let best = null;
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
                `🎯 [vue3] bg→父容器强制挂载：${mountedCount} 处（${bgMounts.map((b) => b.mountTarget).join(', ')}）`,
              );
            }
          }
        } catch (n3err) {
          this.logger.warn('N3 bg 挂载失败（非阻断）', {
            error: n3err.message,
          });
        }
      } catch (postErr) {
        this.logger.warn('确定性后处理失败（非阻断）', {
          error: postErr.message,
        });
      }

      // 🎯 根容器尺寸锚定 —— 已于 2026-08-31 中性化迁出（删除原内联实现）。
      // 旧实现写死 width:Wpx/height:Hpx（违反 root-container.md 规范，比例应走
      // aspect-ratio 真值），背景注入还是 R7 前旧逻辑（LLM 已写背景就跳过 → CODE-014
      // BLOCK 改不掉）。现由 generateCode 内 fixPipeline 的 anchor-root-container
      // 规则接管（共享纯函数，与微码链路同一事实源，详见 validators/code-fix-rules.js）。

      // 🎯 N5 白边框剥离（2026-08-25）：挂载了背景图的容器不应再有 border（Figma 描边被 LLM 误读为 border）
      try {
        const idxPathN5 = 'package/index.vue';
        const srcN5 = codeResult.files[idxPathN5];
        if (typeof srcN5 === 'string') {
          const bgClasses = new Set();
          const tagReN5 = /<[a-zA-Z][a-zA-Z0-9-]*(?:(?!>).)*?>/g;
          let t;
          while ((t = tagReN5.exec(srcN5)) !== null) {
            if (!/backgroundImage/.test(t[0])) continue;
            const cm = t[0].match(/\bclass="([\w-]+)"/);
            if (cm) bgClasses.add(cm[1]);
          }
          let fixed = srcN5;
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
          if (fixed !== srcN5) {
            codeResult.files[idxPathN5] = fixed;
            this.logger.info('🎯 [vue3] 白边框已剥离（背景图容器）');
          }
        }
      } catch (n5err) {
        this.logger.warn('N5 白边框剥离失败（非阻断）', {
          error: n5err.message,
        });
      }

      // 🛡️ FLEX-003 量纲归一（2026-09-02，mc-max-1788362388732-1ae956dc 同源）：
      // 同一 class 跨文件 flex grow 量纲冲突时对齐到像素量级（与微码链路同事实源）。
      const _flexFilesArr = Object.entries(codeResult.files || {})
        .map(([path, content]) => ({ path, content }))
        .filter((f) => typeof f.content === 'string');
      const _flexNormalized = normalizeFlexSourceConflicts(_flexFilesArr);
      if (_flexNormalized !== _flexFilesArr) {
        let _flexNormCount = 0;
        for (const nf of _flexNormalized) {
          const prev = codeResult.files[nf.path];
          if (prev !== undefined && prev !== nf.content) {
            codeResult.files[nf.path] = nf.content;
            _flexNormCount++;
          }
        }
        if (_flexNormCount > 0) {
          this.logger.info('🛡️ FLEX-003 量纲归一（vue3 落盘前）', {
            files: _flexNormCount,
          });
        }
      }

      // 🛡️ 父类 MicrocodeEngineer.writeFiles 返回 { written, skipped }（对象，非数组）。
      // 此前按旧数组形态直接使用导致 writtenFiles.map is not a function（写盘成功后任务仍失败）。
      const { written: writtenFiles, skipped: writeSkipped } = this.writeFiles(
        codeResult.files,
        outputPath,
      );
      if (writeSkipped && writeSkipped.length > 0) {
        this.logger.warn('⚠️ Vue3 写盘部分文件被跳过', {
          skipped: writeSkipped,
        });
      }
      onProgress?.({
        fileLifecycle: {
          phase: 'writing',
          summary: `Vue3 文件已写入 ${writtenFiles.length} 个`,
          files: writtenFiles.map((path) => ({ path, state: 'modified' })),
        },
      });

      // 强制子组件覆盖度统计
      const generatedSubFiles = writtenFiles.filter((f) =>
        f.startsWith('package/components/'),
      );
      const missingCount = subPlan.isForced
        ? Math.max(0, (subPlan.minFiles || 0) - generatedSubFiles.length)
        : 0;

      //  资源引用安全网（告警级）——校验 LLM 引用的资源变量是否都有对应已下载资源。
      //  🛡️ 2026-08-25：从仅查 index.vue 扩展为遍历所有 .vue 文件（含子组件），
      //     否则子组件里 `url(${bg1})` 引用未注入变量会被静默漏网（mv-max-1787649228186 SectionHeader 实锤）。
      if (resourceDomMapping) {
        // R0-6（2026-09-01）：可用资源过滤统一走 filterAvailableResources 单一帮手
        const availableResources = filterAvailableResources(resourceDomMapping);
        const bgM = availableResources.filter(
          (m) => m.previewAnalysisRole === 'bg',
        );
        const iconM = availableResources.filter(
          (m) => m.previewAnalysisRole === 'icon',
        );
        const imgM = availableResources.filter(
          (m) =>
            m.previewAnalysisRole === 'img' ||
            m.previewAnalysisRole === 'image',
        );
        const availableVars = new Set();
        bgM.forEach((m, i) => {
          availableVars.add(`bg${i + 1}`);
          if (m.semanticVarName) availableVars.add(m.semanticVarName);
        });
        iconM.forEach((m, i) => {
          availableVars.add(`icon${i + 1}`);
          if (m.semanticVarName) availableVars.add(m.semanticVarName);
        });
        imgM.forEach((m, i) => {
          availableVars.add(`img${i + 1}`);
          if (m.semanticVarName) availableVars.add(m.semanticVarName);
        });
        const varPattern = /\b(bg|icon|img)(\d+)\b/g;
        for (const filePath of Object.keys(codeResult.files)) {
          if (!filePath.endsWith('.vue')) continue;
          const code = codeResult.files[filePath];
          const referenced = new Set();
          let vm;
          varPattern.lastIndex = 0;
          while ((vm = varPattern.exec(code)) !== null) referenced.add(vm[0]);
          resourceDomMapping
            .filter((rm) => rm.semanticVarName)
            .forEach((rm) => {
              if (code.includes(rm.semanticVarName))
                referenced.add(rm.semanticVarName);
            });
          const orphan = [...referenced].filter((v) => !availableVars.has(v));
          if (orphan.length > 0) {
            this.logger.warn(
              `⚠️ Vue3 组件(${filePath})引用了未注入的资源变量：${orphan.join(', ')}（可能指向不存在的图片，渲染将失败）`,
            );
          }
        }
      }

      // 🛡️ 正向漏用检查（方案5，告警级，零 LLM）：复用资源归属校验器，检测 bg 背景资源未被引用
      // （漏用整体/区域背景，mv-max-1787709055958 实锤）。与上方反向检查互补：
      // 反向 = 引用未注入资源；正向 = 已下载 bg 资源未被引用。
      {
        const _attr = validateResourceAttribution({
          resourceDomMapping: effectiveMapping,
          files: codeResult.files,
          rootBox: input.figmaNodeData?.absoluteBoundingBox || null,
          // 🔴 0907 L7 治本·跨 section 资源错绑 BLOCK（防御性门禁）
          sectionManifest: buildResourceManifest(effectiveMapping),
        });
        if (_attr.issues.length > 0) {
          for (const issue of _attr.issues) {
            this.logger.warn(`⚠️ Vue3 资源归属校验：${issue.message}`);
          }
          onProgress?.({
            stage: '资源归属校验',
            message: `⚠️ ${_attr.issues.length} 个背景资源未被引用（可能存在背景缺失）`,
            status: 'warning',
            details: _attr.issues.map((i) => i.message),
          });
          // 挂到 input，经 execute 返回写回 state，供重试轮次注入归属指导。
          if (!input._attributionGuidance) {
            input._attributionGuidance = generateAttributionGuidance(
              _attr.issues,
              _attr.bgAttribution,
            );
          }
        }
      }

      this.logger.info('✅ Vue3 组件生成完成', { files: writtenFiles });

      // 🛡️ R2-2（2026-09-11，vue3 端补齐，与 mc 侧 microcode-engineer 对齐）：六条产物不变量终验
      // （I1 根高度 / I2 标签↔import↔文件 / I3 tabs 唯一 / I4 形态锚定 / I5 类名对齐 / I6 资源挂载）。
      // 与 scripts/artifact-invariants.mjs CLI 共用同一实现（动态 import，故静态 grep 查不到）。
      // 报告性校验：error 级违规落日志 + 随任务 result 暴露，**不 fail-closed 阻断**。
      let _artifactInvariants = null;
      try {
        const { runArtifactInvariants } = await import(
          '../utils/artifact-invariants.js'
        );
        _artifactInvariants = runArtifactInvariants(codeResult.files);
        if (!_artifactInvariants.passed) {
          const _errs = _artifactInvariants.violations.filter(
            (v) => v.severity === 'error',
          );
          this.logger.warn(
            `🛡️ [vue3] 产物不变量违规：${_errs.length} error / ${
              _artifactInvariants.violations.length - _errs.length
            } warn`,
            { violations: _artifactInvariants.violations.slice(0, 20) },
          );
        }
      } catch (invErr) {
        this.logger.warn('🛡️ [vue3] 产物不变量校验执行失败（非阻断）', {
          error: invErr?.message,
        });
      }

      // 只有完整文件组完成全部组装、截断检查和后处理后才发布候选快照。
      if (typeof onFilesReady === 'function') {
        try {
          await onFilesReady({
            stage: 'vue3-engineer',
            files: codeResult.files,
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
          summary: 'Vue3 文件组已生成完毕，等待运行时质量门禁',
        },
      });

      return {
        files: codeResult.files,
        generatedFiles: codeResult.files,
        writtenFiles,
        componentDir: outputPath,
        componentName,
        componentStructure: {
          mainComponent: 'package/index.vue',
          subComponents: writtenFiles.filter((f) =>
            f.startsWith('package/components/'),
          ),
          styles: writtenFiles.filter((f) => f.endsWith('.less')),
        },
        // 🧩 强制子组件覆盖度结果（上层可据此触发 retry）
        subComponentCoverage: {
          expectedMinFiles: subPlan.minFiles || 0,
          generatedCount: generatedSubFiles.length,
          generatedFiles: generatedSubFiles,
          missingCount,
          isForced: !!subPlan.isForced,
          planReason: subPlan.reason,
        },
        autoFixes: [],
        // 🛡️ R2-2：六条产物不变量结果（violations/passed/summary），供任务 meta 与前端展示
        artifactInvariants: _artifactInvariants || undefined,
        // 🛡️ 资源归属指导（方案5）：经 graph 写回 state，供重试轮次注入。
        _attributionGuidance: input._attributionGuidance || null,
      };
    } catch (error) {
      this.logger.error('Vue3 组件生成失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 🛡️ 资源 import 去重保险：对单个 .vue 文件的所有 <script>/<script setup> 块，
   * 按"默认导入本地名"去重（同一名字的 `import X from '...'` 只保留首个声明）。
   *
   * 用途：防御 LLM 手写重复 import 在 injectResourceImports 未运行（resourceDomMapping 为空）
   * 时被原样写盘，导致预览时 SyntaxError: Identifier 'X' has already been declared。
   *
   * 说明：同一模块作用域内不可能存在两个同名的默认导入（这是 JS 重复声明错误），
   * 因此"保留首个、删除其余"永远是安全且正确的修复。
   *
   * 额外修复：清理命名空间导入末尾多余的 `as alias`（如 `import * as X from '...' as X`）。
   *
   * @param {string} code 单份 .vue 文件源码
   * @returns {{ code: string, modified: boolean }}
   */
  dedupImportsByLocalName(code) {
  return _dedupImportsByLocalName(code);
  }

  /**
   * 🛡️ Import 语法修复保险：检测并修复 LLM 生成的常见 import 语法错误。
   *
   * 修复场景：
   * 1. `import * as X from '...' as X` → `import * as X from '...'`（命名空间导入后多余的 as 别名）
   * 2. `import X from '...' as X` → `import X from '...'`（默认导入后多余的 as 别名）
   * 3. `import { X } from '...' as Y` → `import { X } from '...'`（命名导入后多余的 as 别名）
   *
   * 原因：LLM 偶尔会在 import 语句末尾错误地追加 `as alias`，导致 Vite 编译失败。
   *
   * @param {string} code 单份 .vue 文件源码
   * @returns {{ code: string, modified: boolean }}
   */
  fixImportSyntax(code) {
  return _fixImportSyntax(code);
  }
}

export default Vue3Engineer;
