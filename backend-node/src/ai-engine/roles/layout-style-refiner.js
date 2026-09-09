/**
 * Layout + Style Refiner (合并精修师) v3.8
 * 职责：在单次 LLM 调用中同时精修布局和样式，替代 layout-refiner → style-refiner 串行链
 * 优势：
 *   - LLM 调用次数减半（2 → 1）
 *   - Token 消耗节省 ~40%（共用 Figma 数据和代码上下文）
 *   - 延迟减少 ~50%（消除串行等待）
 *   - 布局和样式在同一次思考中协调，减少冲突
 *
 * 输入：generatedFiles + figmaNodeData + layoutStructure + styleMappings + visualElements
 * 输出：精修后的完整代码
 */

import { BaseAgent } from '../agents/base-agent.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'
import { extractPatches, applyPatchesToWorkspace, hasPatchBlocks } from '../utils/diff-engine.js'
import { checkFileIntegrity } from '../utils/file-integrity.js'
import { hasFakeDataRegression } from '../utils/sfc-semantics.js'
import { prePatchSnapshot, verifyPatchAndRollback } from '../utils/patch-l0b-guard.js'
import { neutralizeSectionComments } from '../utils/delimiter-guard.js'
import { validateVueSfc } from '../utils/sfc-syntax-validation.js'
import { recompileIndexCss, hasLessFile } from '../utils/index-css-recompiler.js'

const logger = createLogger({ name: 'layout-style-refiner' })

export class LayoutStyleRefiner extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'layout-style-refiner',
      description: '布局+样式合并精修器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0.1,
      maxTokens: config.maxTokens || 12288,  // 合并版需要更多 tokens（两份指令）
      ...config
    })

    this.rules = this.loadReferenceFiles([
      'references/prompts/figma.md'
    ])

    logger.info('Layout+Style Refiner 已初始化 (v3.8 合并版)')
  }

  /**
   * 构建合并精修提示词
   * 分为两阶段：Phase 1 布局精修 → Phase 2 样式精修
   * 让 LLM 先理解布局结构，再在此结构上精修样式细节
   */
  buildRefinePrompt(input) {
    const { figmaNodeData, layoutStructure, styleMappings, visualElements, componentFiles,
            _reviseTarget = 'full', target = 'microcode', targetFiles = null, targetClassNames = null } = input

    // 读取当前代码
    let currentCode = ''
    if (componentFiles && componentFiles.length > 0) {
      for (const file of componentFiles) {
        if (file.endsWith('.vue') || file.endsWith('.less') || file.endsWith('.css')) {
          try {
            const content = readFileSync(file, 'utf-8')
            currentCode += `\n// === ${file} ===\n${content}\n`
          } catch (e) {
            logger.warn(`无法读取文件: ${file}`)
          }
        }
      }
    }

    // === 精修范围指令 ===
    const scopeInstruction = _reviseTarget === 'stylistic'
      ? `**本次精修范围：仅样式修正**
- ✅ 专注于修复颜色、字体、阴影、圆角、边框等样式属性
- ✅ 修复与 Figma 数据不一致的样式值
- ❌ 不要修改 <template> 中的 HTML 结构
- ❌ 不要修改布局属性（flex-direction / gap / padding / margin）`
      : _reviseTarget === 'layout'
      ? `**本次精修范围：仅布局修正**
- ✅ 专注于修复 flex-direction / gap / padding / margin / width / height 等布局属性
- ✅ 以 Figma 节点数据为权威布局参考
- ❌ 不要修改样式属性（颜色 / 字体 / 阴影 / 圆角）`
      : `**本次精修范围：全面精修**
- ✅ 布局精修 → 样式精修 统一执行`

    // 部分修订（外科式精修）指令 —— 只改 critique 指定的文件/类，保留其余内容
    function buildPartialInstruction() {
      if (targetClassNames && targetClassNames.length) {
        return `# 🎯 部分修订（外科式精修，务必遵守）\n\n本次只修改以下 CSS 类/选择器，其余内容原样保留：\n- ${targetClassNames.map((c) => '.' + c).join('\n- ')}\n\n规则：\n1. 只输出上述类所在的文件，且只重写这些类的定义块；\n2. 严禁改动未列出的类、严禁输出或重写其他文件；\n3. 保持各文件其他部分（模板、脚本、其他样式）完全不变，不要“顺手”重排或重写。`
      }
      if (targetFiles && targetFiles.length) {
        return `# 🎯 部分修订（局部精修，务必遵守）\n\n本次只修改以下文件，其余文件原样保留：\n- ${targetFiles.join('\n- ')}\n\n规则：\n1. 只输出上述文件；\n2. 严禁改动或重写未列出的文件；\n3. 保持各文件其他内容完全不变。`
      }
      return ''
    }
    const partialInstruction = buildPartialInstruction()

    // === 提取关键数据 ===
    const layoutData = this._extractLayoutData(figmaNodeData)
    const styleData = this._extractStyleData(figmaNodeData)
    const rootContainerInstruction = target === 'microcode'
      ? `
## 🔴 root 容器样式禁令（仅微码面板组件）

当组件使用 \`<base-panel>\` 时：
- ❌ root 容器禁止: background, background-color, border, border-radius, box-shadow
- ✅ root 容器允许: width/height, display/flex, overflow, padding
- 内容区背景色应应用到 \`.c-{name}-content\` 而非 root
`
      : ''

    let prompt = `
你是一个专业的布局+样式合并精修师，负责同时精修Vue 3组件的CSS布局和样式，确保与Figma设计稿像素级对齐。

# 当前任务

对以下组件进行两阶段精修：先修复布局结构，再在此结构上精修样式细节。

${scopeInstruction}

---

# Phase 1: 布局精修

## Figma 布局数据（关键布局信息）

\`\`\`json
${JSON.stringify(layoutData, null, 2)}
\`\`\`

## 布局结构分析

\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

## 布局精修规则

### 1. Figma Auto Layout → CSS Flex 映射

| Figma layoutMode | CSS |
|------------------|-----|
| HORIZONTAL | display: flex; flex-direction: row |
| VERTICAL | display: flex; flex-direction: column |

### 2. 对齐方式映射

| Figma primaryAxisAlignItems | CSS justify-content |
|----------------------------|---------------------|
| MIN | flex-start |
| CENTER | center |
| MAX | flex-end |
| SPACE_BETWEEN | space-between |

| Figma counterAxisAlignItems | CSS align-items |
|----------------------------|-----------------|
| MIN | flex-start |
| CENTER | center |
| MAX | flex-end |

### 3. 尺寸精确规则
- 固定宽/高从 figmaNode.absoluteBoundingBox 提取精确像素值
- 子组件高度按 Figma 真实比例分配（禁止平分）
- flex 值与 height 百分比保持正比关系

### 4. 布局禁止事项
- ❌ 禁止在根容器使用 overflow-y: auto
- ❌ 禁止子组件设置与父容器冲突的固定高度
- ❌ 禁止忘记 min-height: 0（flex 嵌套必须）
- ❌ 禁止 flex 容器不给子元素分配高度

---

# Phase 2: 样式精修

## Figma 样式数据（fills / effects / strokes / cornerRadius）

\`\`\`json
${JSON.stringify(styleData, null, 2)}
\`\`\`

## 样式映射结果

\`\`\`json
${JSON.stringify(styleMappings, null, 2)}
\`\`\`

## 视觉元素

\`\`\`json
${JSON.stringify(visualElements, null, 2)}
\`\`\`

## 🔴 零臆造准则（最高优先级）

**只使用Figma数据中明确存在的样式属性，禁止任何基于"美观"或"经验"的添加。**

### 合法样式来源
1. Figma fills（非IMAGE类型）→ 可还原 background / color
2. Figma cornerRadius > 0 → 可还原 border-radius
3. Figma effects（阴影效果）→ 可还原 box-shadow / filter
4. Figma strokes → 可还原 border
5. 已下载背景图资源 → 可使用 background-image

### 常见违规（严禁）
- ❌ 无依据添加白色背景: \`background: #ffffff;\`
- ❌ 无依据添加圆角: \`border-radius: 8px;\`
- ❌ 无依据添加阴影: \`box-shadow: 0 2px 8px rgba(0,0,0,0.1);\`

## 颜色转换公式

Figma 颜色: \`{ r: 0-1, g: 0-1, b: 0-1, a: 0-1 }\`
→ CSS: \`rgb(Math.round(r*255), Math.round(g*255), Math.round(b*255))\`

${rootContainerInstruction}

---

# 当前代码

${currentCode || '(代码将在运行时读取)'}

---

# 🚨 CRITICAL — 图表与面板 UI 还原红线（6 类高频缺陷）

以下 6 条是硬约束，精修时必须逐条对照 Figma 数据执行。违反将被自动修正或标记不合格。

1. **背景图精确还原（bg-size）** [AUTO-FIX]:
   - 严禁使用 cover/contain/center/no-repeat
   - 必须使用 \`background-size: 100% 100%;\`

2. **环形图环厚（radius）**:
   - ECharts 环形图必须用 \`radius: ['内%', '外%']\` 数组
   - 严禁单值 \`radius: '50%'\`

3. **边框生成（border）**:
   - Figma stroke → \`border: <N>px solid <color>\` + \`border-radius\`

4. **图例位置（legend.position）**:
   - 必须传 top/bottom/left/right 对齐 Figma 方位

5. **图例存在性（legend 必生成）**:
   - Figma 有图例 → 必须生成 legend 配置

6. **交通预测/趋势卡片（区块还原）**:
   - 卡片必须渲染为真实 DOM，严禁遗漏

7. **数据保真（DATA-FIDELITY）**:
   - 🚫 **严禁使用 \`Math.random()\` / 伪造数据** 填充图表、数值、统计卡片
   - 🚫 严禁替换、删除或改写原文件中已有的真实数据值/数据源
   - ✅ 图表数据必须保留原文件中的具体数值（data / series / value），仅允许调整样式、布局、尺寸
   - ✅ 统计数字（如流量、占比）必须来自 Figma 数据或原文件，不得自造

---

# 输出要求

请按以下顺序精修：

1. 修正 flex-direction 与 Figma layoutMode 不一致的地方
2. 修正 justify-content / align-items 与 Figma 对齐不一致的地方
3. 修正子组件高度比例（从平分改为按 Figma bbox 真实比例）
4. 补充缺失的 min-height: 0 / flex 分配
5. 修正颜色值（从 fills 提取，按零臆造准则）
6. 修正字体样式（从 style 提取）
7. 添加缺失的圆角、阴影、描边
8. 删除无 Figma 依据的样式

## 输出格式

对每个修改，在代码上方添加注释：
\`\`\`css
/* [Layout Refine] Figma layoutMode=HORIZONTAL → flex-direction: row */
/* [Style Refine] fills[0].color → rgb(51,68,85) */
.container {
  display: flex;
  flex-direction: row;
  background: #334455;
}
\`\`\`

直接输出完整的文件内容：
\`\`\`
// === resources/styles/common.less ===
...

// === resources/styles/themes/theme-vars.less ===
...

// === package/index.vue ===
...
\`\`\`

**⚠️ 格式要求（优先使用 PATCH 模式，精简输出）**：

**首选格式 — PATCH 模式**（每次只输出实际修改的部分）：

\`\`\`
<<<PATCH package/index.vue
--- ORIGINAL
  需要被替换的原始代码（从当前文件中精确复制）
---
+++ NEW
  替换后的新代码
>>>PATCH

<<<PATCH resources/styles/index.less
--- ORIGINAL
  需要被替换的原始样式代码
---
+++ NEW
  替换后的新样式代码
>>>PATCH
\`\`\`

每条 PATCH 规则：
- \`--- ORIGINAL\` 下方必须是对应文件中的**精确原文**（可从上方"当前代码"中直接复制），包含相同的缩进和空格
- \`+++ NEW\` 下方是修改后的代码
- 只输出有实际修改的文件；未修改的文件不要输出
- 一个文件可以有多个 PATCH 块（但建议合并为少量大块，方便匹配和减少 token）

**备用格式 — 完整文件输出**（仅在需要大范围重写或 PATCH 匹配可能失败时使用）：
\`\`\`
// === package/index.vue ===
完整文件内容...

// === resources/styles/index.less ===
完整文件内容...
\`\`\`

${partialInstruction}
开始精修：
`

    //C3: vue3 目标下追加真实 DOM 渲染要求
    if (target === 'vue3') {
      prompt += `

#面板头部与背景【必须真实还原】（vue3 目标）

本组件是标准 Vue3 组件，**必须**把面板头部与背景渲染为真实 DOM/CSS：
- **背景**: 根容器用真实 CSS 还原 layoutStructure 中的 background（图/色/渐变）
- **标题栏**: 渲染真实 <div class="xxx-header">，含标题、副标题、时间、单位
- **标题栏右侧控件**: Tab/指标/图标按钮渲染为真实 DOM
- headerSlots 中的元素必须渲染为真实 DOM，不得忽略
- 不得删除或破坏头部/背景 DOM 与样式
- **根容器尺寸**: 根容器必须保持 \`width: 100%; height: 100%;\`，禁止改为 Figma 固定像素值，由预览 iframe 的 aspect-ratio 维护原始比例
`
    }

    return prompt
  }

  /**
   * 从Figma节点提取布局信息
   */
  _extractLayoutData(figmaNodeData) {
    if (!figmaNodeData) return {}

    const extract = (node, depth = 0) => {
      if (depth > 6) return null
      if (!node || typeof node !== 'object') return null

      const info = { name: node.name, type: node.type }

      if (node.layoutMode) info.layoutMode = node.layoutMode
      if (node.primaryAxisAlignItems) info.primaryAxisAlignItems = node.primaryAxisAlignItems
      if (node.counterAxisAlignItems) info.counterAxisAlignItems = node.counterAxisAlignItems
      if (node.absoluteBoundingBox) {
        info.bbox = { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
      }
      if (node.paddingTop !== undefined) info.paddingTop = node.paddingTop
      if (node.paddingRight !== undefined) info.paddingRight = node.paddingRight
      if (node.paddingBottom !== undefined) info.paddingBottom = node.paddingBottom
      if (node.paddingLeft !== undefined) info.paddingLeft = node.paddingLeft
      if (node.itemSpacing !== undefined) info.itemSpacing = node.itemSpacing

      if (node.children && Array.isArray(node.children)) {
        info.children = node.children.map(c => extract(c, depth + 1)).filter(Boolean)
      }
      return info
    }

    return extract(figmaNodeData)
  }

  /**
   * 从Figma节点提取样式信息
   */
  _extractStyleData(figmaNodeData) {
    if (!figmaNodeData) return {}

    const extract = (node, depth = 0) => {
      if (depth > 6) return null
      if (!node || typeof node !== 'object') return null

      const info = { name: node.name, type: node.type }

      if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
        info.fills = node.fills.filter(f => f.visible !== false).map(f => ({
          type: f.type,
          color: f.color ? { r: f.color.r, g: f.color.g, b: f.color.b, a: f.color.a } : undefined,
          opacity: f.opacity,
          gradientStops: f.gradientStops
        }))
      }
      if (node.effects && Array.isArray(node.effects) && node.effects.length > 0) {
        info.effects = node.effects.filter(e => e.visible !== false).map(e => ({
          type: e.type, radius: e.radius,
          offset: e.offset,
          color: e.color ? { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a } : undefined,
          spread: e.spread
        }))
      }
      if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
        info.strokes = node.strokes.filter(s => s.visible !== false).map(s => ({
          type: s.type,
          color: s.color ? { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } : undefined
        }))
        info.strokeWeight = node.strokeWeight
      }
      if (node.cornerRadius !== undefined) info.cornerRadius = node.cornerRadius
      if (node.opacity !== undefined && node.opacity !== 1) info.opacity = node.opacity
      if (node.style) {
        info.typography = {
          fontFamily: node.style.fontFamily, fontSize: node.style.fontSize,
          fontWeight: node.style.fontWeight, lineHeightPx: node.style.lineHeightPx,
          letterSpacing: node.style.letterSpacing, textAlignHorizontal: node.style.textAlignHorizontal
        }
      }
      if (node.children && Array.isArray(node.children)) {
        info.children = node.children.map(c => extract(c, depth + 1)).filter(Boolean)
      }
      return info
    }
    return extract(figmaNodeData)
  }

  /**
   * 执行合并精修
   */
  async execute(params) {
    const { figmaNodeData, layoutStructure, styleMappings, visualElements,
            outputPath, generatedFiles, _reviseTarget = 'full', target = 'microcode', onProgress = null, targetFiles = null, targetClassNames = null } = params

    logger.info('开始合并精修 (Layout+Style)', {
      fileCount: generatedFiles?.length || 0,
      reviseTarget: _reviseTarget,
      partialRevision: (targetFiles && targetFiles.length) ? { files: targetFiles, classes: targetClassNames } : false
    })

    // 部分修订 —— 仅把目标文件交给 refiner，未命中文件不读取也不重写
    const targetSet = new Set(targetFiles || [])
    const genMap = (generatedFiles || []).map(f => ({ rel: f, abs: join(outputPath, f) }))
    let componentFiles = genMap.map(x => x.abs)
    if (targetSet.size > 0) {
      componentFiles = genMap.filter(x => targetSet.has(x.rel)).map(x => x.abs)
      logger.info('🎯 #5: 合并精修局部模式，仅载入目标文件', { files: [...targetSet] })
    }

    try {
      const prompt = this.buildRefinePrompt({
        figmaNodeData, layoutStructure, styleMappings, visualElements,
        componentFiles, _reviseTarget, target,
        refineScope: _reviseTarget === 'full' ? '全面精修（布局+样式）' : _reviseTarget,
        targetFiles, targetClassNames
      })

      // 文件生命周期：精修阶段（文件组级状态，不虚构单个活动文件）
      onProgress?.({ fileLifecycle: {
        phase: 'modeling',
        summary: (targetFiles && targetFiles.length)
          ? `正在精修 ${targetFiles.length} 个目标文件（布局+样式）`
          : '正在精修文件组（布局+样式）',
      } })

      // 单次 LLM 调用
      const response = await invokeWithTimeout(this.llm, prompt, 480000, 'layout-style-refiner', onProgress, {
        signal: params.signal,
        onProgress,
        requestConcurrency: params.requestConcurrency,
        requestQueueTimeoutMs: params.requestQueueTimeoutMs,
        requestTimeoutMs: params.requestTimeoutMs,
        requestMaxRetries: params.requestMaxRetries,
        model: this.model,
        provider: 'text-role',
      })
      const refinedContent = coerceLLMText(response.content)

      if (typeof refinedContent !== 'string') {
        logger.warn('LLM返回非字符串内容，跳过精修')
        return { refined: false, reason: '非字符串输出' }
      }

      // 文件生命周期：解析精修响应
      onProgress?.({ fileLifecycle: {
        phase: 'parsing',
        summary: '正在解析精修结果并定位待写回文件',
      } })

      //解析并应用精修结果（优先 PATCH 模式，失败回退到完整文件模式）
      let result = await this._tryApplyPatches(refinedContent, outputPath, componentFiles, targetSet.size > 0 ? targetSet : null)

      if (!result) {
        // PATCH 模式未生效（无 PATCH 块或应用失败），回退到完整文件模式
        logger.info('🔄 PATCH 模式未生效，回退到完整文件解析模式')
        result = this._parseAndWriteFiles(refinedContent, outputPath, targetSet.size > 0 ? targetSet : null)
      }

      // 6 红线后处理
      const redLinePatches = this._applyRedLineFixes(result.modifiedFiles, outputPath, params)
      if (redLinePatches.length > 0) {
        logger.info('6 红线自动修补完成（合并精修）', { patches: redLinePatches })
      }

      // 🛡️ 方案三：精修改了 .less 后，重编译 index.css 同步 component.js 引入的产物，
      // 避免旧类名/旧布局残留（幽灵样式）覆盖 scoped 样式。
      if (hasLessFile(result.modifiedFiles)) {
        await recompileIndexCss(outputPath, logger)
      }

      // 文件生命周期：精修结果已写回
      onProgress?.({ fileLifecycle: {
        phase: 'writing',
        summary: `精修结果已写回 ${result.modifiedFiles.length} 个文件`,
        files: (result.modifiedFiles || []).map((path) => ({ path, state: 'modified' })),
      } })

      logger.info('合并精修完成', { modifiedFiles: result?.modifiedFiles?.length ?? 0 })

      return {
        refined: true,
        modifiedFiles: result.modifiedFiles,
        summary: result.summary,
        // 兼容上游：同时返回 layoutResult 和 styleResult（merged=true 标记）
        mergedRefinement: true,
        layoutRefineResult: { refined: true, merged: true },
        styleRefineResult: { refined: true, merged: true }
      }
    } catch (error) {
      // 🛡️ P0: 记录完整 stack，便于下次运行精确定位 undefined.length 的真凶行（此前只记 message 导致无法定位）
      logger.error('合并精修失败', { error: error.message, stack: error.stack })
      return { refined: false, reason: error.message, mergedRefinement: true }
    }
  }

  // === 以下为文件解析/清理/红线修正方法（复用自 style-refiner & layout-refiner）===

  _sanitizeFileContent(content) {
    if (!content || typeof content !== 'string') return content
    let sanitized = content.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')
    sanitized = sanitized.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')

    // 去除管线内部注释（[Layout Refine] / [Style Refine]），防止泄漏到最终产物
    // 覆盖 CSS 注释 /* ... */ 和 HTML 注释 <!-- ... --> 两种形式
    sanitized = sanitized.replace(/[ \t]*\/\*\s*\[(Layout|Style)\s*Refine\][^\n]*?\*\/[ \t]*\n?/g, '')
    sanitized = sanitized.replace(/[ \t]*<!--\s*\[(Layout|Style)\s*Refine\][^\n]*?-->[ \t]*\n?/g, '')

    sanitized = sanitized.replace(/\n?\s*```\s*$/g, '')
    sanitized = sanitized.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')

    if (sanitized.includes('</style>') || sanitized.includes('</script>') || sanitized.includes('</template>')) {
      const closingTags = ['</style>', '</script>', '</template>']
      let lastCloseIdx = -1, lastCloseTagLen = 0
      for (const tag of closingTags) {
        const idx = sanitized.lastIndexOf(tag)
        if (idx > lastCloseIdx) { lastCloseIdx = idx; lastCloseTagLen = tag.length }
      }
      if (lastCloseIdx !== -1) {
        const afterClose = sanitized.substring(lastCloseIdx + lastCloseTagLen)
        if (afterClose.trim() && /```|精修|说明|#\s|Explanation|NOTE:|\*\*|<thinking>|完成|改进|验证/.test(afterClose)) {
          sanitized = sanitized.substring(0, lastCloseIdx + lastCloseTagLen)
        }
      }
    }
    return sanitized.trim()
  }

  _isValidFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return false
    if (/[\u4e00-\u9fa5\s*#`|]/.test(filePath)) return false
    if (!/\.\w{1,10}$/.test(filePath)) return false
    if (!/^[\w/.-]+$/.test(filePath)) return false
    return true
  }

  _parseAndWriteFiles(content, outputPath, allowedFiles = null) {
    // 🛡️ 分隔符保护：中和代码内分节注释（// === 响应式状态 ===），
    //    否则会被当成文件分隔符，导致其后内容被切走、写盘产物残缺。
    const guard = neutralizeSectionComments(content, (p) => this._isValidFilePath(p))
    if (guard.neutralized > 0) {
      logger.info(`分隔符保护：中和 ${guard.neutralized} 处代码内分节注释`, { names: guard.names.slice(0, 5) })
      content = guard.text
    }

    const modifiedFiles = []
    const skippedFiles = []
    const filePattern = /\/\/\s*={3}\s*(.+?)\s*={2,3}\n([\s\S]*?)(?=\n\/\/\s*={3}|$)/g
    let match

    while ((match = filePattern.exec(content)) !== null) {
      const rawPath = match[1].trim()
      const fileContent = match[2].trim()

      if (rawPath && fileContent) {
        if (!this._isValidFilePath(rawPath)) {
          skippedFiles.push(rawPath)
          continue
        }
        // 部分修订 —— 仅写入目标文件集合内的文件，其余一律忽略（外科式保障）
        if (allowedFiles && allowedFiles.size > 0 && !allowedFiles.has(rawPath)) {
          skippedFiles.push(rawPath)
          continue
        }
        let relativePath = rawPath
        const resolved = resolve(rawPath)
        const resolvedBase = resolve(outputPath)
        if (resolved.startsWith(resolvedBase + '/')) {
          relativePath = resolved.substring(resolvedBase.length + 1)
        }
        const normalizedOutput = outputPath.replace(/\/+$/, '') + '/'
        if (rawPath.startsWith(normalizedOutput)) {
          relativePath = rawPath.substring(normalizedOutput.length)
        }
        const fullPath = join(outputPath, relativePath)
        try {
          mkdirSync(dirname(fullPath), { recursive: true })
          const sanitized = this._sanitizeFileContent(fileContent)
          // 🛡️ 此前 layout-style-refiner 完全无写入前校验，截断的 .less/.css 会直接落盘。
          // 统一用 checkFileIntegrity 覆盖 .vue / .less / .css / .json（含括号、注释块平衡）
          const integrity = checkFileIntegrity(sanitized, relativePath)
          if (!integrity.complete) {
            logger.warn(`⚠️ 写入前校验失败，跳过不完整的文件: ${relativePath}`, {
              reason: integrity.reason,
              contentLength: sanitized.length,
            })
            skippedFiles.push(`${relativePath} (不完整)`)
            continue
          }
          // 🛡️ 假数据回归拦截：不得引入 Math.random()（图表数据应来自 Figma/原文件）
          const existing = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : ''
          if (hasFakeDataRegression(existing, sanitized)) {
            logger.warn(`🚫 拦截假数据回归: ${relativePath} 引入了 Math.random()，跳过写入`)
            skippedFiles.push(`${relativePath} (假数据)`)
            continue
          }
          writeFileSync(fullPath, sanitized, 'utf-8')
          modifiedFiles.push(relativePath)
        } catch (e) {
          logger.warn(`写入文件失败: ${relativePath}`, { error: e.message })
        }
      }
    }

    // 兜底：代码围栏解析
    if (modifiedFiles.length === 0) {
      const langToFile = { vue: 'package/index.vue', less: 'resources/styles/index.less', css: 'resources/styles/index.css', json: 'declare.json' }
      const fencePattern = /```(\w+)?[^\n]*\n([\s\S]*?)\n```/g
      let fm
      while ((fm = fencePattern.exec(content)) !== null) {
        const lang = (fm[1] || '').toLowerCase()
        let fenceContent = fm[2].trim()
        if (!fenceContent) continue
        let target = langToFile[lang]

        // 部分修订 —— 兜底解析也只保留目标文件
        if (allowedFiles && allowedFiles.size > 0 && target && !allowedFiles.has(target)) continue

        if (!target && !lang) {
          if (/^<template>|^<script|^<style/.test(fenceContent)) target = 'package/index.vue'
          else if (/^\.[\w-]+\s*\{|^@import|^:[\w-]+\s*\{/.test(fenceContent)) target = 'resources/styles/index.less'
          else if (/^\{|^componentId/.test(fenceContent)) target = 'declare.json'
        }
        if (!target) continue
        // 部分修订 —— 兜底解析也只保留目标文件
        if (allowedFiles && allowedFiles.size > 0 && !allowedFiles.has(target)) continue

        const fullPath = join(outputPath, target)
        try {
          mkdirSync(dirname(fullPath), { recursive: true })
          const sanitized = this._sanitizeFileContent(fenceContent)
          // 🛡️ 写入前校验完整性（统一覆盖 .vue / .less / .css / .json）
          const fenceIntegrity = checkFileIntegrity(sanitized, target)
          if (!fenceIntegrity.complete) {
            logger.warn(`⚠️ 代码围栏兜底校验失败，跳过不完整的文件: ${target}`, {
              reason: fenceIntegrity.reason,
              contentLength: sanitized.length,
            })
            continue
          }
          // 🛡️ 假数据回归拦截（兜底解析路径）
          const fenceExisting = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : ''
          if (hasFakeDataRegression(fenceExisting, sanitized)) {
            logger.warn(`🚫 拦截假数据回归（兜底路径）: ${target} 引入了 Math.random()，跳过写入`)
            continue
          }
          writeFileSync(fullPath, sanitized, 'utf-8')
          modifiedFiles.push(target)
        } catch (e) {
          logger.warn(`兜底写入失败: ${target}`, { error: e.message })
        }
      }
    }

    return {
      modifiedFiles,
      summary: modifiedFiles.length > 0
        ? `已精修 ${modifiedFiles.length} 个文件: ${modifiedFiles.join(', ')}`
        : '未检测到需要修改的文件'
    }
  }

  _applyRedLineFixes(modifiedFiles, outputPath, params) {
    const patches = []
    if (!modifiedFiles || modifiedFiles.length === 0) return patches

    for (const relPath of modifiedFiles) {
      const fullPath = resolve(outputPath, relPath)
      if (!existsSync(fullPath)) continue

      try {
        let content = readFileSync(fullPath, 'utf-8')
        let patched = false

        // 规则1: bg-size
        if (/background-size\s*:\s*cover/i.test(content)) { content = content.replace(/background-size\s*:\s*cover/gi, 'background-size: 100% 100%'); patched = true }
        if (/background-size\s*:\s*contain/i.test(content)) { content = content.replace(/background-size\s*:\s*contain/gi, 'background-size: 100% 100%'); patched = true }
        if (/backgroundSize\s*:\s*['"]cover['"]/i.test(content)) { content = content.replace(/backgroundSize\s*:\s*['"]cover['"]/gi, "backgroundSize: '100% 100%'"); patched = true }
        if (/background-position\s*:\s*center/i.test(content)) { content = content.replace(/[;\s]*background-position\s*:\s*center\s*;?/gi, ''); patched = true }
        if (/backgroundPosition\s*:\s*['"]center['"]/i.test(content)) { content = content.replace(/,\s*backgroundPosition\s*:\s*['"]center['"]/gi, ''); content = content.replace(/backgroundPosition\s*:\s*['"]center['"]\s*,?\s*/gi, ''); patched = true }
        if (/background-repeat\s*:\s*no-repeat/i.test(content)) { content = content.replace(/[;\s]*background-repeat\s*:\s*no-repeat\s*;?/gi, ''); patched = true }

        if (patched) {
          if (relPath.endsWith('.vue')) {
            const syntaxResult = validateVueSfc(content, relPath)
            if (!syntaxResult.valid) {
              logger.warn(`红线修复后 Vue 文件未通过编译，跳过写回: ${relPath}`, { errors: syntaxResult.errors })
              continue
            }
          }
          writeFileSync(fullPath, content, 'utf-8')
          patches.push(`${relPath}: bg-size fixed`)
        }
      } catch (e) {
        logger.warn(`_applyRedLineFixes 失败: ${relPath}`, { error: e.message })
      }
    }
    return patches
  }

  /**
   *尝试以 PATCH 模式解析并应用 LLM 输出（2026-08-06）
   */
  async _tryApplyPatches(content, outputPath, componentFiles, allowedFiles = null) {
    if (!hasPatchBlocks(content)) return null

    const patches = extractPatches(content)
    if (!patches || patches.length === 0) return null

    let effectivePatches = patches
    if (allowedFiles && allowedFiles.size > 0) {
      effectivePatches = patches.filter(p => allowedFiles.has(p.filePath))
      if (effectivePatches.length === 0) return null
    }

    const patchSnapshot = prePatchSnapshot(componentFiles, outputPath)
    const result = await applyPatchesToWorkspace(componentFiles, effectivePatches, outputPath, {
      logger: { info: (msg, meta) => logger.info(msg, meta), warn: (msg, meta) => logger.warn(msg, meta), error: (msg, meta) => logger.error(msg, meta) }
    })

    if (result.modifiedFiles.length === 0) return null

    // ① PATCH 后 L0-B 自检：BLOCK 增加就回退
    const guard = verifyPatchAndRollback(componentFiles, outputPath, patchSnapshot)
    if (guard.rolledBack) {
      logger.warn('⚠️ PATCH 引入新 BLOCK，已回退到完整文件模式', { newBlocks: guard.newBlocks })
      return null
    }

    logger.info(`✅ PATCH 模式成功：${result.modifiedFiles.length} 个文件被修改`, { files: result.modifiedFiles })
    return {
      modifiedFiles: result.modifiedFiles,
      summary: result.modifiedFiles.length > 0
        ? `已精修 ${result.modifiedFiles.length} 个文件: ${result.modifiedFiles.join(', ')}`
        : '未检测到需要修改的文件'
    }
  }

  parseOutput(rawOutput) {
    return coerceLLMText(rawOutput)
  }
}
