/**
 * 🧩 方案 A 拆分模块：Prompt Builder
 * 
 * 职责：构建代码生成 Prompt（含分块 prompt、自检清单、约束强化）
 * 
 * 从 microcode-engineer.js 拆分出的纯函数模块
 */

import {
  buildSharedSections,
  buildConcerns,
  buildFigmaStage,
  formatAssetsList,
  trimConstraintsForContext,
} from '../../utils/prompt-loader.js';
import {
  buildAllConstraintReinforcements,
  buildLayoutConstraintReinforcement,
  buildResourceConstraintReinforcement,
  buildStyleConstraintReinforcement,
} from '../../utils/constraint-reinforcement.js';
import {
  formatResourceMapping,
} from '../../utils/resource-mapping-formatter.js';
import {
  scopedResourceDomMapping,
  buildResourceManifest,
} from '../../utils/resource-manifest.js';
import {
  extractSections,
  extractElements,
  formatFigmaStyleData,
  formatFigmaStructureOnly,
  filterElementStyleMapForTemplate,
  formatVisualStyle,
} from '../../utils/figma-format.js';
import {
  resolveResourceDomMapping,
  extractResourceVarNames,
} from '../../utils/resource-import-guard.js';
import { buildRetryPrompt as buildRetryPromptBase } from '../../utils/retry-prompt.js';
import { safeLogger } from '../../logger/safe-logger.js';
// 🛡️ P0（2026-09-04）：注入 Figma 文字真值白名单，防止 LLM 臆造/OCR 误读文字
import { collectFigmaTextTruth } from '../../utils/text-truth-guard.js';

/**
 * 构建代码生成 Prompt（主入口）
 * @param {Object} input - 生成输入参数
 * @param {Object} chunkSpec - 分块规格（可选）
 * @param {Object} options - 选项（logger, constraints, componentType 等）
 * @returns {string} 完整的 prompt 文本
 */
export function buildCodePrompt(input, chunkSpec, options = {}) {
  const { constraints = {}, componentType = 'microcode', normalizeComponentId } = options;
  const logger = safeLogger(options.logger);
  
  try {
    const {
      layoutStructure,
      visualElements,
      componentName,
      displayName,
      stage = 'preview',
      previousCritiques,
      charts,
      interactions,
      analysisType,
      analysisTarget,
      analysisDescription,
      analysisEvidence,
      figmaNodeData,
      figmaStyleTree,
      styleMappings,
      assets,
      resourceDomMapping,
      headerSlots,
      panelType = 'default-panel',
      elementStyleMap,
      backgroundBrightness = 'dark',
    } = input;

    if (
      input._visualDegraded ||
      layoutStructure?.degraded ||
      layoutStructure?.visualDegraded
    ) {
      throw new Error(
        `视觉分析不可信，禁止构建代码生成 Prompt，避免模型基于名称/行业语义臆造内容。原因：${input._visualDegradeReason || layoutStructure?.degradeReason || '未知'}`,
      );
    }

    // 参数验证：确保 componentName 是有效的字符串
    if (!componentName || typeof componentName !== 'string') {
      throw new Error(
        `Invalid componentName: ${typeof componentName} ${JSON.stringify(componentName)}`,
      );
    }

    // 根据面板明暗确定 theme-vars.less 默认主题
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';

    // 规范化组件 ID（c- 前缀）
    const componentId = normalizeComponentId 
      ? normalizeComponentId(componentName) 
      : componentName;

    // 判断是否为修订模式
    const isRevision = previousCritiques && previousCritiques.length > 0;

    // 构建修订指导部分
    const revisionSection = isRevision
      ? `
# ⚠️ 代码修订指导

**这是第${(input.iterationCount || 0) + 2}轮修订**，上一版本代码存在以下问题，请针对性修复：

${previousCritiques
  .map(
    (critique, index) => `
## 问题 ${index + 1}: ${critique.issue}

- **严重程度**: ${critique.severity === 'high' ? '🔴 HIGH (必须修复)' : critique.severity === 'medium' ? '🟡 MEDIUM (建议修复)' : '🟢 LOW (可选)'}
- **类别**: ${critique.category}
- **位置**: ${critique.location || '未指定'}
- **修复建议**: ${critique.fix || '请根据问题描述自行判断'}

`,
  )
  .join('\n')}

**修订要求**：
1. ✅ **必须修复所有 HIGH 级别问题**
2. ⚡ **尽量修复 MEDIUM 级别问题**
3. 🎯 **使用外科手术式修改** - 只修改有问题的部分，保持其他代码不变
4. 📝 **在修复的代码附近添加注释**，说明修复了什么问题（例如：\`// Fixed: 添加aria-label以提升可访问性\`）

---

`
      : '';

    // 运行时修订指导（来自 classifyRuntimeGate）
    const runtimeRevisionSection = input._runtimeRevisionGuidance
      ? `
# ⚠️ 运行时问题修订指导

上一版本在运行时预览中出现以下问题，必须修复：

**问题范围**: ${input._runtimeRevisionGuidance.scope || 'runtime'}
**修订目标**: ${input._runtimeRevisionGuidance.reviseTarget || 'incremental'}

## 需要修复的问题
${(input._runtimeRevisionGuidance.focusAreas || []).map((area, i) => `${i + 1}. ${area}`).join('\n')}

## 证据
${JSON.stringify(input._runtimeRevisionGuidance.evidence || [])}

## 修复规则
${(input._runtimeRevisionGuidance.rules || []).map((rule) => `- ${rule}`).join('\n')}

**重要**：只修复上述运行时问题，不要改动其他功能。

---

`
      : '';

    const shared =
      buildSharedSections({
        componentName,
        componentId,
        panelType,
        complexityHint: '', // 复杂度提示由调用方注入
        headerSlots: JSON.stringify(headerSlots || []),
        componentType: componentType || 'microcode',
      }) +
      `


# 当前阶段
${stage}${isRevision ? ' (修订模式)' : ''}

${revisionSection}
${runtimeRevisionSection}
# 输入信息

## 布局结构（权威蓝图，优先于 Figma 树）

> 🔴 **铁律**：以下是视觉分析识别的**权威布局结构**，生成 \`<template>\` 时必须**严格遵循**，不得偏离：
> 1. **布局方向**：每个节点的 \`layout\` 字段（\`horizontal\` / \`vertical\` / \`grid\`）是硬约束——\`vertical\` 的 tab-list 必须生成垂直导航列，禁止改成横排 tabs；\`horizontal\` 的 stats-row 必须横向排列。
> 2. **网格列数**：\`gridColumns\` 是硬约束——\`gridColumns: 3\` 必须生成 3 列网格，禁止退化成竖向列表。
> 3. **分区顺序**：\`sections[].body.children[]\` 的数组顺序即 DOM 从上到下的顺序，禁止颠倒或重排。
> 4. **Figma 树仅用于**：资源引用（图标/背景图对应的 \`bgX\`/\`iconX\` 变量）与样式取值（颜色/尺寸/圆角），**不用于决定布局结构**。当 Figma 树的节点层级与 layoutStructure 矛盾时，**一律以 layoutStructure 为准**。

\`\`\`json
${JSON.stringify(layoutStructure)}
\`\`\`

${formatVisualStyle(visualElements)}

${
  charts && charts.length > 0
    ? `
## 图表信息
\`\`\`json
${JSON.stringify(charts)}
\`\`\`
`
    : ''
}
${
  input.chartDataHints && input.chartDataHints.length > 0
    ? `
## 📊 图表数据提示（从 Figma 节点提取的数值，必须使用！）

**🔴 铁律：图表中的数据值必须从以下提示中获取，禁止编造数值！**

\`\`\`json
${JSON.stringify(input.chartDataHints)}
\`\`\`

**使用规则**：
1. ✅ labels 数组中的值 → 用作 xAxis.data / legend.data / 系列名称
2. ✅ values 数组中的值 → 用作 series[].data，保持数值精确
3. ❌ 禁止使用 100, 200, 300 等编造数据
4. ❌ 禁止使用 '数据1', '数据2' 等占位标签
`
    : ''
}
${
  interactions && interactions.length > 0
    ? `
## 交互信息
\`\`\`json
${JSON.stringify(interactions)}
\`\`\`
`
    : ''
}
${
  analysisType
    ? `
# 🎯 组件类型上下文（视觉分析识别的组件类型）

- **组件类型**: ${analysisType}${analysisTarget ? `\n- **目标区域**: ${analysisTarget}` : ''}${analysisDescription ? `\n- **功能描述**: ${analysisDescription}` : ''}${analysisEvidence && analysisEvidence.length > 0 ? `\n- **视觉证据**:\n${analysisEvidence.map((e) => `  - ${e}`).join('\n')}` : ''}

⚠️ **重要**：以上是视觉分析从设计图中识别出的组件类型和描述。即使 layoutStructure.sections 为空，你也必须根据这些信息生成完整的组件代码。例如：
- 如果 type=tab-switch → 生成带有多个可切换标签的导航组件
- 如果 type=chart → 生成图表展示组件
- 如果 type=form → 生成表单组件
- description 中提到的标签名称必须作为 tab 项，例如 "监控、照明、通风、供配电、消防、交通诱导" 应生成 6 个 tab 标签

`
    : ''
}

${
  stage === 'figma'
    ? buildFigmaStage({
        figmaRulesContent:
          constraints['references/prompts/figma.md'] || '',
        figmaStyleTree:
          chunkSpec?.segmentType === 'template' ? null : figmaStyleTree,
        figmaNodeData,
        formatFigmaStyleData:
          chunkSpec?.segmentType === 'template'
            ? formatFigmaStructureOnly
            : formatFigmaStyleData,
        styleMappings,
        elementStyleMap:
          chunkSpec?.segmentType === 'template'
            ? filterElementStyleMapForTemplate(elementStyleMap)
            : elementStyleMap,
        assets,
        resourceDomMapping,
        formatResourceMapping,
        compactResourceMapping: chunkSpec?.segmentType === 'template',
        componentType,
        componentPrefix: componentId,
        visualElements,
      })
    : ''
}

# 开发规范

${trimConstraintsForContext(
  constraints['references/ai-generation-constraints.md'] || '',
  {
    hasCharts: charts && charts.length > 0,
    hasInteractions: interactions && interactions.length > 0,
  },
)}

${constraints['references/patterns/code-patterns.md'] || ''}

${componentType === 'vue3' ? '' : constraints['references/specs/declare-json.md'] || ''}

#Vue 样式标准（v3.0 Phase 1 - 强制 scoped + less + 前缀）

${constraints['references/standards/vue-style-standard.md'] || ''}

${constraints['references/standards/less-naming-convention.md'] || ''}
${buildConcerns({
  hasInteractions: interactions && interactions.length > 0,
  hasCharts: charts && charts.length > 0,
})}

${
  buildAllConstraintReinforcements({
    layoutStructure,
    availableResources: resolveResourceDomMapping(
      resourceDomMapping,
      input.outputPath,
    ),
  })
}

${
  `
## 🎨 父子组件样式隔离策略

### 尺寸约束规则
**父组件职责**：约束子组件的外部尺寸
\`\`\`less
.c-parent-container {
  display: flex;
  gap: 16px;

  // ✅ 正确：父组件约束子组件的外部尺寸
  .c-child-component {
    width: 300px;
    height: 200px;
  }
}
\`\`\`

**子组件职责**：填充父组件给定的空间
\`\`\`less
// 子组件 components/Child.vue
.c-child-root {
  // ✅ 正确：填充父组件给定的空间
  width: 100%;
  height: 100%;

  // ✅ 正确：内部样式（颜色、边框、内边距）
  padding: 12px;
  color: @color-text;
  border: 1px solid @color-border;

  // ❌ 错误：子组件不应设置 margin（由父组件的 gap 控制）
  // margin: 20px;
}
\`\`\`

### 间距管理规则
**父组件**：用 gap 控制子组件间距
\`\`\`less
.c-parent-container {
  display: flex;
  gap: 16px;  // ✅ 正确：统一控制所有子组件的间距
}
\`\`\`

**子组件**：只管理内部间距（padding），禁止 margin
\`\`\`less
.c-child-root {
  padding: 12px;  // ✅ 正确：内部间距
  // margin: 16px;  // ❌ 错误：应由父组件控制
}
\`\`\`

### 违规后果
- 子组件设置 margin 会导致间距冲突
- 子组件不设置 width: 100%; height: 100% 会导致尺寸不受控
- 违反样式隔离原则会降低子组件复用率
`
}
`;

    const middleFull = `
# 任务要求

请生成完整的微码组件核心代码，包括：

1. **declare.json** - 组件配置文件
2. **package/index.vue** - 主组件文件
3. **package/components/*.vue** - 子组件文件（如需要）
4. **resources/styles/common.less** - 业务样式（全部业务 class 都写在这里）
5. **resources/styles/themes/theme-vars.less** - 主题变量 mixin

注意：**index.less**、**dark.less**、**light.less** 是固定模板，由生成器自动补充，你不需要输出。

## 关键约束

**组件ID规范**：
- declare.json 中的 componentId 必须使用：\`${componentName}\`
- declare.json 中的 componentName（中文显示名称）必须使用：\`${displayName || componentName}\`
- 不要自行创造组件ID或名称，必须严格使用上面指定的值

**Less变量规范（纯 Less 变量主题模式）**：
- theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`
- 颜色变量定义在主题 mixin 内部；theme-vars.less 根级禁止调用任何主题 mixin
- index.less 由生成器自动生成，结构固定为「根作用域调用默认主题 mixin → 导入 common.less」：
  \`\`\`less
  @import './themes/theme-vars.less';
  .common();
  .theme-dark();              // 默认主题，由面板明暗自动决定
  @import (multiple) './common.less';
  \`\`\`
  ⚠️ common.less 的规则必须落在**根作用域**（宿主不会给组件根加 .dark/.light 类，
  一旦被包进 \`.dark {}\` 就编译成 \`.dark .c-xxx\`，真实 DOM 上 0 命中 → 全部样式失效）
- 正确格式示例：
\`\`\`less
// theme-vars.less
.common() {
  // 可放置跨主题共享变量
}
.theme-dark() {
  @color-card-bg: rgba(255, 255, 255, 0.05);
  @color-text-primary: #ffffff;
  @color-text-secondary: rgba(255, 255, 255, 0.65);
}
.theme-light() {
  @color-card-bg: #ffffff;
  @color-text-primary: #333333;
  @color-text-secondary: rgba(0, 0, 0, 0.65);
}
// theme-vars.less 内根级禁止调用 mixin；由生成器在 index.less 根作用域调用默认主题。
\`\`\`
- **index.less / dark.less / light.less 由生成器自动创建，不要输出**

**Figma精修要求**：
- 严格按照布局结构和视觉元素生成代码
- 使用真实的尺寸、间距、字体大小
- 不要使用占位符数据，根据设计推断合理的示例数据
- 颜色、圆角、阴影等样式要与设计稿一致

**容器约束规范**（防止内容溢出）：
- 组件顶层容器必须设置：\`width: 100%; height: 100%;\`
- 所有容器使用：\`box-sizing: border-box;\`
- 根容器设置：\`overflow: hidden;\` 防止内容溢出
- 使用 flexbox 或 grid 布局使内容自适应容器尺寸
- 内部元素避免使用固定宽高，优先使用百分比或flex属性
- 示例：
\`\`\`less
.component-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
\`\`\`

# 输出格式

请按照以下格式输出（**不要用 JSON**，用文件分隔符格式，更节省 token 避免截断）：

\`\`\`
// === declare.json ===
{
  "componentId": "${componentName}",
  "componentName": "${displayName || componentName}",
  ...
}

// === package/index.vue ===
<template>
  ...
</template>
<script setup>
...
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>

// === resources/styles/common.less ===
.c-${componentName}-root { ... }

// === resources/styles/themes/theme-vars.less ===
.common() { /* 跨主题共享变量 */ }
.theme-dark() { /* 深色变量 */ }
.theme-light() { /* 浅色变量 */ }
// 根级禁止调用主题 mixin；由生成器在 index.less 根作用域调用默认主题。
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，**不要转义换行符和引号**（不要用 \\n 和 \\" ）
- 文件之间用空行分隔
- 不要包裹在 JSON 中，不要用 \`\`\`json 代码块
${outputFormatWarnings(true)}

**⚠️ 不要生成以下文件**（由系统自动生成标准模板）：
- \`component.js\` - 系统将自动生成正确的样式引用（.less）
- \`declare.js\` - 系统将自动生成标准的声明文件
- \`resources/styles/index.less\` - 系统将自动生成入口导入
- \`resources/styles/themes/dark.less\` 和 \`resources/styles/themes/light.less\` - 系统将自动生成固定主题包装
`;

    // 分块生成：若传入 chunkSpec.middle 则使用分块版"任务要求+输出格式"，否则用完整版
    const middle =
      chunkSpec && chunkSpec.middle ? chunkSpec.middle : middleFull;

    // type-aware shared 段裁剪
    const sharedFilter = chunkSpec?.sharedFilter || 'full';
    const trimmedShared =
      sharedFilter !== 'full'
        ? trimSharedForFileType(shared, sharedFilter, options)
        : shared;

    // 自检清单按文件类型裁剪
    const fileType = chunkSpec?.sharedFilter || 'index.vue';
    const checklist = buildChecklistByType(fileType, input, options);

    // 核心约束
    const hasCharts = Array.isArray(charts) && charts.length > 0;
    const coreBase = `
# 核心约束

1. 严格遵循preview阶段规则
2. 不要添加设计稿中没有的装饰元素
3. 正确区分section的header和body层级
4. 所有业务样式写在common.less中
`;

    const chartCore = hasCharts
      ? `
5. 图表图例：设计稿有明确自定义图例样式时使用 DOM 图例并与图表联动（dispatchAction）；无特殊样式要求时使用 ECharts 内置 legend 组件
`
      : '';

    // 🛡️ P0（2026-09-04）：注入 Figma 文字真值白名单，防止 LLM 臆造/OCR 误读文字
    const textTruthWhitelist = input.figmaNodeData
      ? buildTextTruthWhitelist(input.figmaNodeData)
      : '';

    // 🧭 把子组件规划诊断前移进 prompt，让模型直接看到 coverage / truth / chrome / resource 事实
    const plannerDiagnosticsBlock = normalizePlannerDiagnostics(input);

    const coreAndChecklist =
      coreBase + chartCore + textTruthWhitelist + plannerDiagnosticsBlock + checklist;

    // 🏢 一体化平台约束（mc-only，vue3 不要求；M5-6/M5-7/M6-3a/M6-3b/M3-4c）
    const platformBlock =
      componentType === 'microcode'
        ? buildMcPlatformConstraints(input, options)
        : '';

    const prompt =
      trimmedShared +
      middle +
      coreAndChecklist +
      platformBlock +
      '\n开始生成代码：\n';
    return prompt;
  } catch (error) {
    if (logger) {
      logger.error('buildCodePrompt 执行失败', {
        error: error.message,
        componentName: input?.componentName,
        stage: input?.stage,
      });
    }
    throw error;
  }
}

/**
 * type-aware shared 段裁剪
 * 双层裁剪：① 文件级（按 <!-- shared-file: ... --> 标记整块移除无关规范文件）
 *          ② section 级（按节标题正则移除）
 */
export function trimSharedForFileType(shared, filter, options = {}) {
  const logger = safeLogger(options.logger);
  if (!shared || filter === 'full') return shared;

  // ── ① 文件级裁剪（P1-4）──────────────────────────────────────────
  const removeFiles = {
    script: ['layout-iron-rules.md', 'text-fidelity.md', 'class-naming.md'],
    declare: [
      'layout-iron-rules.md',
      'resource.md',
      'root-container.md',
      'layout-rules.md',
      'text-fidelity.md',
      'class-naming.md',
      'mc-builder.md',
      'base-panel.md',
      'base-panel-slots.md',
    ],
    style: ['mc-builder.md', 'base-panel.md', 'base-panel-slots.md'],
  };
  let trimmed = shared;
  const filesToRemove = removeFiles[filter] || [];
  for (const fname of filesToRemove) {
    const marker = `<!-- shared-file: engineer/shared/${fname} -->`;
    let startIdx = trimmed.indexOf(marker);
    while (startIdx !== -1) {
      const searchFrom = startIdx + marker.length;
      const nextFile = trimmed.indexOf('<!-- shared-file:', searchFrom);
      const endMark = trimmed.indexOf(
        '<!-- shared-files-end -->',
        searchFrom,
      );
      let endIdx;
      if (nextFile !== -1 && endMark !== -1)
        endIdx = Math.min(nextFile, endMark);
      else endIdx = nextFile !== -1 ? nextFile : endMark;
      if (endIdx === -1) endIdx = trimmed.length;
      trimmed = trimmed.slice(0, startIdx) + trimmed.slice(endIdx);
      startIdx = trimmed.indexOf(marker);
    }
  }
  if (filesToRemove.length > 0 && logger) {
    const savedFiles = shared.length - trimmed.length;
    if (savedFiles > 0) {
      logger.info(`🧹 文件级裁剪: ${filter}`, {
        removedFiles: filesToRemove.length,
        savedChars: savedFiles,
      });
    }
  }

  // ── ② section 级裁剪（原逻辑）───────────────────────────────────
  const removeSections = {
    template: [
      '## 3.1️⃣ $mcComponentBuilder',
      '## 4️⃣ 样式文件结构',
      '## 2.2️⃣ 元素样式差异化规则',
    ],
    script: [
      '## 4️⃣ 样式文件结构',
      '## 2️⃣ 混合布局规则',
      '## 2.1️⃣ stat-item 自身布局方向规则',
      '## 2.3️⃣ 卡片布局规则',
    ],
    component: [
      '## 3.1️⃣ $mcComponentBuilder',
      '## 2️⃣ 混合布局规则',
      '## 2.1️⃣ stat-item 自身布局方向规则',
      '## 2.3️⃣ 卡片布局规则',
    ],
  };

  const sections = removeSections[filter] || [];
  if (sections.length === 0) return trimmed;

  for (const sectionHeader of sections) {
    const escaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRx = new RegExp(`${escaped}[\\s\\S]*?(?=\\n## \\d|$)`, 'g');
    trimmed = trimmed.replace(
      sectionRx,
      `/* [已移除] ${sectionHeader} — ${filter} 分块无需此规范 */\n`,
    );
  }

  const saved = shared.length - trimmed.length;
  if (saved > 0 && logger) {
    logger.info(`🧹 type-aware shared 裁剪: ${filter}`, {
      savedChars: saved,
      pct: Math.round((saved / shared.length) * 100) + '%',
    });
  }
  return trimmed;
}

/**
 * 自检清单按文件类型裁剪
 */
export function buildChecklistByType(fileType, input, options = {}) {
  const { componentType = 'microcode' } = options;
  const { componentName, panelType = 'default-panel' } = input;

  // 基础自检（所有文件类型共享）
  const baseChecklist = `
# ✅ 生成前强制自检清单

**在返回生成的代码之前，你必须逐项检查以下内容：**

## 📋 核心规范自检

- [ ] **资源变量铁律（违反即编译崩溃）**：bg1/bg2/icon1/icon2 等资源变量是 **Vue 模板作用域变量**，只能以模板插值方式使用：
  - ✅ 正确：\`<img :src="icon1">\` 或 \`<div :style="{ backgroundImage: 'url(' + bg1 + ')' }">\`
  - ❌ 错误：在 \`<style>\` 块内写 \`url(\${bg1})\` / \`url(@bg1)\` / \`url(\$bg1)\` —— LESS 会把它们当变量解析，未声明即编译崩溃
  - ❌ 错误：手写 \`import bg1 from '...'\` —— 资源 import 由系统后处理注入
- [ ] **L4-003**: common.less 中所有 class 都使用了 \`.c-\` 前缀（如 \`.c-vehicle-card\`，没有 .item、.box、.wrapper 等通用名）
- [ ] **index.less**: 不要输出 resources/styles/index.less（由生成器按「根作用域默认主题 + @import common.less」固定模板生成）
- [ ] **common.less 作用域**: common.less 内所有业务 class 写在文件根层，**禁止**用 \`.dark {}\` / \`.light {}\` / 任何外层选择器包裹（宿主不会给组件根加主题类，包裹后编译成 \`.dark .c-xxx\`，真实 DOM 0 命中 → 样式全部失效）
- [ ] **style 块**: 末尾有 <style lang="less" scoped> 并 @import 对应的 index.less

## 🔍 样式自检（高频违规）

- [ ] **theme-vars.less 变量类型**：无 CSS 变量（禁止 var(--xxx)），只使用 Less 变量 @xxx
- [ ] **theme-vars.less 作用域**：根级不调用 .common()/.theme-dark()/.theme-light()，由生成器在 index.less 根作用域调用默认主题
- [ ] **theme-vars.less 完整性**：三个 mixin .common()、.theme-dark()、.theme-light() 均已定义且闭合
- [ ] **背景图禁止拉伸变形**：局部/状态背景图（如 Tab 激态背景、卡片装饰条）使用 \`background-size: contain\` 保持原图比例，禁止 \`background-size: 100% 100%\` 强制拉伸导致图案放大变形
- [ ] **Tab 容器禁止边框**：Tab 切换容器（.c-xxx-tabs / tab-list）禁止输出 \`border\` 属性（Figma 描边非真实边框，会生成多余白边）；图标容器同样禁止 \`border\`
`;

  // 主组件专属自检
  if (fileType === 'index.vue' || fileType === 'full') {
    if (componentType === 'vue3') {
      return (
        baseChecklist +
        `
- [ ] **Vue3 范式**：使用 defineProps 接收配置、defineEmits 对外事件；禁止 $mcComponentBuilder / componentProps / businessProps / runtimeBuilder / componentApi（vue3 环境未注入，引用即渲染崩溃）
- [ ] **面板外壳真实还原**：common.less 中 .c-${componentName}-content 需要 background/box-shadow/border-radius（vue3 无 base-panel 宿主，外壳自己写）
- [ ] **生命周期清理**：onBeforeUnmount 中清理 setInterval / echarts dispose() / ResizeObserver disconnect()

## 🔍 常见错误自查

- [ ] 没有在 script 中 import 样式文件（样式只在 <style> 块中 @import）
- [ ] 没有生成组件名命名的 less 文件（如 c-xxx-component.less）
- [ ] 没有用 CSS gradient 替代已下载的 bg 资源

**如果以上任何一项未满足，立即修正后再返回代码。**

---

`
      );
    }
    return (
      baseChecklist +
      `
- [ ] **$mcComponentBuilder**: 在 package/index.vue 的 <script setup> 中调用一次并直接解构（const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()，禁止 let + try-catch 分离）
- [ ] **onload 事件**: 在 onMounted 中调用 runtimeBuilder.publishEvent('${componentName}-onload', {...})
- [ ] **panelKey**: <base-panel panelKey="${panelType}"> 使用了正确的面板类型
- [ ] **declare.json**: businessEvents 包含 '${componentName}-onload' 事件声明；eventDataSchema 至少声明 componentId 和 timestamp（禁止空对象 {}）；componentName 必须是纯中文标题，不要带 cp-/mc-/mc-doc- 等前缀

## 🔍 样式自检（续）

- [ ] **面板外壳**：common.less 中 .c-${componentName}-content 无 background/box-shadow/border-radius（base-panel 已提供）

## 🔍 常见错误自查

- [ ] 没有在 script 中 import 样式文件（样式只在 <style> 块中 @import）
- [ ] 没有生成组件名命名的 less 文件（如 c-xxx-component.less）
- [ ] 没有用 CSS gradient 替代已下载的 bg 资源
- [ ] 没有遗漏 $mcComponentBuilder 的 runtimeBuilder 解构
- [ ] 没有忘记 onMounted 中的 emitLoadEvent 调用

**如果以上任何一项未满足，立即修正后再返回代码。**

---

`
    );
  }

  // 子组件专属自检
  if (fileType === 'component') {
    return (
      baseChecklist +
      `
## 🔍 子组件专属自检

- [ ] **子组件 style 块**：必须为 <style lang="less" scoped> 并 @import '../../resources/styles/index.less'（子组件 style 可选，但禁止无 scoped 的裸 style 污染全局）
- [ ] **子组件 class 命名**：遵循 \`.c-${componentName}-xxx\` 前缀规范

## 🔍 资源使用规范（必须遵守，违反会导致生成失败）

- [ ] **禁止用 CSS gradient 替代已下载的 bg 资源**：如果 resource-dom-mapping 里有 bg 资源（如 bg2、bg3），必须用 :style="{ backgroundImage: \`url(\${bgX})\` }" 绑定，禁止在 CSS 里写 background: linear-gradient(...)
- [ ] **禁止在 scoped CSS 里用 url(varName)**：scoped CSS 中的 url(bg3) 不会解析为 import 的变量，必须改用 inline :style 绑定（如 :style="{ backgroundImage: \`url(\${bg3})\` }"）
- [ ] **图表区域使用 echarts 内置能力**：如果组件包含图表，必须使用 echarts 的 legend/markLine/markPoint 等内置能力，不要拆成独立 DOM（如 chart-header、chart-badge）。整个图表区域应是一个 echarts 实例
- [ ] **阈值线/平均线必须用 markLine**：如果设计稿中有阈值线、平均线、预警线等参考线，必须使用 echarts 的 markLine 或 markArea 实现，**禁止创建伪造的 series**（如 name: '阈值', type: 'line', data: [100, 100, 100]）。正确做法：在真实数据 series 中添加 markLine: { data: [{ yAxis: 100, name: '阈值' }] }
- [ ] **背景图归属正确**：每个 bg 资源必须挂到 resource-dom-mapping 指定的 mountTarget 容器，不要挂错位置（如 tabs-list 的背景不能挂到 chart-body）

**如果以上任何一项未满足，立即修正后再返回代码。**

---

`
    );
  }

  // template/script 分块：仅保留样式相关自检
  return (
    baseChecklist +
    `
**如果以上任何一项未满足，立即修正后再返回代码。**

---

`
  );
}

/**
 * 输出格式警告
 */
export function outputFormatWarnings(withChecklist = false, brief = false) {
  if (brief) {
    return `
**⚠️ 输出格式警告**：
- 不要输出 JSON 格式，用文件分隔符格式
- 不要转义换行符和引号
- 文件之间用空行分隔
`;
  }
  
  return `
**⚠️ 输出格式警告**：
- ❌ 不要输出 JSON 格式（不要用 \`{\` 开头）
- ❌ 不要转义换行符（不要用 \\n）和引号（不要用 \\"）
- ✅ 用文件分隔符格式：\`// === 文件路径 ===\`
- ✅ 文件之间用空行分隔
- ✅ 直接输出原始代码，不要包裹在 JSON 或代码块中
${withChecklist ? '- ✅ 每个文件输出前先在注释中自检格式要求' : ''}
`;
}

/**
 * S8: 需求文档设计注入块（doc-analysis.json → prompt，机械转换，零业务词）
 * 注入四维：events / dataBinding / config(businessConfig+cssVariableConfig) / interactions
 * 不注入 uiElements（元素覆盖率校验在 L0-B 进行，保持 prompt 精简）
 */
export function buildDocDesignBlock(docAnalysis) {
  if (!docAnalysis || typeof docAnalysis !== 'object') return '';

  let block =
    '\n\n# 📄 需求文档业务设计（必须完整实现，优先级高于自行推断）\n\n';
  block +=
    '以下设计来自需求文档的结构化解析，是业务实现的**权威依据**。生成代码时必须完整落地，不得擅自更改事件名/配置 key/字段名。\n';
  let hasContent = false;

  // ① 业务事件（declare.json businessEvents + publishEvent 调用点）
  const events = docAnalysis.events || [];
  if (events.length) {
    hasContent = true;
    block +=
      '\n## 业务事件（businessEvents — 必须声明 + 在对应时机 publishEvent）\n\n';
    for (const e of events) {
      block += `- **${e.eventId}**${e.description ? `：${e.description}` : ''}`;
      if (
        e.payload &&
        typeof e.payload === 'object' &&
        Object.keys(e.payload).length
      ) {
        block += `，payload: \`${JSON.stringify(e.payload)}\``;
      } else if (typeof e.payload === 'string' && e.payload) {
        block += `，payload: ${e.payload}`;
      }
      block += '\n';
    }
    block +=
      '\n要求：declare.json 的 businessEvents 必须包含以上全部事件；代码中在对应业务时机调用 runtimeBuilder.publishEvent()。\n';
  }

  // ② 业务状态（对外可调用方法 — 名称+参数+行为）
  const statuses = docAnalysis.statuses || [];
  if (statuses.length) {
    hasContent = true;
    block +=
      '\n## 业务状态方法（businessStatuses — 组件对外暴露的可调用操作）\n\n';
    for (const s of statuses) {
      block += `- **${s.statusId}**${s.description ? `：${s.description}` : ''}`;
      if (s.params && typeof s.params === 'string' && s.params)
        block += `，参数: ${s.params}`;
      block += '\n';
    }
    block +=
      '\n要求：declare.json 的 businessStatuses 声明这些方法，代码中实现对应的可外部调用处理函数。\n';
  }

  // ③ 数据对接（接口 + 字段映射）
  const apis = docAnalysis.dataBinding?.apis || [];
  const fieldMappings = docAnalysis.dataBinding?.fieldMappings || [];
  if (apis.length || fieldMappings.length) {
    hasContent = true;
    block += '\n## 数据对接（接口调用 + 字段映射）\n\n';
    for (const api of apis) {
      block += `- 接口 **${api.apiCode}**`;
      if (api.method && api.path) block += `：\`${api.method} ${api.path}\``;
      if (api.usage) block += `（${api.usage}）`;
      block += '\n';
    }
    if (fieldMappings.length) {
      block += '\n字段映射（响应字段 → UI 元素，渲染时必须按此取数）：\n\n';
      for (const fm of fieldMappings) {
        block += `- \`${fm.field}\` → ${fm.element}${fm.control ? `（${fm.control}）` : ''}`;
        if (fm.condition) block += ` ⚠️ 条件显示：${fm.condition}`;
        block += '\n';
      }
    }
    block +=
      '\n要求：父组件统一调用接口（同一接口只调一次），provide/inject 下发数据，子组件 watch 响应；字段取用严格按映射表。\n';
  }

  // ④ 业务配置（businessConfig → declare.json + getConfig 消费）
  const businessConfig = docAnalysis.businessConfig || [];
  if (businessConfig.length) {
    hasContent = true;
    block +=
      '\n## 业务配置（businessConfig — declare.json 声明 + getConfig 消费）\n\n';
    block +=
      '```json\n' + JSON.stringify(businessConfig, null, 2) + '\n```\n';
    block +=
      '\n要求：declare.json businessConfig 按此声明（key/type/default/renderType 保持一致）；代码中通过 getConfig 三级优先级链读取，配置变更需真实生效（如刷新间隔/显隐/阈值）。\n';
  }

  // ⑤ CSS 变量配置（cssVariableConfig → theme-vars.less）
  const cssVars = docAnalysis.cssVariableConfig || [];
  if (cssVars.length) {
    hasContent = true;
    block += '\n## CSS 变量配置（cssVariableConfig → theme-vars.less）\n\n';
    block += '```json\n' + JSON.stringify(cssVars, null, 2) + '\n```\n';
    block +=
      '\n要求：declare.json cssVariableConfig 按此声明；theme-vars.less 中定义对应变量，样式中引用变量而非硬编码色值。\n';
  }

  // ⑥ 简单交互
  const interactions = docAnalysis.interactions || [];
  if (interactions.length) {
    hasContent = true;
    block += '\n## 交互行为（必须在组件中实现）\n\n';
    for (const it of interactions) {
      block += `- **${it.trigger}** → ${it.behavior}`;
      if (it.target) block += `（目标: ${it.target}）`;
      block += '\n';
    }
  }

  // ⑦ onload 流程（首屏调用/首屏渲染/轮询）
  const onload = docAnalysis.onloadFlow || {};
  if (onload.initCalls?.length || onload.polling) {
    hasContent = true;
    block += '\n## 初始化流程（onload 骨架）\n\n';
    if (onload.initCalls?.length)
      block += `- 首屏数据调用：${onload.initCalls.join(', ')}\n`;
    if (onload.polling?.default)
      block += `- 轮询间隔：${onload.polling.default}ms（从配置项读取，父组件统一维护定时器）\n`;
    block += '- 必须触发 onload 事件（微码规范强制）\n';
  }

  // 推断项提示（若有）
  const inferredItems = (
    docAnalysis.extractionMeta?.inferredItems || []
  ).filter(Boolean);
  if (inferredItems.length) {
    block +=
      '\n⚠️ 以下为 AI 推断的配置项（文档未明确），请按声明生成但标记为待确认：\n';
    inferredItems.forEach((i) => {
      block += `- ${i}\n`;
    });
  }

  return hasContent ? block : '';
}

/**
 * 🏢 一体化平台约束段（mc-only，vue3 不要求，2026-08-30）。
 * 规范来源：微码组件开发规范和健康度检查报告说明 v1.0.19-1。
 * 覆盖：M5-6（@fontSize 变量）、M5-7（禁硬编码 >5px 字体）、
 *      M6-3a/M6-3b（base-panel 及首子元素禁内联背景）、
 *      M3-4c（自定义 CSS 变量必须声明进 cssVariableConfig）。
 * @param {Object} input 生成输入
 * @param {Object} [options]
 * @returns {string} 约束段（无输入时返回空串）
 */
export function buildMcPlatformConstraints(input = {}, options = {}) {
  if (options.componentType === 'vue3') return '';
  return `
## 🏢 一体化平台兼容（业务组件硬性要求，违反将无法通过健康度检查）

- **M5-6 字体变量**：样式中的 \`font-size\` 必须引用 \`@fontSize\` 变量（或 \`calc(@fontSize * N)\`），禁止在 \`.c-xxx\` 规则中直接写 \`font-size: 16px\` 这类固定值。
- **M5-7 禁硬编码字体**：\`font-size\` 不得使用 >5px 的固定 \`px\` 值；需换算时用 \`calc(@fontSize * 系数)\`。
- **M6-3a base-panel 禁内联背景**：\`<base-panel>\` 标签上**禁止**设置 \`style="background:..."\` 或任何内联背景样式（背景由框架统一管理）。
- **M6-3b 首子元素禁内联背景**：\`<base-panel>\` 的**第一个子元素**同样禁止设置内联背景色。
- **M3-4c 自定义变量声明**：若组件引入了非框架预设的 CSS 变量，必须在 \`declare.json\` 的 \`cssVariableConfig\` 中逐一声明（框架预设 8 个变量 \`fontSize\`/\`fontWeightStrong\`/\`colorTextBase\`/\`colorPrimary\`/\`colorPrimaryHover\`/\`colorPrimaryActive\`/\`colorPrimaryBg\`/\`colorPrimaryBgHover\` 无需声明）。
- **M6-2c/d dark 主题色**：\`themeConfig.list\` 必须含 \`key='dark'\`；dark 主题至少包含 \`colorTextBase\`/\`colorPrimary\`/\`colorPrimaryBg\` 三个核心变量，色值使用一体化平台规定的枚举值（见 \`resources/config/css-vars.js\`，系统自动生成，勿手改）。
`;
}

/**
 * 🛡️ P0（2026-09-04）：构建 Figma 文字真值白名单提示段
 * 
 * 从 Figma 节点数据中提取所有 TEXT 节点的 characters，格式化成白名单提示，
 * 明确要求 LLM 只使用这些文字，防止臆造/OCR 误读。
 * 
 * @param {Object} figmaNodeData - Figma 节点数据
 * @returns {string} 白名单提示段（无真值时返回空串）
 */
export function buildTextTruthWhitelist(figmaNodeData) {
  if (!figmaNodeData) return '';
  
  const truthSet = collectFigmaTextTruth(figmaNodeData);
  if (!truthSet || truthSet.size === 0) return '';
  
  // 过滤出中文文字（TEXT-TRUTH 门禁只检查中文）
  const chineseTexts = Array.from(truthSet)
    .filter(text => /[\u4e00-\u9fa5]/.test(text))
    .sort((a, b) => b.length - a.length); // 按长度降序，长的在前
  
  if (chineseTexts.length === 0) return '';
  
  // 限制数量，避免 prompt 过长（最多 50 个）
  const limitedTexts = chineseTexts.slice(0, 50);
  
  return `
## 🛡️ 文字真值白名单（强制遵守）

**铁律**：组件中所有中文文字**必须且只能**使用以下 Figma 设计稿中的真实文字，**禁止臆造、猜测或 OCR 误读**：

\`\`\`
${limitedTexts.join('、')}
\`\`\`

**违规后果**：
- ❌ 使用不在白名单中的中文文字 → L0-B 门禁 BLOCK → 任务失败
- ✅ 严格使用白名单文字 → 通过门禁

**使用规则**：
1. 标签、标题、按钮文字等所有中文内容必须从白名单中选取
2. 如果白名单中没有需要的文字，说明设计稿中没有该元素，不要自行添加
3. 数字、英文、符号不受此限制，但中文必须严格遵守
`;
}


// ══════════════════════════════════════════════════════════════
// 分块 Prompt 纯函数辅助方法
// ══════════════════════════════════════════════════════════════

export const OUTPUT_FORMAT_WARNING_BRIEF = '- **⚠️ 分隔符格式要求同前述 coreAndChecklist 段**（`// === 文件路径 ===` 仅标记文件开始，禁止在代码注释/分节中使用）';

export function assessComplexity(layoutStructure) {
    const sections = extractSections(layoutStructure);
    const elements = extractElements(layoutStructure);
    if (sections.length === 0 && elements.length === 0) {
      return 'medium';
    }

    const elementCount = elements.length;

    // 计算嵌套层级（简化版）
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length;
      return Math.max(max, depth);
    }, 1);

    // 复杂度判断（含 section 数量维度）
    if (elementCount <= 3 && maxDepth <= 2 && sections.length <= 1) {
      return 'simple'; // 简单：元素少，层级浅
    } else if (elementCount >= 10 || maxDepth >= 4 || sections.length >= 3) {
      return 'complex'; // 复杂：元素多或层级深
    } else {
      return 'medium'; // 中等
    }
  }

export function estimateIndexVueSize(input = {}) {
    const layoutStructure = input.layoutStructure || {};
    const elements = extractElements(layoutStructure);
    const elementCount = elements.length;
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length;
      return Math.max(max, depth);
    }, 1);
    const sections = extractSections(layoutStructure);
    const sectionCount = sections.length;

    const charts = Array.isArray(input.charts) ? input.charts.length : 0;
    const interactions = Array.isArray(input.interactions)
      ? input.interactions.length
      : 0;
    const visualElements = Array.isArray(input.visualElements)
      ? input.visualElements
      : [];
    const visualLen = visualElements.reduce(
      (s, v) => s + (v?.label?.length || 0) + (v?.value?.length || 0),
      0,
    );

    // 经验系数：每个维度对输出 token 的近似贡献
    let est = 0;
    est += elementCount * 220; // 每元素：模板 + class + 绑定
    est += (maxDepth - 1) * 320; // 每多一层嵌套
    est += sectionCount * 420; // 每个 section 区块
    est += charts * 950; // 每个图表：echarts option 冗长
    est += interactions * 600; // 每个交互：方法 + 事件
    est += Math.floor(visualLen / 4); // 文本
    est += 1200; // base-panel 外壳 + 固定样板

    let tier = 's';
    if (est >= 8000) tier = 'xl';
    else if (est >= 4500) tier = 'l';
    else if (est >= 2500) tier = 'm';
    else tier = 's';

    return {
      tokens: est,
      tier,
      elementCount,
      maxDepth,
      sectionCount,
      charts,
      interactions,
    };
  }

export function shouldSplitIndexVue(complexity, input = {}) {
    const size = estimateIndexVueSize(input);
    const tier = size.tier;

    if (complexity === 'complex' || complexity === 'medium') {
      // 复杂/中等默认拆分；超大（xl）再把脚本拆两段
      return {
        split: true,
        reason: `${complexity}-${tier}`,
        scriptSplit: tier === 'xl',
        sizeTier: tier,
        estTokens: size.tokens,
      };
    }

    // simple：仅在存在高截断风险信号，或预估规模偏大时拆分
    const layoutStructure = input.layoutStructure || {};
    const elements = extractElements(layoutStructure);
    const maxDepth = elements.reduce((max, el) => {
      const depth = (el.path || '').split(' > ').length;
      return Math.max(max, depth);
    }, 1);
    const sectionCount = extractSections(layoutStructure).length;

    const hasCharts = Array.isArray(input.charts) && input.charts.length > 0;
    const hasHeaderSlots =
      Array.isArray(input.headerSlots) && input.headerSlots.length > 0;
    const hasInteractions =
      Array.isArray(input.interactions) && input.interactions.length > 0;
    const hasDenseLayout =
      elements.length >= 5 || maxDepth >= 3 || sectionCount > 1;

    const risky =
      hasCharts || hasHeaderSlots || hasInteractions || hasDenseLayout;
    // 即便没有显式风险信号，若预估规模偏大（l/xl）也按 size 直接选分段
    if (risky || tier === 'l' || tier === 'xl') {
      return {
        split: true,
        reason: risky ? 'simple-risky' : 'simple-size-up',
        scriptSplit: tier === 'xl',
        sizeTier: tier,
        estTokens: size.tokens,
      };
    }

    return {
      split: false,
      reason: 'simple-low-risk',
      scriptSplit: false,
      sizeTier: tier,
      estTokens: size.tokens,
    };
  }

export function extractTemplateSummary(templateContent) {
    if (!templateContent) return '// (空模板)';
    const parts = [];
    // 提取所有 ref="xxx" 或 :ref="xxx"
    const refs = [
      ...templateContent.matchAll(/\b(?:ref|:ref)=["']([^"']+)["']/g),
    ].map((m) => m[1]);
    if (refs.length) parts.push(`ref: ${[...new Set(refs)].join(', ')}`);
    // 提取所有 class="c-xxx" 组件 class
    const classes = [
      ...templateContent.matchAll(/\bclass=["']([^"']*c-[^"'\s]+)[^"']*["']/g),
    ].map((m) => m[1]);
    if (classes.length)
      parts.push(`class: ${[...new Set(classes)].join(', ')}`);
    // 提取事件绑定 @click / @change / v-on:
    const events = [
      ...templateContent.matchAll(/@(\w+)=["']([^"']+)["']/g),
    ].map((m) => `${m[1]}=${m[2]}`);
    if (events.length) parts.push(`events: ${[...new Set(events)].join(', ')}`);
    // 提取 v-for / v-if / v-model
    const directives = [
      ...templateContent.matchAll(
        /\b(v-for|v-if|v-show|v-model)=["'][^"']+["']/g,
      ),
    ].map((m) => m[0]);
    if (directives.length)
      parts.push(`directives: ${[...new Set(directives)].join(', ')}`);
    // 提取子组件标签（大写开头的自定义标签）
    const subComps = [
      ...templateContent.matchAll(/<([A-Z][a-zA-Z]+)[\s>]/g),
    ].map((m) => m[1]);
    if (subComps.length)
      parts.push(`sub-components: ${[...new Set(subComps)].join(', ')}`);
    return parts.length > 0
      ? `// [模板结构摘要 - 完整内容超出上下文限制]\n${parts.join('\n')}`
      : `// [模板过长已省略前 12000 字符摘要]\n${templateContent.slice(0, 2000)}`;
  }

export function contextFileSnippet(
    cf,
    { templateThreshold = 12000, nonTemplateLimit = 8000 } = {},
  ) {
    const content = cf?.content || '';
    const isTemplateCtx =
      (cf?.path || '').includes('index.vue') ||
      (cf?.path || '').includes('template');
    if (isTemplateCtx && content.length > templateThreshold) {
      return extractTemplateSummary(content);
    }
    if (isTemplateCtx) return content;
    return content.slice(0, nonTemplateLimit);
  }

export function outputFormatWarningsForChunk(withChecklist = false, brief = false) {
    if (brief) {
      return '- **⚠️ 分隔符格式要求同前述 coreAndChecklist 段**（`// === 文件路径 ===` 仅标记文件开始，禁止在代码注释/分节中使用）';
    }
    const separator = withChecklist
      ? '- **⚠️ `// === 文件路径 ===` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程、检查清单等非文件内容中使用此前缀**'
      : '- **⚠️ `// === 文件路径 ===` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀**';
    const section =
      '- **🚨 具体禁止代码内分节注释**：不要写 `// === 响应式状态 ===`、`// === 生命周期 ===`、`// === 工具函数 ===`、`// === 子组件引入 ===` 这类分节标题。它们会被解析器识别为**文件分隔符**，导致其后的代码被整段丢弃。需要分节时一律用单横线：`// --- 响应式状态 ---`';
    return separator + '\n' + section;
  }

export function antdDeepIntro() {
    return '### ⚠️ antd 样式覆盖必须使用 :deep()\n\n组件使用 `<style lang="less" scoped>`，antd 内部 DOM（`.ant-xxx`）不携带 `data-v-xxx`，直接写 `.ant-xxx` **不生效**。\n\n';
  }

export function getChunkFileType(chunk) {
    const files = chunk.files || [];
    // 模板/脚本段视为 vue 类型
    if (chunk.segmentType === 'template' || chunk.segmentType === 'script')
      return 'vue';
    // 混合文件类型
    const hasJson = files.some((f) => f.endsWith('.json'));
    const hasStyle = files.some(
      (f) => f.endsWith('.less') || f.endsWith('.css'),
    );
    const hasVue = files.some((f) => f.endsWith('.vue'));
    if ((hasJson && hasVue) || (hasJson && hasStyle) || (hasVue && hasStyle))
      return 'mixed';
    if (files.every((f) => f.endsWith('.json'))) return 'declare';
    if (files.every((f) => f.endsWith('.less') || f.endsWith('.css')))
      return 'style';
    return 'vue';
  }

export function normKw(s) {
    return String(s || '')
      .trim()
      .toLowerCase();
  }

export function tagWords(tagName) {
    return String(tagName || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 2);
  }

export function extractSubcomponentKeywords(tagName, indexContent) {
    const kws = new Set(tagWords(tagName));
    const src = String(indexContent || '');
    const tagRe = new RegExp(`<${tagName}\\b[^>]*>`, 'g');
    let m;
    while ((m = tagRe.exec(src)) !== null) {
      const tagText = m[0];
      // 字符串属性值：title="x" / name='x' / label="x" / text="x" 等
      for (const am of tagText.matchAll(
        /\b(?:title|name|label|text|desc|description|subtitle)\s*=\s*["']([^"']{2,40})["']/g,
      )) {
        kws.add(am[1]);
      }
      // class 名
      for (const cm of tagText.matchAll(/class\s*=\s*["']([^"']+)["']/g)) {
        for (const cn of cm[1].split(/\s+/)) {
          if (cn.length >= 3) kws.add(cn.toLowerCase());
        }
      }
    }
    return [...kws];
  }

export function extractUsageSnippet(tagName, indexContent) {
    const src = String(indexContent || '');
    if (!src) return null;
    const lines = src.split('\n');
    const out = [];
    const importRe = new RegExp(`import\\s+${tagName}\\b`);
    for (const [i, line] of lines.entries()) {
      if (importRe.test(line)) out.push(`L${i + 1}: ${line.trim()}`);
    }
    const tagRe = new RegExp(`<${tagName}[\\s/>]`);
    let hits = 0;
    for (let i = 0; i < lines.length && hits < 2; i++) {
      if (!tagRe.test(lines[i])) continue;
      hits++;
      const from = Math.max(0, i - 12);
      const to = Math.min(lines.length, i + 13);
      out.push(
        `// --- ${tagName} 使用处 #${hits}（L${from + 1}-${to}） ---\n${lines.slice(from, to).join('\n')}`,
      );
    }
    if (hits === 0) return null;
    return out.join('\n\n');
  }

export function nameMatchesKeywords(name, kws) {
    const n = normKw(name);
    if (!n) return false;
    for (const kw of kws) {
      const k = normKw(kw);
      if (!k) continue;
      const hasCJK = /[\u4e00-\u9fa5]/.test(k);
      if (
        hasCJK &&
        k.length >= 2 &&
        (n.includes(k) || (n.length >= 2 && k.includes(n)))
      )
        return true;
      if (
        !hasCJK &&
        k.length >= 3 &&
        (n.includes(k) || (n.length >= 3 && k.includes(n)))
      )
        return true;
    }
    return false;
  }

export function pickFigmaSubtree(figmaNodeData, kws) {
    if (!figmaNodeData || typeof figmaNodeData !== 'object') return null;
    let slotHit = null;
    let ancestorHit = null;
    const dfs = (node, slotAncestor) => {
      if (slotHit || ancestorHit) return;
      const name = String(node?.name || '');
      const isSlot = /^slot-/i.test(name);
      const curSlot = isSlot ? node : slotAncestor;
      if (isSlot && nameMatchesKeywords(name, kws)) {
        slotHit = node;
        return;
      }
      if (
        !isSlot &&
        node.type !== 'VECTOR' &&
        !/^@echarts\//.test(name) &&
        nameMatchesKeywords(name, kws) &&
        slotAncestor
      ) {
        ancestorHit = slotAncestor;
        return;
      }
      for (const c of node.children || []) {
        dfs(c, curSlot);
        if (slotHit || ancestorHit) return;
      }
    };
    dfs(figmaNodeData, null);
    return slotHit || ancestorHit;
  }

export function buildSubcomponentScopedInput(subPath, indexContent, input, options = {}) {
    const tagName = String(subPath || '')
      .split('/')
      .pop()
      .replace(/\.vue$/, '');
    const kws = extractSubcomponentKeywords(tagName, indexContent);

    // 🎯 0907 L6 治本·资源错绑：Manifest 单一事实源（按 section 聚合资源，O(n) 廉价）。
    // 子组件文件 prompt 只下发其归属 section 的资源，杜绝 LLM 在「全量资源里自由选名字相邻图」
    // 导致的跨 section 错绑（mc-max 实锤：icon1 属当日总流量被绑到车型分布、bg2 属车型分布被绑到流量预测）。
    const resourceManifest = buildResourceManifest(input?.resourceDomMapping || []);

    // 🎯 section 中文标题关联（mc-max-1787574672211 实锤修复）：子组件文件名是 LLM 起的英文名，
    // Figma 子树名是中文（slot-当日总流量），tagWords 英文 ↔ 中文子树永远匹配不上 → 回退全量 200KB prompt。
    // 关联链：tagWords ↔ section.id/responsibility 英文词（section-daily-total ↔ TotalTraffic 的 'total'）
    //        → 命中后引入 section.title 中文（与 Figma slot-* 命名同源）→ 子树匹配成功。
    // 只关联单个最匹配 section，避免跨 section 错配；全不命中则维持原关键词（回退全量，保真）。
    let matchedSection = null;
    try {
      const sections = input?.subComponentPlan?.effectiveSections;
      if (Array.isArray(sections) && sections.length > 0) {
        const words = tagWords(tagName);
        for (const sec of sections) {
          const secText = [sec?.id, sec?.responsibility, sec?.title]
            .map((s) => String(s || '').toLowerCase())
            .join(' ');
          if (words.some((w) => w.length >= 3 && secText.includes(w))) {
            matchedSection = sec;
            for (const t of [sec?.title, sec?.responsibility]) {
              for (const cjk of String(t || '').match(
                /[\u4e00-\u9fa5]{2,8}/g,
              ) || [])
                kws.push(cjk);
            }
            break;
          }
        }
      }
    } catch {
      /* 关联失败保持原关键词 */
    }

    // 🎯 usage 摘要 CJK 补充：模型在 usage 处常写中文注释/标题（<TrafficForecast title="流量预测">），
    // 与 Figma 节点名同源，是 tagWords 之外的强匹配键。
    try {
      const snippet = extractUsageSnippet(tagName, indexContent);
      if (snippet) {
        for (const cjk of (snippet.match(/[\u4e00-\u9fa5]{2,8}/g) || []).slice(
          0,
          10,
        ))
          kws.push(cjk);
      }
    } catch {
      /* 提取失败忽略 */
    }

    const scoped = {};
    const report = { subPath, keywords: kws.length };

    // 4) 资源清单按 section 过滤（0907 L6 治本·资源错绑）
    // 根因：子组件 chunk prompt 全量下发 resourceDomMapping → LLM 在「全量资源里自由选名字相邻图」
    // → 跨 section 错绑。治本：只下发本 section 归属的资源（Manifest 单一事实源）。
    // 未匹配到 section（fail-open）或过滤后无变化时不改，保留全量，不阻断生成。
    // 注意：本过滤只影响 prompt 暴露给 LLM 的资源清单；写盘后的 import 注入仍走全量 effectiveMapping，
    // 因此不破坏 RESOURCE-001 全量资源使用校验。
    try {
      const scopedRdm = scopedResourceDomMapping(input?.resourceDomMapping, matchedSection);
      if (scopedRdm) {
        scoped.resourceDomMapping = scopedRdm;
        report.resourceSection = `${matchedSection.title || matchedSection.id} (${scopedRdm.length}/${input.resourceDomMapping.length})`;
        // 🔗 0907 L7 闭环（2026-09-09）：资源过滤命中 section 时，把该子组件归属的
        // section 标识（id/title）一并暴露给下游。microcode-engineer 据其解析出
        // Manifest 权威 key，构建 fileSectionMap 传给 L7 防御门禁，替换原有「引用资源数最多
        // 的 section 为主」启发式，避免 tab 等复杂 layout 误判主 section → 合法引用被 BLOCK。
        // 仅当资源确实按 section 收窄（scopedRdm 为真）才附 ref，否则保持 undefined（fail-open）。
        scoped._sectionRef = {
          id: matchedSection?.id || null,
          title: matchedSection?.title || null,
        };
      }
    } catch {
      /* 过滤失败保持全量 */
    }

    // 1) Figma 子树
    const subtree = pickFigmaSubtree(input.figmaNodeData, kws);
    if (subtree && subtree !== input.figmaNodeData) {
      scoped.figmaNodeData = subtree;
      scoped.figmaStyleTree = null; // 强制 buildFigmaStage 对子树重新格式化
      report.figmaSubtree = true;
    }

    // 2) elementStyleMap 子集
    const esm = input.elementStyleMap;
    if (esm && typeof esm === 'object' && !Array.isArray(esm)) {
      const keys = Object.keys(esm);
      const GLOBAL_KEY_RE =
        /^(panel|root|bg|background|theme|common|page|container)/i;
      const kept = keys.filter(
        (k) => GLOBAL_KEY_RE.test(k) || nameMatchesKeywords(k, kws),
      );
      if (kept.length > 0 && kept.length < keys.length) {
        scoped.elementStyleMap = Object.fromEntries(
          kept.map((k) => [k, esm[k]]),
        );
        report.esmKeys = `${kept.length}/${keys.length}`;
      }
    }

    // 3) layoutStructure sections 子集
    const ls = input.layoutStructure;
    if (ls && Array.isArray(ls.sections) && ls.sections.length > 1) {
      const kept = ls.sections.filter((s) =>
        nameMatchesKeywords(s?.title || s?.id || s?.name, kws),
      );
      if (kept.length > 0 && kept.length < ls.sections.length) {
        scoped.layoutStructure = { ...ls, sections: kept };
        report.sections = `${kept.length}/${ls.sections.length}`;
      }
    }

    options.logger?.info?.('🧩 子组件分块事实裁剪', report);
    return scoped;
  }

export function buildStyleRevisionSection(input) {
    const { previousCritiques } = input;
    if (!previousCritiques || previousCritiques.length === 0) return '';
    const styleCritiques = previousCritiques.filter(
      (c) =>
        c.category === 'STYLE' ||
        c.category === 'CSS' ||
        c.category === 'VISUAL' ||
        c.category === 'THEME',
    );
    return `
# ⚠️ 代码修订指导

这是第${(input.iterationCount || 0) + 2}轮修订。以下是与样式相关的问题，请针对性修复：

${styleCritiques.map((cr, i) => `## 问题 ${i + 1}: ${cr.issue}\n- **严重程度**: ${cr.severity}\n- **修复建议**: ${cr.fix || '请根据问题描述自行判断'}\n`).join('\n')}
${styleCritiques.length === 0 ? '(无样式相关的修订问题 — 按原始规范生成即可)' : ''}

---
`;
  }

export function styleOutputFormatTail(chunk) {
    return `
# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式：

\`\`\`
// === ${(chunk.files || [])[0]} ===
<该文件的完整内容>
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，不要转义
- 文件之间用空行分隔
- 不要包裹在 JSON 或 Markdown 代码块中
${OUTPUT_FORMAT_WARNING_BRIEF}

⚠️ 不要生成以下文件（系统自动生成）：
- dark.less / light.less - 系统自动生成固定主题包装
- index.less - 系统自动生成入口导入
`;
  }

export function extractFigmaColorEssentials(figmaNodeData, maxNodes = 220) {
    if (!figmaNodeData || typeof figmaNodeData !== 'object')
      return '(无 Figma 数据)';
    const toCssColor = (c, opacity) => {
      if (!c || typeof c.r !== 'number') return null;
      const r = Math.round(c.r * 255),
        g = Math.round(c.g * 255),
        b = Math.round(c.b * 255);
      const op =
        typeof opacity === 'number' ? Math.round(opacity * 100) / 100 : 1;
      return op < 1
        ? `rgba(${r}, ${g}, ${b}, ${op})`
        : `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    };
    const fmtFills = (fills) => {
      if (!Array.isArray(fills) || fills.length === 0) return null;
      const solid = fills.find(
        (f) => f.type === 'SOLID' && f.visible !== false,
      );
      if (solid) return toCssColor(solid.color, solid.opacity);
      const grad = fills.find(
        (f) => f.type === 'GRADIENT_LINEAR' && f.visible !== false,
      );
      if (
        grad &&
        Array.isArray(grad.gradientStops) &&
        grad.gradientStops.length >= 2
      ) {
        const s0 = toCssColor(
          grad.gradientStops[0].color,
          grad.gradientStops[0].opacity,
        );
        const s1 = toCssColor(
          grad.gradientStops[grad.gradientStops.length - 1].color,
          grad.gradientStops[grad.gradientStops.length - 1].opacity,
        );
        return s0 && s1 ? `linear-gradient(${s0} → ${s1})` : null;
      }
      return null;
    };
    const fmtShadow = (effects) => {
      if (!Array.isArray(effects)) return null;
      const ds = effects.find(
        (e) => e.type === 'DROP_SHADOW' && e.visible !== false,
      );
      if (!ds) return null;
      const col = toCssColor(ds.color, ds.color?.a ?? undefined);
      return `${ds.offset?.x ?? 0}px ${ds.offset?.y ?? 0}px ${ds.radius ?? 0}px${col ? ` ${col}` : ''}`;
    };
    const lines = [];
    const walk = (node, depth) => {
      if (lines.length >= maxNodes || !node || typeof node !== 'object') return;
      const parts = [];
      const bg = fmtFills(node.fills);
      if (bg) parts.push(node.type === 'TEXT' ? `color:${bg}` : `bg:${bg}`);
      const border = fmtFills(node.strokes);
      if (border) parts.push(`border:${border}`);
      const shadow = fmtShadow(node.effects);
      if (shadow) parts.push(`shadow:${shadow}`);
      if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0)
        parts.push(`radius:${node.cornerRadius}px`);
      if (node.type === 'TEXT' && node.style) {
        if (node.style.fontSize) parts.push(`font:${node.style.fontSize}px`);
        if (node.style.fontWeight) parts.push(`w${node.style.fontWeight}`);
      }
      if (parts.length > 0) {
        const nm = String(node.name || node.type || 'node').slice(0, 28);
        lines.push(
          `${'  '.repeat(Math.min(depth, 4))}- ${nm} [${node.type}]${node.type === 'TEXT' && node.characters ? ` "${String(node.characters).slice(0, 14)}"` : ''} → ${parts.join(' | ')}`,
        );
      }
      if (Array.isArray(node.children))
        node.children.forEach((c) => walk(c, depth + 1));
    };
    walk(figmaNodeData, 0);
    if (lines.length === 0) return '(未提取到颜色数据)';
    return lines.join('\n');
  }

export function buildLayoutSkeleton(layoutStructure) {
    const sections = extractSections(layoutStructure);
    if (!sections || sections.length === 0) return '';

    // 🎯 方案1: 增强布局方向标注 - 更明确的CSS实现指导
    const dir = (l) => {
      if (!l) return '';
      if (/2-?col/i.test(l))
        return '横向两列 (flex-direction: row, 2个等宽子项)';
      if (l === 'horizontal') return '横向 (flex-direction: row)';
      if (l === 'vertical') return '竖向 (flex-direction: column)';
      if (l === 'grid') return '网格布局 (display: grid)';
      return l;
    };

    const kids = (node, depth = 0) => {
      if (!node || depth > 1) return '';
      const arr = Array.isArray(node.children)
        ? node.children
        : Array.isArray(node.items)
          ? node.items
          : null;
      if (!arr || arr.length === 0) return '';
      const max = 12;
      const names = arr.slice(0, max).map((c) => {
        const nm = c.name || c.type || c.text || '';
        const lay = c.layout ? `(${dir(c.layout) || c.layout})` : '';
        const inner =
          depth < 1 && c.children && c.children.length
            ? ` ${kids(c, depth + 1)}`
            : '';
        return `${nm}${lay}${inner}`;
      });
      const more = arr.length > max ? ` 等${arr.length}项` : '';
      return names.join('、') + more;
    };

    // 🎯 方案1: 增强骨架文本 - 更清晰的结构化格式
    return sections
      .map((s, i) => {
        const head =
          s.header && s.header.title ? `（标题「${s.header.title}」）` : '';
        const inner = kids(s.body) || kids(s.content) || '';
        const layout = s.layout || (s.body && s.body.layout) || 'vertical';
        const gridCols =
          s.body && s.body.gridColumns ? s.body.gridColumns : null;

        // 布局方向详细标注
        let layoutDesc = dir(layout);

        // 🎯 网格布局特殊处理 - 明确列数和CSS实现
        if (gridCols) {
          layoutDesc = `网格 ${gridCols} 列 (display: grid; grid-template-columns: repeat(${gridCols}, 1fr))`;
        }

        return `${i + 1}. 【${s.name || s.id || '未命名段落'}】${head}\n   布局方向: ${layoutDesc}\n   子元素: ${inner || '(空)'}`;
      })
      .join('\n\n');
  }

export function buildTrustGuidance(generationInput) {
    if (!generationInput || generationInput.schemaVersion < 1) return '';
    const lines = [];
    const restrictions = generationInput.trustVerdict?.restrictions || [];
    if (restrictions.includes('no-unsupported-decoration'))
      lines.push('- 禁止生成无 Figma 证据支撑的装饰元素');
    if (restrictions.includes('no-style-fallback'))
      lines.push(
        '- 禁止使用合成 fallback 样式（主题变量必须以 Figma 真值为准）',
      );
    if (restrictions.includes('resolve-legend-owner'))
      lines.push(
        '- 必须明确每个图表图例的归属（DOM 容器 或 echarts 内建），禁止悬空图例',
      );

    const actionMap = {
      'do-not-generate-root-background':
        '- 根背景与 Figma 填充证据冲突，**禁止生成根容器背景**',
      'ignore-review-as-design-fact':
        '- 布局审查结果已降级，不得将其当作设计事实照搬',
      'exclude-fallback-style-facts':
        '- 排除 Style Mapper 的合成 fallback 样式事实',
      'choose-dom-or-echarts-owner': '- 为图表图例选择归属（DOM 或 echarts）',
    };
    for (const issue of generationInput.currentIssues || []) {
      const line = issue?.expectedAction
        ? actionMap[issue.expectedAction]
        : null;
      if (line && !lines.includes(line)) lines.push(line);
    }

    // 🛡️ P0：styleEvidence 硬性禁令（确定性 Figma 真值）。
    // designFacts.root.styleEvidence 由 figma-api 编译：若某项 allowed:false，根容器严禁生成该装饰。
    // 仅作数据下发时模型会基于「漂亮大屏」先验臆造背景/边框/圆角/阴影，必须用硬性 prompt 约束兜底，
    // 且 L0-B 校验器（CODE-014）会据此直接判失败重生成。
    const styleEvidence = generationInput?.designFacts?.root?.styleEvidence;
    if (styleEvidence && typeof styleEvidence === 'object') {
      const forbidden = [];
      if (styleEvidence.background?.allowed === false)
        forbidden.push('背景色/背景图/渐变（figma-api 确认根容器无填充）');
      if (styleEvidence.border?.allowed === false)
        forbidden.push('边框 border（figma-api 确认根容器无描边）');
      if (styleEvidence.borderRadius?.allowed === false)
        forbidden.push('圆角 border-radius（figma-api 确认根容器无圆角）');
      if (styleEvidence.boxShadow?.allowed === false)
        forbidden.push('阴影 box-shadow（figma-api 确认根容器无阴影）');
      if (forbidden.length > 0) {
        lines.push(
          `- 🚫 根容器（.c-mc-max-* 根类及其直接作用域）**严禁**使用以下装饰，因其 Figma 真值不存在：${forbidden.join('、')}。` +
            ' 若违反，L0-B 门禁（CODE-014）将直接判失败并要求重生成，不允许以「美观」为由臆造。',
        );
      }
    }

    if (lines.length === 0) return '';
    const level = generationInput.trustVerdict?.level || 'trusted';
    return (
      `\n\n# ⚠️ 上下文裁决约束（可信度：${level}，必须遵守）\n\n` +
      lines.join('\n') +
      '\n'
    );
  }

function normalizePlannerDiagnostics(input = {}) {
  const diagnostics =
    input?.subComponentPlan?.diagnostics ||
    input?.generationInput?.componentPlan?.diagnostics ||
    null;
  if (!diagnostics || typeof diagnostics !== 'object') return '';

  const lines = [];
  const fmt = (item) => {
    if (!item) return '';
    if (typeof item === 'string') return item.slice(0, 160);
    return [item.id, item.sectionId, item.severity, item.message]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 180);
  };
  const pushList = (label, list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const text = list.map(fmt).filter(Boolean).join('；');
    if (text) lines.push(`- ${label}: ${text}`);
  };

  if (diagnostics.coverageReport) {
    const coverage = diagnostics.coverageReport;
    lines.push(
      `- 覆盖率：${coverage.coverageRate ?? 'N/A'}%${coverage.summary ? `（${coverage.summary}）` : ''}`,
    );
  }
  if (diagnostics.textTruthValidation) {
    const truth = diagnostics.textTruthValidation;
    lines.push(
      `- 文字真值：${truth.status || 'unknown'}${truth.summary ? `（${truth.summary}）` : ''}`,
    );
  }
  pushList('分析诊断', diagnostics.analysisDiagnostics);
  pushList('分析修复', diagnostics.analysisFixes);
  pushList('chrome-only', diagnostics.chromeSectionDiagnostics);
  pushList('资源诊断', diagnostics.resourceDiagnostics);
  pushList('图表数据提示', diagnostics.chartDataHints);

  if (lines.length === 0) return '';
  return `\n## 🧭 子组件规划诊断（必须参考）\n\n${lines.join('\n')}\n`;
}

export function buildSubComponentResponsibilityTable(input) {
    // 🛡️ 接管（P1）：优先消费 Context Assembler 裁决的 componentPlan（单一事实源），
    // fallback 到 legacy 散装字段 subComponentPlan。二者 effectiveSections 结构兼容
    // （normalizeComponentPlan 仅规范化 null 值，字段 id/title/responsibility/elementCount 不变）。
    const genPlan = input?.generationInput?.componentPlan;
    const subPlan = genPlan || input?.subComponentPlan;
    const sections =
      subPlan && typeof subPlan === 'object'
        ? subPlan.effectiveSections || []
        : [];
    const diagnosticsBlock = normalizePlannerDiagnostics(input);
    if (!sections.length) return diagnosticsBlock;
    const forced = !!subPlan?.isForced;
    let p = `${diagnosticsBlock}\n\n## 🧩 子组件职责边界（脚本生成必读）\n\n`;
    p += forced
      ? `本组件已**强制拆分**为 ${sections.length} 个独立子组件（\`package/components/*.vue\`）。`
      : `本组件存在以下子组件拆分。`;
    p += ` 这些 section 的**状态/图表/事件/生命周期逻辑必须写在各自子组件文件内**，index.vue 只负责 import + 组合：\n`;
    sections.forEach((sec, idx) => {
      p += `${idx + 1}. \`${sec.id}\` — ${sec.responsibility || ''}`;
      if (sec.title) p += `（原标题「${sec.title}」）`;
      p += `：其图表与状态归子组件\n`;
    });
    p += `\n**index.vue 的 <script setup> 只应包含**：\n`;
    p += `- 子组件 import 语句（\`import Xxx from './components/Xxx.vue'\`）\n`;
    p += `- \`$mcComponentBuilder\` 解构（仅一次）\n`;
    p += `- 主组件自身（未拆分部分）的状态与逻辑\n`;
    p += `- \`onMounted\` 里 \`runtimeBuilder.publishEvent(...)\`\n`;
    p += `\n**⚠️ 严禁**为上述子组件 section 臆造 \`chartRef\` / \`legendState\` / \`selectedTime\` / \`activeTab\` 等变量或 echarts 初始化——它们属于子组件上下文，会导致语义校验自由变量拦截、任务失败。若主组件 template 中没有对应图表/状态绑定，相关脚本段应输出最简内容。`;
    return p;
  }

  /**
   * 🎯 构建子组件命名指导块（注入 template chunk prompt）
   * 基于 section 的 responsibility 和 children 内容，为 LLM 提供具体的命名建议。
   */
  export function buildSubComponentNamingGuidance(input) {
    const genPlan = input?.generationInput?.componentPlan;
    const subPlan = genPlan || input?.subComponentPlan;
    const sections =
      subPlan && typeof subPlan === 'object'
        ? subPlan.effectiveSections || []
        : [];
    const diagnosticsBlock = normalizePlannerDiagnostics(input);
    if (!sections.length) return diagnosticsBlock;

    let p = `${diagnosticsBlock}\n\n## 🏷️ 子组件命名指导（template 生成必读）\n\n`;
    p += `根据下方每个 section 的 \`responsibility\` 和实际内容，为子组件选择**语义精确**的 PascalCase 名称：\n\n`;

    sections.forEach((sec, idx) => {
      const resp = (sec.responsibility || '').toLowerCase();
      const title = sec.title || '';
      const id = sec.id || '';

      // 基于 responsibility 推断建议名称
      let suggestedNames = [];
      if (resp.includes('统计') || resp.includes('指标') || resp.includes('概览')) {
        suggestedNames = ['OverviewCards', 'StatCards', 'MetricsGrid', 'StatusSummary'];
      } else if (resp.includes('列表') || resp.includes('清单')) {
        suggestedNames = ['DeviceListArea', 'EquipmentTable', 'ItemList'];
      } else if (resp.includes('网格') || resp.includes('卡片')) {
        suggestedNames = ['DeviceGrid', 'CardGrid', 'ItemGrid'];
      } else if (resp.includes('图表') || resp.includes('可视化')) {
        suggestedNames = ['TrendChart', 'PieChart', 'BarChart', 'DataVisualization'];
      } else if (resp.includes('标题') || resp.includes('控件')) {
        suggestedNames = ['HeaderControls', 'TitleBar', 'ActionBar'];
      } else if (resp.includes('主内容') || resp.includes('主体')) {
        // 对"主内容区"这种泛化描述，要求 LLM 从 children 推断更精确的名称
        suggestedNames = ['（请根据内部实际内容推断，如 DeviceListArea / ChartArea / OperationPanel）'];
      }

      p += `${idx + 1}. section \`${id}\``;
      if (title) p += `（标题「${title}」）`;
      p += `\n`;
      p += `   - responsibility: ${sec.responsibility || '未指定'}\n`;
      p += `   - 元素数量: ${sec.elementCount || 0}\n`;
      if (suggestedNames.length > 0) {
        p += `   - 建议名称: ${suggestedNames.map(n => `\`${n}\``).join(' / ')}\n`;
      }
      p += `\n`;
    });

    p += `**命名铁律**：\n`;
    p += `- ✅ 名称必须反映**内容语义**（如 \`OverviewCards\` 表示统计卡片组）\n`;
    p += `- 🚫 禁止使用**位置/布局泛称**（如 \`HeaderStats\`、\`MainContent\`、\`ContentArea\`）\n`;
    p += `- 🚫 禁止 header 插槽内容在 body 子组件中重复渲染（若数据已在 \`<template #header-xxx>\` 中展示，body 子组件不得再渲染相同数据）\n`;

    return p;
  }

export function buildRetryPrompt(chunk, lastErrType, lastErr) {
    return buildRetryPromptBase(chunk, lastErrType, lastErr);
  }


// ══════════════════════════════════════════════════════════════
// 分块 Prompt 构建器
// ══════════════════════════════════════════════════════════════

export function buildChunkMiddle(chunk, input) {
    const { componentName, backgroundBrightness = 'dark' } = input;
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
    const fileList = chunk.files.map((f) => `- \`${f}\``).join('\n');
    // 可用资源变量白名单：仅注入实际下载成功的变量（bg1/icon1…），防止 LLM 幻觉引用不存在的 iconN/bgN
    const _availVars = extractResourceVarNames(
      resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
    );
    const availVarsBlock =
      _availVars && _availVars.length > 0
        ? `本次**仅以下资源变量可用**，禁止使用清单之外的任何变量名（如 icon3/icon4/bg5 若不在清单中则不存在）：\n  - \`${_availVars.join('`、`')}\`\n  **用法铁律**：这些变量只能以模板插值使用（\`<img :src="icon1">\` / \`:style="{ backgroundImage: 'url(' + bg1 + ')' }"\`），**禁止**写进 \`<style>\` 块（\`url(\${bg1})\`/\`url(@bg1)\`/\`url(\$bg1)\` 会令 LESS 编译崩溃），**禁止**手写 import（系统注入）`
        : '（无已下载资源变量，模板不得引用 iconN/bgN/imgN 等资源变量）';
    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件（必须保持命名 / 接口 / class 命名一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = contextFileSnippet(cf);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件，**不要输出其他文件**（其余文件在其他批次生成）：

${fileList}

注意：**index.less**、**dark.less**、**light.less** 由生成器自动补充，你不需要输出。

## 关键约束

- **组件ID规范**：declare.json 中的 componentId 必须使用：\`${componentName}\`
- **Less变量规范**：theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`，但根级禁止调用；由系统生成的 index.less 在**根作用域**调用 \`.common()\` + 默认主题 mixin，再 \`@import (multiple) './common.less'\`。
- **⚠️ common.less 必须写在根层**：所有业务 class 直接写在文件根层，**禁止**用 \`.dark {}\`/\`.light {}\`/任何外层选择器包裹（宿主不给组件根加主题类，包裹后编译成 \`.dark .c-xxx\`，真实 DOM 0 命中 → 样式全部失效）。
- **Class 命名一致性（⚠️ 最重要）**：所有 \`.vue\` 和 \`.less\` 文件中的 class 名必须以 \`.c-\` 为前缀（如 \`.c-vehicle-card\`）。参考文件（📎 区块）中已出现的 class 名**必须在 common.less 中一一对应定义**，禁止在模板中使用 class 却在 common.less 中遗漏或使用不同名称。
- **🚫 禁止双 c- 前缀**：如果语义名取自 declare.json 的 componentId（它本身已含 \`c-\`，如 \`c-monitor\`），直接写 \`.c-monitor-xxx\`；**禁止**再叠一层前缀写成 \`.c-c-monitor-xxx\`（错误示例：\`class="c-c-monitor-root"\`；正确示例：\`class="c-monitor-root"\`）。
- **🚫 禁止用组件实例 ID 作 class 前缀**：组件实例 ID（如 \`mc-1786155067847-f0abee76\`）是运行时随机标识符，不得出现在 CSS 中。
  - ❌ 错误示例：\`c-f0abee-container\`、\`c-mc-max-<时间戳>-root\`、\`c-36f0218a-header\`
  - ✅ 正确示例：\`c-env-monitor-root\`（根容器）、\`c-env-monitor-header\`（标题栏）、\`c-env-monitor-chart\`（图表区）
  - **必须基于功能/语义命名**，class 名反映元素用途而非组件标识。
  - 🆔 根容器的实例 id 类 \`c-mc-max-{INSTANCE_ID}\`（INSTANCE_ID 为运行时随机标识）由**系统自动注入**，你无需也无法手写它；只需给根元素一个语义 class（如 \`c-env-monitor-root\`），系统会另行追加实例 id 类。内部 class 切勿手写 \`c-mc-max-...\` 长前缀（会被后处理剥离并导致 .vue/.less 错配）。
- **资源变量白名单**：${availVarsBlock}
${contextBlock}
# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式（不要用 JSON，更节省 token 避免截断）：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，**不要转义换行符和引号**（不要用 \\n 和 \\" ）
- 文件之间用空行分隔
- 不要包裹在 JSON 中，不要用 \`\`\` 代码块
${OUTPUT_FORMAT_WARNING_BRIEF}

**⚠️ 不要生成以下文件**（由系统自动生成标准模板）：
- \`component.js\` - 系统将自动生成
- \`declare.js\` - 系统将自动生成
- \`resources/styles/index.less\` - 系统将自动生成入口导入
- \`resources/styles/themes/dark.less\` 和 \`resources/styles/themes/light.less\` - 系统将自动生成固定主题包装
`;
  }

export function buildDeclareChunkPrompt(input, chunk) {
    const {
      componentName,
      displayName,
      panelType = 'default-panel',
      backgroundBrightness = 'dark',
      layoutStructure,
      previousCritiques,
    } = input;
    const isRevision = previousCritiques && previousCritiques.length > 0;

    //  displayName 用于组件中文名称（Figma 节点名），componentName 用于组件 ID
    const compDisplayName = displayName || componentName;

    // 修订模式：只筛选与声明文件相关的 critique
    const revisionSection = isRevision
      ? `
# ⚠️ 代码修订指导

这是第${(input.iterationCount || 0) + 2}轮修订。以下是与组件声明相关的问题，请针对性修复：

${previousCritiques
  .filter(
    (c) =>
      c.category === 'DECLARE_SCHEMA' ||
      c.category === 'COMPONENT_CONFIG' ||
      c.category === 'DATA_SOURCE',
  )
  .map(
    (cr, i) =>
      `## 问题 ${i + 1}: ${cr.issue}\n- **严重程度**: ${cr.severity}\n- **修复建议**: ${cr.fix || '请根据问题描述自行判断'}\n`,
  )
  .join('\n')}
${previousCritiques.filter((c) => c.category === 'DECLARE_SCHEMA' || c.category === 'COMPONENT_CONFIG' || c.category === 'DATA_SOURCE').length === 0 ? '(无声明文件相关的修订问题 — 按原始规范生成即可)' : ''}

---
`
      : '';

    // 只提取组件基本信息，不包含完整 layoutStructure / visualElements
    const layoutInfo = layoutStructure
      ? `
## 组件结构信息
- **尺寸**: ${layoutStructure.width || 460} × ${layoutStructure.height || 138}
- **面板类型**: ${panelType}
`
      : '';

    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = (cf.content || '').slice(0, 8000);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }

    // LLM 只输出业务字段片段，结构由模板骨架保证
    return `你是专业的微码组件声明配置工程师。你只负责生成 declare.json 的**业务字段片段**。

${revisionSection}
${layoutInfo}
# 组件信息
- **组件ID**: \`${componentName}\`
- **组件中文名称**: ${compDisplayName}
- **面板类型**: ${panelType || 'default-panel'}
- **默认主题**: ${defaultTheme}

# 任务要求

系统已自动生成 declare.json 的完整骨架（包含 layoutConfig/themeConfig 等结构字段），你只需输出**业务相关字段**，系统会自动合并到骨架中。

## 你需要输出的字段（JSON 格式）

\`\`\`json
{
  "componentName": "${compDisplayName}",
  "panelKey": "自定义面板 key（如有，否则留空字符串）",
  "businessEvents": {
    "${componentName}-onload": {
      "eventId": "${componentName}-onload",
      "eventName": "组件加载完成",
      "eventDataSchema": {
        "componentId": { "key": "componentId", "name": "组件ID", "type": "string", "required": true },
        "timestamp": { "key": "timestamp", "name": "时间戳", "type": "number", "required": true }
      }
    }
  },
  "businessStatuses": {},
  "cssVariableConfig": [],
  "businessConfig": {}
}
\`\`\`

## 关键约束

- **componentId** 必须使用：\`${componentName}\`
- **componentName**（组件中文名称）必须使用：\`${compDisplayName}\`
- **eventId** 格式：\`${componentName}-onload\`（组件加载事件）
- **businessEvents** 中必须有 \`${componentName}-onload\` 事件声明
- **businessStatuses**：根据组件业务逻辑填写（如无则留空对象）
- **cssVariableConfig**：CSS 变量配置数组（如无则留空数组）
- **businessConfig**：业务配置对象（如无则留空对象）
- **panelKey**：面板 key（如无则留空字符串）

## ⚠️ 你不需要输出的字段（系统已自动处理）

- componentId、version、attribute（系统自动填充）
- dataSources、formSources（系统自动设为 null）
- layoutConfig、themeConfig（系统使用默认结构）

${contextBlock}
# 输出格式

请直接输出 JSON 对象（不要包裹在代码块中）：

\`\`\`
{
  "componentName": "...",
  "panelKey": "...",
  "businessEvents": {...},
  "businessStatuses": {...},
  "cssVariableConfig": [...],
  "businessConfig": {...}
}
\`\`\`

⚠️ **格式要求**：
- 输出纯 JSON，不要包裹在 \\\`\\\`\\\`json 代码块中
- 不要添加注释（JSON 不支持注释）
- 确保 JSON 语法正确（使用双引号，最后一项不加逗号）
- 不要输出其他文件或额外说明
`;
  }

export function buildStyleChunkPrompt(input, chunk, options = {}) {
    const COMMON_LESS_PATH = 'resources/styles/common.less';
    const THEME_VARS_PATH = 'resources/styles/themes/theme-vars.less';
    const files = chunk.files || [];
    const targetsCommon = files.includes(COMMON_LESS_PATH);
    const targetsTheme = files.includes(THEME_VARS_PATH);
    if (targetsTheme && !targetsCommon)
      return buildThemeVarsChunkPrompt(input, chunk, options);
    if (targetsCommon && !targetsTheme)
      return buildCommonLessChunkPrompt(input, chunk, options);
    return buildStyleChunkPromptDual(input, chunk, options);
  }

export function buildThemeVarsChunkPrompt(input, chunk, options = {}) {
    const {
      backgroundBrightness = 'dark',
      figmaNodeData,
      figmaStyleTree,
      elementStyleMap,
      visualElements,
      styleMappings,
    } = input;
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
    const revisionSection = buildStyleRevisionSection(input);
    const fileList = (chunk.files || []).map((f) => `- \`${f}\``).join('\n');
    const lessNaming =
      (options.constraints || {})['references/standards/less-naming-convention.md'] || '';

    // 🆕 P4'：vision 真值 themeVars 补全（替代 G3 启发色兜底）
    // 优先用 styleMappings 中已有的 themeVars/lessVariables；否则从 elementStyleMap 合成。
    const themeVarsBlock = (() => {
      // 1) 优先：styleMappings 中已有的语义化 themeVars/lessVariables
      const smThemeVars = styleMappings?.themeVars;
      const smLessVars = styleMappings?.lessVariables;
      if (smLessVars && typeof smLessVars === 'object' && Object.keys(smLessVars).length > 0) {
        const vars = Object.entries(smLessVars)
          .map(([k, v]) => `${k}: ${v};`)
          .join('\n');
        return `## 主题变量真值（从 Figma 设计稿实测映射，必须精确使用）\n\n以下 Less 变量名和色值由 Style Mapper 从设计稿程序化提取，是本次 theme-vars.less 的硬约束：\n\n\`\`\`less\n${vars}\n\`\`\`\n\n⚠️ 必须在对应 mixin（.common()/.theme-dark()/.theme-light()）中使用上述变量名和值；事实未覆盖的属性按默认主题（${defaultTheme}）风格补齐，禁止臆造新变量名或修改已有色值。`;
      }
      if (smThemeVars && typeof smThemeVars === 'object' && Object.keys(smThemeVars).length > 0) {
        const vars = Object.entries(smThemeVars)
          .map(([k, v]) => `@${k}: ${v};`)
          .join('\n');
        return `## 主题变量真值（从 Figma 设计稿实测映射，必须精确使用）\n\n\`\`\`less\n${vars}\n\`\`\`\n\n⚠️ 必须在对应 mixin 中使用上述变量名和值；未覆盖的属性按默认主题（${defaultTheme}）风格补齐，禁止臆造。`;
      }
      // 2) 回退：从 elementStyleMap 合成最小主题变量（复用 style-mapper 的合成逻辑）
      if (elementStyleMap && typeof elementStyleMap === 'object') {
        const colors = [];
        const backgrounds = [];
        const radii = [];
        const gaps = [];
        for (const props of Object.values(elementStyleMap)) {
          if (!props || typeof props !== 'object') continue;
          if (props.color) colors.push(String(props.color));
          if (props['background-color']) backgrounds.push(String(props['background-color']));
          if (props.background && !String(props.background).includes('url(')) backgrounds.push(String(props.background));
          if (props['border-radius']) radii.push(String(props['border-radius']));
          if (props.gap) gaps.push(String(props.gap));
        }
        const pickMostFrequent = (arr) => {
          if (!arr.length) return null;
          const freq = new Map();
          let best = arr[0], bestN = 0;
          for (const v of arr) {
            const n = (freq.get(v) || 0) + 1;
            freq.set(v, n);
            if (n > bestN) { bestN = n; best = v; }
          }
          return best;
        };
        const isDark = backgroundBrightness === 'dark';
        const textColor = isDark ? 'rgba(255, 255, 255, 0.9)' : (pickMostFrequent(colors) || '#333333');
        const bgColor = pickMostFrequent(backgrounds) || (isDark ? '#0f0f0f' : '#ffffff');
        const primaryColor = pickMostFrequent(colors) || (isDark ? '#409EFF' : '#1677ff');
        const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
        const radius = pickMostFrequent(radii) || '8px';
        const gap = pickMostFrequent(gaps) || '12px';
        const synthesized = [
          `@text-color: ${textColor};`,
          `@bg: ${bgColor};`,
          `@primary: ${primaryColor};`,
          `@border: ${borderColor};`,
          `@border-radius-base: ${radius};`,
          `@gap: ${gap};`,
        ].join('\n');
        return `## 主题变量真值（从 Figma 元素样式程序化合成，必须精确使用）\n\n\`\`\`less\n${synthesized}\n\`\`\`\n\n⚠️ 变量名和色值由设计稿实测得出，必须在对应 mixin 中使用；未覆盖的属性（如 @fontSize=14px）按规范补齐，禁止臆造。`;
      }
      // 3) 无真值：回退到原有的 colorFacts/palette 三级兜底
      return null;
    })();

    // 颜色事实子集：通用属性名过滤（颜色/背景/边框/阴影/填充/透明度），无组件特例
    const COLOR_PROP_RE = /color|background|border|shadow|fill|opacity/i;
    const colorFacts = {};
    if (elementStyleMap && typeof elementStyleMap === 'object') {
      for (const [el, props] of Object.entries(elementStyleMap)) {
        if (!props || typeof props !== 'object' || Array.isArray(props))
          continue;
        const sub = {};
        for (const [prop, val] of Object.entries(props)) {
          if (COLOR_PROP_RE.test(prop)) sub[prop] = val;
        }
        if (Object.keys(sub).length > 0) colorFacts[el] = sub;
      }
    }

    // 颜色事实三级兜底（🛡️ 禁止回退全量 figmaStyleTree——单次实测它把 theme-vars 分块
    // prompt 撑到 68k 字符并引发 180s 超时 + 16k token 空串絮叨）：
    //   1) elementStyleMap 颜色相关子集（最精确，逐元素属性）
    //   2) figmaStyleTree/figmaNodeData 中正则提取的调色板（去重、限量，保留颜色事实但体积 <2k 字符）
    //   3) visualElements 摘要
    const factsBlock = (() => {
      // 🆕 P4'：如果已有 themeVarsBlock，factsBlock 简化为补充说明，避免重复
      if (themeVarsBlock) {
        const colorFactsJson = Object.keys(colorFacts).length > 0
          ? `\n\n\`\`\`json\n${JSON.stringify(colorFacts, null, 2)}\n\`\`\`\n\n上述元素级颜色作为补充参考；theme-vars.less 中已命名的变量以 themeVarsBlock 为准。`
          : '\n\n(无额外颜色线索：themeVarsBlock 已覆盖全部颜色事实。)';
        return `## 补充颜色线索（themeVarsBlock 未覆盖的元素级细节）${colorFactsJson}`;
      }
      if (Object.keys(colorFacts).length > 0) {
        return `## 主题颜色事实（从设计稿样式映射提取，必须精确遵守）\n\n\`\`\`json\n${JSON.stringify(colorFacts, null, 2)}\n\`\`\`\n\n⚠️ 主题 mixin 中的颜色变量必须与上述事实一致；事实未覆盖的属性按默认主题（${defaultTheme}）风格补齐，禁止臆造品牌色。`;
      }
      // 2) 调色板提取：通用颜色 token 正则，无组件特例
      const srcText =
        typeof figmaStyleTree === 'string' && figmaStyleTree
          ? figmaStyleTree
          : figmaNodeData && formatFigmaStyleData
            ? formatFigmaStyleData(figmaNodeData)
            : '';
      const palette = new Set();
      if (srcText) {
        const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+%?\s*,[^)]*\)/g;
        let cm;
        while ((cm = colorRe.exec(srcText)) !== null && palette.size < 60)
          palette.add(cm[0]);
      }
      if (palette.size > 0) {
        return `## 主题颜色事实（从 Figma 样式树提取的调色板，必须精确使用）\n\n\`\`\`\n${[...palette].join('\n')}\n\`\`\`\n\n⚠️ 主题 mixin 中的颜色必须取自上述调色板（按明暗语义归入 .theme-dark()/.theme-light()）；未覆盖的属性按默认主题（${defaultTheme}）风格补齐，禁止臆造品牌色。`;
      }
      // 3) visualElements 摘要
      return visualElements
        ? formatVisualStyle(visualElements)
        : '(无颜色事实：按默认主题规范生成三 mixin，颜色使用通用深/浅色板。)';
    })();

    const themeVarsInjection = themeVarsBlock ? `\n${themeVarsBlock}\n` : '';

    return `你是专业的微码组件主题工程师。你只负责生成主题变量文件（theme-vars.less）。

${revisionSection}
# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件：
${fileList}

## 关键约束

**theme-vars.less 结构（必须）**：
- 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`，且均需闭合${(options.componentType || 'microcode') !== 'vue3' ? '\n- 微码组件：\`.common()\` 内须定义 \`@fontSize: 14px;\`（字体缩放基准令牌；根容器通过 CSS 变量 \`--fontSize\` 驱动，默认 14px）' : ''}
- 颜色变量定义在 mixin 内部；根级禁止调用任何主题 mixin（由系统生成的 dark.less/light.less 在主题选择器内先调用 \`.common()\` 与对应主题 mixin，再导入 common.less）
- 面板默认主题为 **${defaultTheme}**：\`.theme-${defaultTheme}()\` 中的颜色即组件默认展示色，必须与设计稿一致

**🚫 禁止 CSS 变量**：
- 只允许 Less 变量（\`@xxx\`），禁止 \`var(--xxx)\`（Less 颜色函数 darken()/lighten()/fade() 遇 CSS 变量会编译报错）
- 错误示例：\`@color: var(--em-bg-color);\` ← 编译报错；正确示例：\`@bg-color: #1a2332;\`

**颜色转换规则**：
- 颜色从 Figma fills.color 精确转换（r*255, g*255, b*255），保留精度
- 深色面板（backgroundBrightness=dark）所有文字颜色禁止使用黑色系

**Less 变量命名规范**：
${lessNaming}
${themeVarsInjection}
${factsBlock}
${styleOutputFormatTail(chunk)}`;
  }

export function buildCommonLessChunkPrompt(input, chunk, options = {}) {
    const {
      componentName,
      figmaNodeData,
      figmaStyleTree,
      elementStyleMap,
      visualElements,
    } = input;
    const revisionSection = buildStyleRevisionSection(input);
    const classNamesList = chunk.classNamesList || [];
    const fileList = (chunk.files || []).map((f) => `- \`${f}\``).join('\n');

    // 🅰️ 字体缩放规范（仅微码组件；Vue3 走空占位 + 自定义 @xxx 约定，不受影响）
    const fontScaleBlock =
      (options.componentType || 'microcode') !== 'vue3'
        ? `
## 🅰️ 字体缩放规范（微码组件必遵 · 支撑微前端整组件等比缩放）
- 组件根容器（\`.c-xxx-root\` 或 base-panel 根元素）必须设置 \`font-size: var(--fontSize, 14px)\`（默认 14px = 设计稿基准，即 1@fontSize = 14px）。
- 组件内**所有** \`font-size\` 必须使用 \`@fontSize\` 变量：恰好基准直接写 \`font-size: @fontSize\`；其他尺寸写 \`font-size: calc(@fontSize * 系数)\`（如 20px → \`calc(@fontSize * 1.4286)\`）。**禁止**出现 \`font-size: Npx\` 字面量。
- \`@fontSize\` 在 theme-vars.less 的 \`.common()\` 内定义（系统兜底 = 14px），业务样式直接引用即可，无需重复定义。
- 中间容器（卡片/分区/头部）**不要**自行设置 font-size（如需统一请用 \`inherit\`），避免嵌套复利导致子元素字号漂移。
- 宿主平台只需覆写该组件根的 \`--fontSize\` CSS 变量即可整体缩放字体；因此默认视图必须与原 px 设计稿像素级一致。
`
        : '';

    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件（必须保持一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = (cf.content || '').slice(0, 8000);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }

    return `你是专业的微码组件样式工程师。你只负责生成业务样式文件（common.less）。

${revisionSection}
# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件：
${fileList}

## 关键约束

**Class 命名规范**：
- common.less 中的所有 class 必须以 \`.c-\` 为前缀
- 格式：\`.c-{语义名称}\`（如 \`.c-vehicle-card\`、\`.c-stat-item\`）
- 语义名称使用 kebab-case：vehicle-card, stat-item, chart-wrapper
- 禁止使用无前缀的通用 class：.item, .box, .wrapper, .container

**主题变量引用规则（跨文件一致性）**：
- 主题变量已在参考文件 theme-vars.less 中定义（见 📎 区块），common.less 中引用变量时必须使用其中已存在的变量名
- elementStyleMap 有明确值的属性必须直接写精确值，禁止用主题变量覆盖
- 不确定变量名是否存在时，直接写 elementStyleMap 精确值（写盘门禁会自动补缺失变量）

**🚫 禁止面板外壳样式泄漏**：
- common.less 中**禁止**在 \`.c-${componentName}-content\` 上设置 \`background\`、\`box-shadow\`、\`border-radius\`
- 原因：base-panel 已提供面板标题、边框、阴影等外壳样式，重复生成会导致双层边框/阴影
- 需要处理的是内容区样式（间距、字体、颜色），不是面板外壳

${fontScaleBlock}
${
  figmaNodeData
    ? `
## 🎨 Figma 节点颜色真值表（程序化提取，背景/边框/阴影/圆角必须精确使用）

${extractFigmaColorEssentials(figmaNodeData)}

⚠️ **颜色铁律**：每个卡片/区块的背景色、文字色、圆角、阴影必须与上表逐节点对应；
不同卡片有**不同**背景色调时（如各分类卡），必须分别使用各自的值，禁止统一成同一颜色。
elementStyleMap（见下）与上表冲突时以上表 Figma 真值为准。
`
    : ''
}

${!figmaNodeData && (!elementStyleMap || Object.keys(elementStyleMap).length === 0) && visualElements ? formatVisualStyle(visualElements) : ''}

${
  elementStyleMap && Object.keys(elementStyleMap).length > 0
    ? `
## Per-Element 样式映射（必须遵守）

以下是从设计稿分析得出的每个元素的完整 CSS 属性。**这些值必须直接写入 CSS，禁止用主题变量覆盖。**

\`\`\`json
${JSON.stringify(elementStyleMap, null, 2)}
\`\`\`

⚠️ **样式直接值优先规则**：
1. elementStyleMap 中有明确颜色值时，CSS 必须直接写（如 \`color: rgba(255,255,255,0.8)\`），禁止替换为主题变量
2. elementStyleMap 中有明确尺寸值时，CSS 必须直接写（如 \`font-size: 20px\`）
3. 主题变量只用于 elementStyleMap 中没有明确值的属性
4. 深色内容区所有文字颜色禁止使用黑色系
`
    : ''
}

## 颜色/圆角/阴影/边框规则
- 颜色从 Figma fills.color 精确转换（r*255, g*255, b*255）
- 圆角从 cornerRadius 提取
- 阴影从 effects 提取（DROP_SHADOW → box-shadow）
- 边框从 strokes 提取
- 纯色背景用 CSS，禁止用 background-image

${
  classNamesList.length > 0
    ? `
## ⚠️ 强制约束：class 选择器必须精确匹配模板（v3.5 硬约束）

以下是从所有已生成的 Vue 模板中**程序化提取**的 class 名完整列表。
你必须在 common.less 中为**每一个** class 生成对应的 CSS 规则。

\`\`\`
${classNamesList.map((c) => `.${c}`).join('\n')}
\`\`\`

**铁律（违反将导致样式丢失）**：
1. ✅ 列表中的**每一个** class 必须出现在你的 CSS 输出中
2. ❌ **禁止**创建列表中没有的新业务 class（框架 class 如 ant-/el- 除外）
3. ❌ **禁止**重命名 class（如把 vehicle-card 改成 stat-card）
4. ❌ **禁止**合并多个 class（如把 vehicle-card 和 vehicle-title 合并为一个）
5. ✅ 样式值从 elementStyleMap 获取精确值，禁止用主题变量覆盖
6. ✅ 如果你不确定某个 class 的含义，参考上方已生成参考文件中的使用上下文
`
    : ''
}

${contextBlock}
${styleOutputFormatTail(chunk)}`;
  }

export function buildStyleChunkPromptDual(input, chunk, options = {}) {
    const {
      componentName,
      backgroundBrightness = 'dark',
      figmaNodeData,
      figmaStyleTree,
      elementStyleMap,
      visualElements,
      previousCritiques,
    } = input;
    const isRevision = previousCritiques && previousCritiques.length > 0;
    const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
    //  从 chunk 中获取程序化提取的 class 名列表（硬约束）
    const classNamesList = chunk.classNamesList || [];

    // 🎯 Phase 2 方案5: 在 style 分块中注入样式约束强化
    const styleConstraintReinforcement = buildStyleConstraintReinforcement();

    // 修订模式：只筛选与样式相关的 critique
    const revisionSection = isRevision
      ? `
# ⚠️ 代码修订指导

这是第${(input.iterationCount || 0) + 2}轮修订。以下是与样式相关的问题，请针对性修复：

${previousCritiques
  .filter(
    (c) =>
      c.category === 'STYLE' ||
      c.category === 'CSS' ||
      c.category === 'VISUAL' ||
      c.category === 'THEME',
  )
  .map(
    (cr, i) =>
      `## 问题 ${i + 1}: ${cr.issue}\n- **严重程度**: ${cr.severity}\n- **修复建议**: ${cr.fix || '请根据问题描述自行判断'}\n`,
  )
  .join('\n')}
${previousCritiques.filter((c) => c.category === 'STYLE' || c.category === 'CSS' || c.category === 'VISUAL' || c.category === 'THEME').length === 0 ? '(无样式相关的修订问题 — 按原始规范生成即可)' : ''}

---
`
      : '';

    const fileList = chunk.files.map((f) => `- \`${f}\``).join('\n');
    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件（必须保持 class 命名一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = (cf.content || '').slice(0, 8000);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }

    // Less 命名规范
    const lessNaming =
      (options.constraints || {})['references/standards/less-naming-convention.md'] || '';

    return `你是专业的微码组件样式工程师。你只负责生成 Less/CSS 样式文件。

${revisionSection}

# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次只生成以下文件：
${fileList}

注意：**index.less**、**dark.less**、**light.less** 由生成器自动补充，你不需要输出。

## 关键约束

**Class 命名规范**：
- common.less 中的所有 class 必须以 \`.c-\` 为前缀
- 格式：\`.c-{语义名称}\`（如 \`.c-vehicle-card\`、\`.c-stat-item\`）
- 语义名称使用 kebab-case：vehicle-card, stat-item, chart-wrapper
- 禁止使用无前缀的通用 class：.item, .box, .wrapper, .container

**Less变量规范**：
- theme-vars.less 必须定义三个 mixin：\`.common()\`、\`.theme-dark()\`、\`.theme-light()\`
- 颜色变量定义在 mixin 内部，theme-vars.less 根级禁止调用任何主题 mixin
- 系统生成的 index.less 会在**根作用域**调用 \`.common()\` 与默认主题 mixin，再 \`@import (multiple) './common.less'\`
- ⚠️ common.less 中所有 class 必须写在**文件根层**，禁止用 \`.dark {}\`/\`.light {}\`/任何外层选择器包裹（宿主不给组件根加主题类，包裹后规则在真实 DOM 上 0 命中）

**🚫 禁止 CSS 变量**：
- theme-vars.less 中**禁止**使用 CSS 变量（\`var(--xxx)\`），只允许 Less 变量（\`@xxx\`）
- 原因：CSS 变量会导致 Less 颜色函数（如 darken()/lighten()/fade()）编译报错
- 错误示例：\`@color: var(--em-bg-color);\` ← 编译报错
- 正确示例：\`@bg-color: #1a2332;\`

**🚫 禁止面板外壳样式泄漏**：
- common.less 中**禁止**在 \`.c-${componentName}-content\` 上设置 \`background\`、\`box-shadow\`、\`border-radius\`
- 原因：base-panel 已提供面板标题、边框、阴影等外壳样式，重复生成会导致双层边框/阴影
- 需要处理的是内容区样式（间距、字体、颜色），不是面板外壳

**Less 变量命名规范**：
${lessNaming}

${
  (!elementStyleMap || Object.keys(elementStyleMap).length === 0) &&
  figmaNodeData
    ? `
## Figma 关键节点样式数据（用于精确样式还原）

${figmaStyleTree ?? formatFigmaStyleData(figmaNodeData)}
`
    : ''
}

${(!elementStyleMap || Object.keys(elementStyleMap).length === 0) && visualElements ? formatVisualStyle(visualElements) : ''}

${
  elementStyleMap && Object.keys(elementStyleMap).length > 0
    ? `
## Per-Element 样式映射（必须遵守）

以下是从设计稿分析得出的每个元素的完整 CSS 属性。**这些值必须直接写入 CSS，禁止用主题变量覆盖。**

\`\`\`json
${JSON.stringify(elementStyleMap, null, 2)}
\`\`\`

⚠️ **样式直接值优先规则**：
1. elementStyleMap 中有明确颜色值时，CSS 必须直接写（如 \`color: rgba(255,255,255,0.8)\`），禁止替换为主题变量
2. elementStyleMap 中有明确尺寸值时，CSS 必须直接写（如 \`font-size: 20px\`）
3. 主题变量只用于 elementStyleMap 中没有明确值的属性
4. 深色面板（backgroundBrightness=dark）所有文字颜色禁止使用黑色系
`
    : ''
}

## 颜色/圆角/阴影/边框规则
- 颜色从 Figma fills.color 精确转换（r*255, g*255, b*255）
- 圆角从 cornerRadius 提取
- 阴影从 effects 提取（DROP_SHADOW → box-shadow）
- 边框从 strokes 提取
- 纯色背景用 CSS，禁止用 background-image

${
  classNamesList.length > 0
    ? `
## ⚠️ 强制约束：class 选择器必须精确匹配模板（v3.5 硬约束）

以下是从所有已生成的 Vue 模板中**程序化提取**的 class 名完整列表。
你必须在 common.less 中为**每一个** class 生成对应的 CSS 规则。

\`\`\`
${classNamesList.map((c) => `.${c}`).join('\n')}
\`\`\`

**铁律（违反将导致样式丢失）**：
1. ✅ 列表中的**每一个** class 必须出现在你的 CSS 输出中
2. ❌ **禁止**创建列表中没有的新业务 class（框架 class 如 ant-/el- 除外）
3. ❌ **禁止**重命名 class（如把 vehicle-card 改成 stat-card）
4. ❌ **禁止**合并多个 class（如把 vehicle-card 和 vehicle-title 合并为一个）
5. ✅ 样式值从 elementStyleMap 获取精确值，禁止用主题变量覆盖
6. ✅ 如果你不确定某个 class 的含义，参考上方已生成参考文件中的使用上下文
`
    : ''
}

${contextBlock}
${styleConstraintReinforcement}

# 输出格式

请**只输出上面列出的文件**，使用文件分隔符格式：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

**格式要求**：
- 每个文件用 \`// === 文件路径 ===\` 作为分隔符开头
- 文件内容直接输出原始代码，不要转义
- 文件之间用空行分隔
- 不要包裹在 JSON 或 Markdown 代码块中
${OUTPUT_FORMAT_WARNING_BRIEF}

⚠️ 不要生成以下文件（系统自动生成）：
- dark.less / light.less - 系统自动生成固定主题包装
- index.less - 系统自动生成入口导入
`;
  }

export function buildTemplateChunkMiddle(chunk, input) {
    const { componentName, panelType = 'default-panel' } = input;
    // 🧱 组件结构骨架：把顶层布局结构直接贴近模板生成指令（修复分块模式 LLM 忽略 layout 臆造结构）
    const layoutSkeleton = buildLayoutSkeleton(input.layoutStructure);
    const layoutBlock = layoutSkeleton
      ? `## 🧱 组件结构骨架（权威来源：视觉分析，必须100%还原）

${layoutSkeleton}

**🚫 禁止臆造结构的三大场景**：
1. **统计卡片区域**：禁止臆造额外的统计项。例如骨架标注3个统计卡片，不得自行添加第4个。
2. **列表数据区域**：禁止臆造表格列。例如骨架标注5列（序号/车牌/时间/类型/状态），不得添加"操作"列。
3. **图表区域**：禁止臆造额外的图表。例如骨架标注2个图表（趋势图+占比图），不得添加第3个图表。

**✅ 实施规则**：
- **布局方向**：严格按标注实现CSS（横向=flex-row，竖向=flex-column，网格=grid）
- **网格列数**：必须使用 \`grid-template-columns: repeat(N, 1fr)\`，N为标注列数
- **段落顺序**：从上到下的数字序号即为在DOM中的出现顺序
- **子元素数量**：与骨架标注的子元素数量一致，不得增减

**违规后果**：布局不符 → L0-B门禁拦截 → 强制重新生成`
      : '';

    // 🎯 Phase 2 方案5: 在 template 分块中注入布局约束强化
    const layoutConstraintReinforcement = buildLayoutConstraintReinforcement(
      input.layoutStructure,
    );
    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成参考文件（必须保持命名 / 接口 / class 命名一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = (cf.content || '').slice(0, 8000);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }
    // 可用资源变量白名单：仅注入实际下载成功的变量（bg1/icon1…），防止 LLM 幻觉引用不存在的 iconN/bgN
    const _availVars = extractResourceVarNames(
      resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
    );
    const availVarsBlock =
      _availVars && _availVars.length > 0
        ? `本次**仅以下资源变量可用**，禁止使用清单之外的任何变量名（如 icon3/icon4/bg5 若不在清单中则不存在）：\n- \`${_availVars.join('`、`')}\`\n  **用法铁律**：只能模板插值（\`<img :src="icon1">\` / \`:style="{ backgroundImage: 'url(' + bg1 + ')' }"\`），**禁止**写进 \`<style>\` 块（\`url(\${bg1})\`/\`url(@bg1)\`/\`url(\$bg1)\` 会令 LESS 编译崩溃），**禁止**手写 import（系统注入）`
        : '（无已下载资源变量，模板不得引用 iconN/bgN/imgN 等资源变量）';
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次**只生成 package/index.vue 的 \`<template>\` 部分**，**不要输出 \`<script>\` 和 \`<style>\` 块**（它们会在后续批次生成）。

## 关键约束

- 必须使用 \`<base-panel panelKey="${panelType}">\` 包裹，通过具名插槽填充内容
- 所有 class 必须使用 \`.c-\` 前缀（如 \`.c-vehicle-card\`）
- **🚫 禁止用组件实例 ID 作 class 前缀**：组件实例 ID 是运行时随机标识符，不得出现在 CSS 中。
  - ❌ 错误：\`c-f0abee-container\`、\`c-mc-max-<时间戳>-root\`
  - ✅ 正确：\`c-env-monitor-root\`、\`c-env-monitor-header\`、\`c-env-monitor-chart\`（基于功能语义命名）
  - 🆔 根容器的实例 id 类 \`c-mc-max-{INSTANCE_ID}\` 由**系统自动注入**，你无需手写；只给根元素一个语义 class（如 \`c-env-monitor-root\`）即可。
- 资源变量白名单：${availVarsBlock}
- 模板中用到的 ref 名称、事件名将在后续 \`<script>\` 批次中实现，请使用语义化命名
- 🧩 **子组件拆分（复杂组件强烈建议）**：若组件包含 ≥3 个清晰业务区域（如"当日总流量 / 车型分布 / 流量预测"），请在模板中拆分为 \`<PascalCase组件名>\` 标签引用（如 \`<TotalTraffic />\`），并在 \`<script setup>\` 中 import 自 \`./components/Xxx.vue\`（子组件文件会由后续批次单独生成，体量小、不易截断）
  - **🚫 命名禁令**：禁止使用通用/泛化名称，必须基于内容语义命名
    - ❌ 禁用：\`HeaderStats\`、\`MainContent\`、\`Content\`、\`Container\`、\`Body\`、\`Section\`、\`Area\`、\`Block\`、\`Panel\`、\`Wrapper\`、\`Layout\`
    - ✅ 正确：\`OverviewCards\`（统计卡片组）、\`DeviceListArea\`（设备列表区）、\`TrafficChart\`（流量图表）、\`StatusSummary\`（状态汇总）
  - **📋 命名规则**：从 section 的实际内容推断名称，而非从位置/布局推断
    - 统计卡片网格 → \`OverviewCards\` / \`StatCards\` / \`MetricsGrid\`
    - 设备列表区 → \`DeviceListArea\` / \`DeviceGrid\` / \`EquipmentTable\`
    - 图表区 → 按图表类型命名（如 \`TrendChart\`、\`PieChart\`、\`BarChart\`）
    - 状态汇总 → \`StatusSummary\`、\`HealthOverview\`
  - **🔍 参考下方「子组件职责边界」表格**：每个 section 的 \`responsibility\` 字段描述了该区块的实际功能，据此推断名称
${layoutBlock}
${layoutConstraintReinforcement}
${contextBlock}
${buildSubComponentNamingGuidance(input)}
# 输出格式

请**只输出 <template> 部分**，使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<template>
  ...完整的模板内容...
</template>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<template>\` 到 \`</template>\` 的完整内容
- **不要输出 \`<script setup>\` 块**
- **不要输出 \`<style>\` 块**
- 不要包裹在 JSON 或代码围栏中
${OUTPUT_FORMAT_WARNING_BRIEF}
`;
  }

export function buildScriptChunkMiddle(chunk, input) {
    const { componentName } = input;

    // 🎯 方案1: 在 script 段重复注入布局骨架 - 防止分块生成时忘记约束
    const layoutSkeleton = buildLayoutSkeleton(input.layoutStructure);
    const layoutBlock = layoutSkeleton
      ? `## 🧱 组件结构参考（来自视觉分析，避免臆造结构）\n\n${layoutSkeleton}\n\n⚠️ **脚本生成注意事项**：\n- 只为 template 中实际存在的元素声明 ref 和状态\n- 禁止臆造 template 中不存在的图表、列表、统计项\n- 图表数量和位置必须与上述骨架一致\n`
      : '';

    // 🎯 Phase 2 方案5: 在 script 分块中注入资源约束强化
    const _availVars = extractResourceVarNames(
      resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
    );
    const availableResources = _availVars.map((varName) => ({
      assignedVarName: varName,
    }));
    const resourceConstraintReinforcement =
      buildResourceConstraintReinforcement(availableResources);

    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成的 <template>（必须保持 ref / class / 事件命名完全一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = contextFileSnippet(cf);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }
    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次**只生成 package/index.vue 的 \`<script setup>\` 部分**，**不要输出 \`<template>\` 和 \`<style>\` 块**。
${layoutBlock}
${resourceConstraintReinforcement}
${contextBlock}

## 关键约束

- **必须与上方 <template> 中用到的 ref 名称、class 名称、事件名称完全一致**
- 必须包含 \`$mcComponentBuilder\` 调用（用 try-catch 包裹）并解构 \`runtimeBuilder\`
- 必须在 \`onMounted\` 中调用 \`runtimeBuilder.publishEvent('${componentName}-onload', {...})\`
- 使用 Vue 3 Composition API（ref / watch / onMounted / onUnmounted 等）
- 如有图表，使用 echarts.init() + ResizeObserver + watch(chartRef) 模式
- **禁止编写 import 样式文件的语句**（样式只在 <style> 块中 @import，由系统处理）
- 🧩 **子组件拆分**：若 <template> 中引用了 \`<PascalCase组件名>\`（如 \`<TotalTraffic />\`），**必须在本脚本中 import**：\`import TotalTraffic from './components/TotalTraffic.vue'\`（子组件文件会由后续批次单独生成）
- ⚠️ **脚本必须完整**：包含 import（去重）、全部状态/函数定义、onMounted 等生命周期逻辑，禁止只输出 import 头
${contextBlock}${buildSubComponentResponsibilityTable(input)}
# 输出格式

请**只输出 <script setup> 部分**，使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
...完整的脚本内容...
</script>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<script setup>\` 到 \`</script>\` 的完整内容
- **不要输出 \`<template>\` 块**
- **不要输出 \`<style>\` 块**
- 不要包裹在 JSON 或代码围栏中
${OUTPUT_FORMAT_WARNING_BRIEF}
`;
  }

export function buildScriptChunkMiddlePart(chunk, input) {
    const { componentName } = input;
    const part = chunk.scriptPart || 'state';

    // 🎯 方案1: 在脚本分段中重复注入布局骨架 - 防止三段拆分时忘记约束
    const layoutSkeleton = buildLayoutSkeleton(input.layoutStructure);
    const layoutBlock = layoutSkeleton
      ? `\n\n## 🧱 组件结构参考（来自视觉分析）\n\n${layoutSkeleton}\n\n⚠️ **关键提醒**：\n- 只为 template 中实际存在的元素声明变量和函数\n- 禁止臆造额外的图表、统计项、列表列\n- 图表数量必须与骨架标注一致\n`
      : '';

    // 🎯 Phase 2 方案5: 在 script 分段中注入资源约束强化
    const _availVars = extractResourceVarNames(
      resolveResourceDomMapping(input.resourceDomMapping, input.outputPath),
    );
    const availableResources = _availVars.map((varName) => ({
      assignedVarName: varName,
    }));
    const resourceConstraintReinforcement =
      buildResourceConstraintReinforcement(availableResources);

    let contextBlock = '';
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock =
        '\n\n# 📎 已生成上下文（必须保持 ref / class / 事件命名完全一致）\n\n' +
        chunk.contextFiles
          .map((cf) => {
            const snippet = contextFileSnippet(cf);
            return `// === ${cf.path} ===\n${snippet}\n`;
          })
          .join('\n');
    }

    const partIndex = part === 'state' ? 1 : part === 'lifecycle' ? 2 : 3;
    const partGuide =
      part === 'state'
        ? `本次**只生成 <script setup> 的第 1/3 部分（状态定义）**：
- 所有 \`import\` 语句（vue、echarts 等）
- 所有 \`ref\` / \`reactive\` / \`computed\` 状态
- \`defineProps\` / props（如适用）
- 所有 \`watch\` 定义
- 所有工具 / 纯函数的**定义**（函数体，但不在本部分调用）
- 类型与常量
- **\`$mcComponentBuilder\` 调用（仅此一次）**：在本部分顶部写 \`const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()\`（直接解构，声明+赋值一体）

⚠️ 不要写 \`<template>\` / \`<style>\` 块；不要写 \`onMounted\` / \`onUnmounted\` / 事件 handler / 图表初始化（它们在第 2、3 部分生成）；不要调用任何函数或触发副作用。变量名 / 函数名必须与 <template> 中使用的命名完全一致。`
        : part === 'lifecycle'
          ? `本次**只生成 <script setup> 的第 2/3 部分（生命周期与事件）**：
- \`onMounted\` / \`onUnmounted\` 生命周期钩子
- 所有事件处理函数（@click / @change 等对应的 handler）
- 在 \`onMounted\` 中调用 \`runtimeBuilder.publishEvent('${componentName}-onload', { componentId: '${componentName}', timestamp: Date.now() })\`
- 如需初始化图表，在第 2 部分定义并调用 \`initCharts()\`（\`initCharts\` 的具体实现写在第 3 部分）

⚠️ 不要写 \`<template>\` / \`<style>\` 块；**不要重复** import 与 \`ref\` / \`reactive\` / \`computed\` 定义（已在第 1 部分声明）；**不要再次调用 \`$mcComponentBuilder()\`**（已在第 1 部分解构，直接引用第 1 部分声明的 runtimeBuilder / componentProps / componentApi 即可）；不要写图表初始化（echarts.init 等，在第 3 部分生成）。`
          : `本次**只生成 <script setup> 的第 3/3 部分（图表初始化与数据加载）**：
- 图表初始化函数 \`initCharts()\` 的**完整实现**（echarts.init / ResizeObserver / watch(chartRef) / resize / dispose）
- 数据加载函数（loadData 等）的**定义**、轮询定时器
- 其他与图表 / 数据获取相关的运行时逻辑

⚠️ 不要写 \`<template>\` / \`<style>\` 块；**不要重复** import 与 \`ref\` / \`reactive\` / \`computed\` 定义（已在第 1 部分声明）；**不要再次调用 \`$mcComponentBuilder()\`**（已在第 1 部分解构，直接引用第 1 部分声明的 runtimeBuilder / componentProps / componentApi 即可）；不要写 \`onMounted\` / \`onUnmounted\` 钩子（已在第 2 部分生成），只导出 \`initCharts()\` 等函数供第 2 部分调用。`;

    return `
# 任务要求（分块生成 · 第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

${partGuide}${layoutBlock}
${resourceConstraintReinforcement}
${contextBlock}${buildSubComponentResponsibilityTable(input)}
# 输出格式

请**只输出 <script setup> 部分**（第 ${partIndex}/3 段），使用文件分隔符格式：

\`\`\`
// === package/index.vue ===
<script setup>
...本部分内容...
</script>
\`\`\`

**格式要求**：
- 以 \`// === package/index.vue ===\` 开头
- 紧接着输出 \`<script setup>\` 到 \`</script>\` 的完整内容
- **不要输出 <template> 块**
- **不要输出 <style> 块**
- 不要包裹在 JSON 或代码围栏中
${OUTPUT_FORMAT_WARNING_BRIEF}
`;
  }
