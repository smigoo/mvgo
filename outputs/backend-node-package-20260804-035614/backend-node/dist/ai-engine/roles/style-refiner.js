/**
 * Style Refiner - 样式精修师
 * 职责：精修Vue组件的CSS样式，确保颜色、字体、阴影、圆角等与Figma设计稿像素级对齐
 * 输入：generatedFiles + figmaNodeData + styleMappings + visualElements
 * 输出：精修后的样式代码
 */

import { BaseAgent } from '../agents/base-agent.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'

const logger = createLogger({ name: 'style-refiner' })

export class StyleRefiner extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'style-refiner',
      description: '样式精修器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0.1,
      maxTokens: config.maxTokens || 8192,
      ...config
    })

    // 加载精修规则
    this.rules = this.loadReferenceFiles([
      'references/prompts/figma.md'
    ])

    logger.info('Style Refiner 已初始化')
  }

  /**
   * 构建样式精修提示词
   */
  buildRefinePrompt(input) {
    const { figmaNodeData, styleMappings, visualElements, componentFiles,
            _reviseTarget = 'full', refineScope = '全面精修', target = 'microcode',
            visualDiffGuidance = null, targetFiles = null, targetClassNames = null } = input

    // 读取当前样式代码
    let currentStyles = ''
    if (componentFiles && componentFiles.length > 0) {
      for (const file of componentFiles) {
        if (file.endsWith('.less') || file.endsWith('.vue')) {
          try {
            const content = readFileSync(file, 'utf-8')
            currentStyles += `\n// === ${file} ===\n${content}\n`
          } catch (e) {
            logger.warn(`无法读取文件: ${file}`)
          }
        }
      }
    }

    // 提取关键样式数据
    const styleData = this._extractStyleData(figmaNodeData)

    // 🆕 P0-1: 根据 _reviseTarget 构建精修范围指令
    const scopeInstruction = _reviseTarget === 'stylistic'
      ? `**本次精修范围：${refineScope}**\n- ✅ 专注于修复颜色、字体、阴影、圆角、边框等样式属性\n- ✅ 修复与 Figma 数据不一致的样式值\n- ❌ 不要修改 <template> 中的 HTML 结构\n- ❌ 不要修改布局属性（flex-direction / gap / padding / margin / width / height）\n- ❌ 不要修改 <script> 中的逻辑代码`
      : _reviseTarget === 'layout'
      ? `**本次精修范围：${refineScope}**\n- ⚠️ 仅验证 style 相关问题，不做大幅修改\n- ✅ 检查样式属性是否存在明显语法错误\n- ❌ 不要修改布局结构`
      : `**本次精修范围：${refineScope}**\n- ✅ 全面精修样式代码，确保与 Figma 设计数据完全一致`

    const rootContainerInstruction = target === 'microcode'
      ? `
## 🔴 root 容器样式禁令（仅微码面板组件）

当组件使用 \`<base-panel>\` 时，root 容器（\`.c-{componentName}-root\`）是 base-panel 的内容包裹层，**不是面板本身**。

**root 容器禁止设置以下属性**（这些属于 base-panel chrome 样式，由面板组件提供）：
- ❌ \`background\` / \`background-color\`
- ❌ \`border\` / \`border-radius\`
- ❌ \`box-shadow\`

**root 容器允许设置**：width/height、display/flex、overflow、padding。
Figma 内容区背景应应用到内容区容器，而不是 root。
`
      : ''

    // 🆕 #5: 部分修订（外科式精修）指令 —— 只改 critique 指定的文件/类，保留其余内容
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

    let prompt = `
你是一个专业的样式精修师，负责精修Vue 3组件的CSS样式，确保与Figma设计稿像素级对齐。

# 当前任务

精修以下组件的样式代码，使其与Figma设计数据完全一致。

${scopeInstruction}
${visualDiffGuidance ? `\n${visualDiffGuidance}\n` : ''}

# 🔴 零臆造准则（最高优先级）

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
- ❌ 无依据添加边框: \`border: 1px solid #e8e8e8;\`

${rootContainerInstruction}

# Figma 样式数据

## 关键节点样式（fills / effects / strokes / cornerRadius）

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

# 当前样式代码

${currentStyles || '(代码将在运行时读取)'}

# 精修规则

## 1. 颜色转换（Figma fills.color → CSS）

Figma 颜色格式: \`{ r: 0-1, g: 0-1, b: 0-1, a: 0-1 }\`

转换公式:
\`\`\`
r_dec = Math.round(r * 255)
g_dec = Math.round(g * 255)
b_dec = Math.round(b * 255)
// CSS: rgb(r_dec, g_dec, b_dec) 或 #RRGGBB
\`\`\`

## 2. 背景处理

| fills.type | CSS实现 |
|-----------|---------|
| SOLID | \`background: #RRGGBB;\` |
| GRADIENT_LINEAR | \`background: linear-gradient(angle, colors);\` |
| GRADIENT_RADIAL | \`background: radial-gradient(colors);\` |
| IMAGE | \`background-image: url('path');\` |

## 3. 圆角 → border-radius

直接从 \`cornerRadius\` 字段提取，使用px单位

## 4. 阴影 → box-shadow

Figma effects 格式:
\`\`\`
{ type: 'DROP_SHADOW', offset: {x, y}, radius, color: {r, g, b, a} }
\`\`\`

CSS: \`box-shadow: x px y px radius px rgba(r, g, b, a);\`

## 5. 描边 → border

Figma strokes 格式:
\`\`\`
{ type: 'SOLID', color: {r, g, b, a} }
\`\`\`

CSS: \`border: strokeWeight px solid rgba(r, g, b, a);\`

## 6. 字体样式

| Figma style 字段 | CSS |
|-----------------|-----|
| fontFamily | font-family |
| fontSize | font-size (px) |
| fontWeight | font-weight |
| lineHeightPx | line-height (px) |
| letterSpacing | letter-spacing (px) |
| textAlignHorizontal | text-align |

# 输出要求

请精修上述代码中的CSS样式，严格按照Figma数据修复以下内容：

1. 修正颜色值（background, color, border-color）→ 从 fills 提取
2. 修正字体样式（font-family, font-size, font-weight, line-height）→ 从 style 提取
3. 添加缺失的圆角（border-radius）→ 从 cornerRadius 提取
4. 添加缺失的阴影（box-shadow）→ 从 effects 提取
5. 添加缺失的描边（border）→ 从 strokes 提取
6. 删除无 Figma 依据的样式（零臆造准则）

## 输出格式

对每个修改，在代码上方添加注释说明Figma数据来源：
\`\`\`css
/* [Style Refine] fills[0].color → rgb(51,68,85) → #334455 */
.container {
  background: #334455;
}
\`\`\`

直接输出完整的文件内容，格式如下：
\`\`\`
// === resources/styles/common.less ===
...

// === resources/styles/themes/theme-vars.less ===
...

// === package/index.vue ===
...
\`\`\`

**⚠️ 格式要求**：
- \`// === 文件路径 ===\` 分隔符只能用于标记文件内容的开始，禁止在代码注释、说明文字、思考过程等非文件内容中使用此前缀

${partialInstruction}
开始精修：
`

    // 🆕 C3: vue3 目标下追加「面板头部与背景真实还原」校验
    if (target === 'vue3') {
      prompt += `
# 🆕 面板头部与背景【必须真实还原】（vue3 目标）

本组件是标准 Vue3 组件（非微码），**必须**把面板头部与背景渲染为真实 DOM/CSS：

- **背景**：根容器用真实 CSS 还原 \`layoutStructure\` 中的 background（图/色/渐变）。
- **标题栏**：渲染真实 \`<div class="xxx-header">\`，含标题文本、副标题、更新时间、单位。
- **标题栏右侧控件**（Tab/指标/图标按钮���渲染为真实 DOM，位置与 Figma 一致。
- \`headerSlots\` 中的 title-left / title-right / header-right 元素必须渲染为真实 DOM，不得忽略。
- 承载背景的容器按需 \`overflow: hidden\`。

精修样式时**不得**删除或破坏上述头部/背景 DOM 与样式。
`
    }

    // 🔴 6 红线：所有目标通用（微码 + vue3），2026-07-24 从 vue3 守卫中提升为全局硬约束
    prompt += `
# 🚨 CRITICAL — 图表与面板 UI 还原红线（6 类高频缺陷，违反输出将被自动修正或拒绝）

以下 6 条是硬约束，精修时必须逐条对照 Figma 数据执行。**不使用 cover/center/no-repeat 作为背景默认值；不使用单值 radius；不漏边框；不漏/错 legend；不遗漏卡片区块。**
违反第 1 条（bg-size）的输出将在后处理中被**自动替换**为 \`100% 100%\`。其他条违反将被标记为不合格。

1. **背景图精确还原（bg-size）** [AUTO-FIX]：
   - Figma 背景图必须精确设置 \`background-size\` 为实际渲染尺寸或 \`100% 100%\`
   - **严禁使用 \`cover\` / \`contain\` / \`center\` / \`no-repeat\`**，这些值会破坏 Figma 精确还原
   - 正确示例：\`backgroundSize: '100% 100%'\` 或 \`background-size: 100% 100%;\`
   - 错误示例：\`backgroundSize: 'cover'\` / \`backgroundPosition: 'center'\` → 会被自动替换

2. **环形图环厚（radius）**：
   - ECharts 环形图必须用 \`radius: ['内%', '外%']\` 数组控制环厚
   - 示例：\`radius: ['55%', '75%']\` 表示内径 55%、外径 75%
   - 严禁单值 \`radius: '50%'\`（环过细）或 \`radius: ['0%', '70%']\`（变饼图）

3. **边框生成（border）**：
   - Figma 中任何节点标注了 stroke（描边），必须在对应 CSS 中生成 \`border: <strokeWeight>px solid <color>\`
   - 圆角同时设置 \`border-radius: <cornerRadius>px\`
   - 严禁只设 background-color 而遗漏 border

4. **图例位置（legend.position）**：
   - ECharts \`legend\` 的 \`top\` / \`bottom\` / \`left\` / \`right\` 必须对齐 Figma 图例的实际方位
   - 严禁不传 position 依赖默认值（ECharts 默认值可能不准）

5. **图例存在性（legend 必生成）**：
   - Figma 中有图例节点则必须生成对应的 \`legend: { data: [...] }\` 配置
   - 严禁只写 \`series\` 不写 \`legend\`——没有 legend 用户无法识别颜色对应关系

6. **交通预测/趋势卡片（区块还原）**：
   - 设计稿中"交通预测 / 趋势 / 预警"等卡片区块必须渲染为真实 DOM
   - 必须包含：数值 + 单位 + 环比/趋势箭头 + 状态色
   - 严禁整块遗漏或用占位文本替代
`

    return prompt
  }

  /**
   * 从Figma节点数据中提取样式相关信息
   */
  _extractStyleData(figmaNodeData) {
    if (!figmaNodeData) return {}

    const extract = (node, depth = 0) => {
      if (depth > 6) return null
      if (!node || typeof node !== 'object') return null

      const styleInfo = {
        name: node.name,
        type: node.type
      }

      // 提取样式相关字段
      if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
        styleInfo.fills = node.fills
          .filter(f => f.visible !== false)
          .map(f => ({
            type: f.type,
            color: f.color ? {
              r: f.color.r,
              g: f.color.g,
              b: f.color.b,
              a: f.color.a
            } : undefined,
            opacity: f.opacity,
            gradientStops: f.gradientStops,
            gradientHandlePositions: f.gradientHandlePositions
          }))
      }

      if (node.effects && Array.isArray(node.effects) && node.effects.length > 0) {
        styleInfo.effects = node.effects
          .filter(e => e.visible !== false)
          .map(e => ({
            type: e.type,
            radius: e.radius,
            offset: e.offset,
            color: e.color ? {
              r: e.color.r,
              g: e.color.g,
              b: e.color.b,
              a: e.color.a
            } : undefined,
            spread: e.spread
          }))
      }

      if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
        styleInfo.strokes = node.strokes
          .filter(s => s.visible !== false)
          .map(s => ({
            type: s.type,
            color: s.color ? {
              r: s.color.r,
              g: s.color.g,
              b: s.color.b,
              a: s.color.a
            } : undefined
          }))
        styleInfo.strokeWeight = node.strokeWeight
      }

      if (node.cornerRadius !== undefined) styleInfo.cornerRadius = node.cornerRadius
      if (node.rectangleCornerRadii) styleInfo.rectangleCornerRadii = node.rectangleCornerRadii
      if (node.opacity !== undefined && node.opacity !== 1) styleInfo.opacity = node.opacity
      if (node.blendMode && node.blendMode !== 'PASS_THROUGH') styleInfo.blendMode = node.blendMode

      // 字体样式
      if (node.style) {
        styleInfo.typography = {
          fontFamily: node.style.fontFamily,
          fontSize: node.style.fontSize,
          fontWeight: node.style.fontWeight,
          lineHeightPx: node.style.lineHeightPx,
          letterSpacing: node.style.letterSpacing,
          textAlignHorizontal: node.style.textAlignHorizontal
        }
      }

      // 递归提取子节点（只保留有样式信息的）
      if (node.children && Array.isArray(node.children)) {
        const childStyles = node.children
          .map(child => extract(child, depth + 1))
          .filter(Boolean)
        if (childStyles.length > 0) {
          styleInfo.children = childStyles
        }
      }

      return styleInfo
    }

    return extract(figmaNodeData)
  }

  /**
   * 执行样式精修
   */
  async execute(params) {
    const { figmaNodeData, styleMappings, visualElements, outputPath, generatedFiles, _reviseTarget = 'full', target = 'microcode', onProgress = null, visualDiffGuidance = null, targetFiles = null, targetClassNames = null } = params

    // 🆕 v3.0: 记录修订目标
    logger.info('开始样式精修', {
      fileCount: generatedFiles?.length || 0,
      hasStyleMappings: !!styleMappings,
      reviseTarget: _reviseTarget,
      partialRevision: (targetFiles && targetFiles.length) ? { files: targetFiles, classes: targetClassNames } : false
    })

    // 🆕 #5: 部分修订 —— 仅把目标文件交给 refiner，未命中文件不读取也不重写
    const targetSet = new Set(targetFiles || [])
    const genMap = (generatedFiles || []).map(f => ({ rel: f, abs: join(outputPath, f) }))
    let componentFiles = genMap.map(x => x.abs)
    if (targetSet.size > 0) {
      componentFiles = genMap.filter(x => targetSet.has(x.rel)).map(x => x.abs)
      logger.info('🎯 #5: 样式精修局部模式，仅载入目标文件', { files: [...targetSet] })
    }

    try {
      // 🆕 v3.0: 根据 _reviseTarget 调整精修策略
      let refineScope = '全面精修'
      if (_reviseTarget === 'stylistic') {
        refineScope = '仅样式修正（颜色/字体/阴影/圆角/边框）'
      } else if (_reviseTarget === 'layout') {
        logger.info('路由目标为 layout，style-refiner 执行轻量模式')
        refineScope = '轻量检查（仅验证 style 相关问题）'
      }

      // 构建提示词
      const prompt = this.buildRefinePrompt({
        figmaNodeData,
        styleMappings,
        visualElements,
        componentFiles,
        _reviseTarget,
        refineScope,
        target,
        visualDiffGuidance,
        targetFiles,
        targetClassNames
      })

      // 调用LLM
      const response = await invokeWithTimeout(this.llm, prompt, 180000, 'style-refiner', onProgress, {
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

      // 解析并写入精修后的文件
      const result = this._parseAndWriteFiles(refinedContent, outputPath, targetSet.size > 0 ? targetSet : null)

      // 🔴 6 红线后处理：自动修补违反 bg-size 规则的产物（2026-07-24）
      const redLinePatches = this._applyRedLineFixes(result.modifiedFiles, outputPath, params)
      if (redLinePatches.length > 0) {
        logger.info('6 红线自动修补完成', { patches: redLinePatches })
      }

      logger.info('样式精修完成', {
        modifiedFiles: result.modifiedFiles.length
      })

      return {
        refined: true,
        modifiedFiles: result.modifiedFiles,
        summary: result.summary,
        // 🆕 v3.0: 上游反馈信息
        upstreamFeedback: this.detectUpstreamIssues(refinedContent, params)
      }

    } catch (error) {
      logger.error('样式精修失败', { error: error.message })
      return { refined: false, reason: error.message }
    }
  }

  /**
   * 清理文件内容中的 markdown 代码围栏
   */
  _sanitizeFileContent(content) {
    if (!content || typeof content !== 'string') return content

    // 去除开头的 markdown 代码围栏（``` 或 ```less 等）
    let sanitized = content.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')

    // 🆕 去除 <thinking>...</thinking> 块（LLM 推理文本泄漏）
    sanitized = sanitized.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')

    // 去除结尾的 markdown 代码围栏（单独成行的 ```）
    sanitized = sanitized.replace(/\n?\s*```\s*$/g, '')

    // 去除中间可能出现的独立 markdown 围栏行（整行只有 ``` 或 ```lang）
    sanitized = sanitized.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')

    // 🆕 对 .vue 文件：去除 </style> / </script> / </template> 之后的说明性文本/markdown残留
    if (sanitized.includes('</style>') || sanitized.includes('</script>') || sanitized.includes('</template>')) {
      const closingTags = ['</style>', '</script>', '</template>']
      let lastCloseIdx = -1
      let lastCloseTagLen = 0
      for (const tag of closingTags) {
        const idx = sanitized.lastIndexOf(tag)
        if (idx > lastCloseIdx) {
          lastCloseIdx = idx
          lastCloseTagLen = tag.length
        }
      }
      if (lastCloseIdx !== -1) {
        const afterClose = sanitized.substring(lastCloseIdx + lastCloseTagLen)
        if (afterClose.trim() && /```|精修|说明|#\s|说明|Explanation|NOTE:|\*\*|<thinking>|完成|改进|验证/.test(afterClose)) {
          sanitized = sanitized.substring(0, lastCloseIdx + lastCloseTagLen)
        }
      }
    }

    // 去除首尾多余空白
    return sanitized.trim()
  }

  /**
   * 校验文件路径是否合法
   * 过滤掉 LLM 输出中误解析为文件名的中文标题、markdown 符号等
   */
  _isValidFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return false

    // 禁止：中文字符、空格、markdown 符号（* # ` | 等）
    if (/[\u4e00-\u9fa5\s*#`|]/.test(filePath)) return false

    // 必须有文件扩展名（点号后跟 1-10 个字母数字）
    if (!/\.\w{1,10}$/.test(filePath)) return false

    // 只允许安全路径字符：字母数字、/、.、-、_
    if (!/^[\w/.-]+$/.test(filePath)) return false

    return true
  }

  /**
   * 解析LLM输出并写入文件
   */
  _parseAndWriteFiles(content, outputPath, allowedFiles = null) {
    const modifiedFiles = []
    const skippedFiles = []
    const filePattern = /\/\/\s*={3}\s*(.+?)\s*={2,3}\n([\s\S]*?)(?=\n\/\/\s*={3}|$)/g
    let match

    while ((match = filePattern.exec(content)) !== null) {
      const rawPath = match[1].trim()
      const fileContent = match[2].trim()

      if (rawPath && fileContent) {
        // 🛡️ 文件名合法性校验：过滤中文标题、markdown 符号等非法文件名
        if (!this._isValidFilePath(rawPath)) {
          skippedFiles.push(rawPath)
          logger.warn(`跳过非法文件路径: "${rawPath}"（包含中文/空格/markdown符号或缺少扩展名）`)
          continue
        }

        // 🆕 #5: 部分修订 —— 仅写入目标文件集合内的文件，其余一律忽略（外科式保障）
        if (allowedFiles && allowedFiles.size > 0 && !allowedFiles.has(rawPath)) {
          skippedFiles.push(rawPath)
          continue
        }

        // 规范化路径：如果 LLM 返回的是完整路径（包含 outputPath 前缀），只保留相对部分
        // 或者包含 .. 会导致 join 产生重复路径，需要去除前缀
        let relativePath = rawPath
        // 将 outputPath 和 rawPath 都 resolve 为绝对路径，找出相对部分
        const resolved = resolve(rawPath)
        const resolvedBase = resolve(outputPath)
        if (resolved.startsWith(resolvedBase + '/')) {
          relativePath = resolved.substring(resolvedBase.length + 1)
        }
        // 如果 rawPath 已经以 outputPath 开头（作为相对路径字符串），也需处理
        const normalizedOutput = outputPath.replace(/\/+$/, '') + '/'
        if (rawPath.startsWith(normalizedOutput)) {
          relativePath = rawPath.substring(normalizedOutput.length)
        }
        const fullPath = join(outputPath, relativePath)
        try {
          mkdirSync(dirname(fullPath), { recursive: true })
          // 🧹 清理 markdown 代码围栏后再写入
          const sanitizedContent = this._sanitizeFileContent(fileContent)
          writeFileSync(fullPath, sanitizedContent, 'utf-8')
          modifiedFiles.push(relativePath)
        } catch (e) {
          logger.warn(`写入文件失败: ${relativePath}`, { error: e.message })
        }
      }
    }

    if (skippedFiles.length > 0) {
      logger.info(`_parseAndWriteFiles 跳过了 ${skippedFiles.length} 个非法文件路径`, { skipped: skippedFiles })
    }

    // 🆕 兜底：分隔符未匹配到任何文件时，尝试代码围栏格式（```vue/```less 等）
    if (modifiedFiles.length === 0) {
      logger.warn('分隔符格式未匹配到文件，尝试代码围栏兜底解析', { contentPreview: content.substring(0, 300) })
      const langToFile = {
        vue: 'package/index.vue',
        less: 'resources/styles/index.less',
        css: 'resources/styles/index.css',
        json: 'declare.json'
      }
      const fencePattern = /```(\w+)?[^\n]*\n([\s\S]*?)\n```/g
      let fm
      while ((fm = fencePattern.exec(content)) !== null) {
        const lang = (fm[1] || '').toLowerCase()
        let fenceContent = fm[2].trim()
        if (!fenceContent) continue
        let target = langToFile[lang]

        // 🆕 #5: 部分修订 —— 兜底解析也只保留目标文件
        if (allowedFiles && allowedFiles.size > 0 && target && !allowedFiles.has(target)) continue

        // 🆕 检查围栏内容是否含分隔符标记（// === path ===），用分隔符路径替换默认映射
        const sepMatch = fenceContent.match(/\/\/\s*===\s*([\s\S]*?)\s*===/)
        if (sepMatch) {
          const sepPathRaw = sepMatch[1].replace(/\s*\n\s*/g, '').trim()
          if (sepPathRaw && sepPathRaw.includes('.')) {
            // 如果分隔符路径是绝对路径，转为相对于 outputPath 的路径
            let sepPath = sepPathRaw
            if (sepPath.startsWith('/')) {
              const relIdx = sepPath.indexOf('temp-components/')
              if (relIdx >= 0) {
                const afterTemp = sepPath.substring(relIdx + 'temp-components/'.length)
                const parts = afterTemp.split('/')
                // 跳过 group/session-name 前缀，取后面的相对路径
                if (parts.length > 2) {
                  sepPath = parts.slice(2).join('/')
                }
              }
            }
            target = sepPath
            // 移除分隔符标记行
            fenceContent = fenceContent.replace(/\/\/\s*===\s*[\s\S]*?===\s*\n?/g, '').trim()
            // 移除孤立的路径碎片行和 === 行
            fenceContent = fenceContent.replace(/^\s*===\s*$/gm, '').replace(/^\s*\/[\w\/.\-]+\.(less|vue|js|json)\s*$/gm, '').trim()
            logger.info(`代码围栏内检测到分隔符路径，使用: ${target}`)
          }
        }

        // 🆕 如果没有语言标识且没有分隔符，尝试根据内容推断文件类型
        if (!target && !lang) {
          if (/^<template>|^<script|^<style/.test(fenceContent)) {
            target = 'package/index.vue'
          } else if (/^\.[\w-]+\s*\{|^@import|^:[\w-]+\s*\{|^&[\w.]/.test(fenceContent)) {
            target = 'resources/styles/index.less'
          } else if (/^\{|^componentId/.test(fenceContent)) {
            target = 'declare.json'
          }
        }

        if (!target) continue
        // 🆕 #5: 部分修订 —— 兜底解析也只保留目标文件
        if (allowedFiles && allowedFiles.size > 0 && !allowedFiles.has(target)) continue
        if ((lang === 'json' || target.endsWith('.json')) && !/componentId/.test(fenceContent)) continue

        const fullPath = join(outputPath, target)
        try {
          mkdirSync(dirname(fullPath), { recursive: true })
          const sanitized = this._sanitizeFileContent(fenceContent)
          writeFileSync(fullPath, sanitized, 'utf-8')
          modifiedFiles.push(target)
          logger.info(`代码围栏兜底写入文件: ${target}`)
        } catch (e) {
          logger.warn(`代码围栏兜底写入失败: ${target}`, { error: e.message })
        }
      }
    }

    // 🆕 最终兜底：所有解析都失败时，落盘原始输出便于排查
    if (modifiedFiles.length === 0) {
      try {
        const dir = join(process.cwd(), 'data')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const fp = join(dir, `style-refiner-parse-fail-${ts}.txt`)
        writeFileSync(fp, content)
        logger.error('style-refiner 解析失败，已落盘原始输出', { path: fp, contentLength: content.length })
      } catch (e) {
        logger.warn('落盘失败', { error: e.message })
      }
    }

    return {
      modifiedFiles,
      summary: modifiedFiles.length > 0
        ? `已精修 ${modifiedFiles.length} 个文件: ${modifiedFiles.join(', ')}`
        : '未检测到需要修改的文件'
    }
  }

  /**
   * 解析输出
   */
  parseOutput(rawOutput) {
    return coerceLLMText(rawOutput)
  }

  /**
   * 🔴 6 红线后处理：自动修补 LLM 输出中违反红线的代码（2026-07-24）
   * 在 _parseAndWriteFiles 之后调用，对已写入磁盘的文件做确定性修复
   * 当前覆盖：规则 1（bg-size cover/center/no-repeat → 100% 100%）
   */
  _applyRedLineFixes(modifiedFiles, outputPath, params) {
    const patches = []

    if (!modifiedFiles || modifiedFiles.length === 0) return patches

    for (const relPath of modifiedFiles) {
      const fullPath = resolve(outputPath, relPath)
      if (!existsSync(fullPath)) continue

      try {
        let content = readFileSync(fullPath, 'utf-8')
        let patched = false

        // ── 规则 1：bg-size 自动修补 ──
        // CSS 属性形式：background-size: cover → 100% 100%
        if (/background-size\s*:\s*cover/i.test(content)) {
          content = content.replace(/background-size\s*:\s*cover/gi, 'background-size: 100% 100%')
          patched = true
        }
        // CSS 属性形式：background-size: contain → 100% 100%
        if (/background-size\s*:\s*contain/i.test(content)) {
          content = content.replace(/background-size\s*:\s*contain/gi, 'background-size: 100% 100%')
          patched = true
        }
        // JS inline style 形式：backgroundSize: 'cover' → '100% 100%'
        if (/backgroundSize\s*:\s*['"]cover['"]/i.test(content)) {
          content = content.replace(/backgroundSize\s*:\s*['"]cover['"]/gi, "backgroundSize: '100% 100%'")
          patched = true
        }
        // 移除 background-position: center（100% 100% 不需要）
        if (/background-position\s*:\s*center/i.test(content)) {
          content = content.replace(/[;\s]*background-position\s*:\s*center\s*;?/gi, '')
          patched = true
        }
        // JS inline: backgroundPosition: 'center' → 移除
        if (/backgroundPosition\s*:\s*['"]center['"]/i.test(content)) {
          content = content.replace(/,\s*backgroundPosition\s*:\s*['"]center['"]/gi, '')
          content = content.replace(/backgroundPosition\s*:\s*['"]center['"]\s*,?\s*/gi, '')
          patched = true
        }
        // 移除 background-repeat: no-repeat（100% 100% 不需要）
        if (/background-repeat\s*:\s*no-repeat/i.test(content)) {
          content = content.replace(/[;\s]*background-repeat\s*:\s*no-repeat\s*;?/gi, '')
          patched = true
        }

        // ── 规则 3：边框缺失检测（仅日志告警，不自动修补 — 需 Figma stroke 数据）──
        if (!/\bborder\s*:\s*[\d.]+px\s+solid/i.test(content) &&
            !/border-color/i.test(content)) {
          const figmaNodeData = params.figmaNodeData || {}
          const hasStrokes = this._hasFigmaStrokes(figmaNodeData)
          if (hasStrokes) {
            logger.warn(`⚠️ 红线③：Figma 标注了 stroke 但产物未发现 border 声明`, {
              file: relPath,
              hint: '请手动检查是否需要补 border: <N>px solid <color>'
            })
          }
        }

        // ── 规则 5：图例存在性检测（仅日志告警）──
        if (content.includes('series') && !content.includes('legend')) {
          const figmaNodeData = params.figmaNodeData || {}
          if (this._hasFigmaLegend(figmaNodeData)) {
            logger.warn(`⚠️ 红线⑤：Figma 有图例但产物含 series 无 legend`, {
              file: relPath,
              hint: '请手动补 legend: { data: [...] } 配置'
            })
          }
        }

        if (patched) {
          writeFileSync(fullPath, content, 'utf-8')
          patches.push(`${relPath}: bg-size fixed`)
        }
      } catch (e) {
        logger.warn(`_applyRedLineFixes 处理文件失败: ${relPath}`, { error: e.message })
      }
    }

    return patches
  }

  /**
   * 递归检查 Figma 节点树是否包含 stroke 标注
   */
  _hasFigmaStrokes(node) {
    if (!node || typeof node !== 'object') return false
    if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) return true
    if (node.children && Array.isArray(node.children)) {
      return node.children.some(c => this._hasFigmaStrokes(c))
    }
    return false
  }

  /**
   * 递归检查 Figma 节点树是否包含图例（name 含"图例"/"legend"）
   */
  _hasFigmaLegend(node) {
    if (!node || typeof node !== 'object') return false
    if (node.name && /图例|legend/i.test(node.name)) return true
    if (node.children && Array.isArray(node.children)) {
      return node.children.some(c => this._hasFigmaLegend(c))
    }
    return false
  }

  /**
   * 🆕 v3.0: 检测上游（engineer）产生的样式相关问题
   * 判断是否需要回退到 engineer 重做
   */
  detectUpstreamIssues(refinedContent, originalParams) {
    const feedback = {
      needsEngineerRework: false,
      variableMissing: [],
      styleOnlyIssues: []
    }

    try {
      if (refinedContent && typeof refinedContent === 'string') {
        // 如果精修输出为空或极短
        if (refinedContent.length < 100) {
          feedback.needsEngineerRework = true
          feedback.variableMissing.push('生成的代码结构不完整，style-refiner 无法有效精修')
        }
        
        // 检测 CSS 变量未定义问题（需要 engineer 补充 vars.less）
        const varMissingMatches = refinedContent.match(/undefined variable|变量未定义|CSS 变量缺失/gi)
        if (varMissingMatches && varMissingMatches.length > 0) {
          feedback.variableMissing.push('检测到 CSS 变量未定义问题，需要 engineer 补充 vars.less')
        }

        // 检测 scoped 属性被移除的情况（需要 engineer 重新生成）
        if (refinedContent.includes('scoped 被移除') || refinedContent.includes('<style>')) {
          feedback.needsEngineerRework = true
          feedback.styleOnlyIssues.push('scoped 属性丢失，需要重新生成')
        }
      }
    } catch (e) {
      logger.warn('detectUpstreamIssues 检查失败', { error: e.message })
    }

    return feedback
  }
}
