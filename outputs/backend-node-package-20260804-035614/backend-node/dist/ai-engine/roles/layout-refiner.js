/**
 * Layout Refiner - 布局精修师
 * 职责：精修Vue组件的布局结构，确保与Figma设计稿的Auto Layout完全一致
 * 输入：generatedFiles + figmaNodeData + layoutStructure
 * 输出：精修后的代码
 */

import { BaseAgent } from '../agents/base-agent.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { coerceLLMText } from '../utils/model-config.js'
import { invokeWithTimeout } from '../utils/llm-timeout.js'

const logger = createLogger({ name: 'layout-refiner' })

export class LayoutRefiner extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'layout-refiner',
      description: '布局精修器',
      model: config.model || 'claude-sonnet-4-6',
      temperature: config.temperature || 0.1,
      maxTokens: config.maxTokens || 8192,
      ...config
    })

    // 加载精修规则
    this.rules = this.loadReferenceFiles([
      'references/prompts/figma.md'
    ])

    logger.info('Layout Refiner 已初始化')
  }

  /**
   * 构建布局精修提示词
   */
  buildRefinePrompt(input) {
    const { figmaNodeData, layoutStructure, componentFiles,
            _reviseTarget = 'full', refineScope = '全面精修', target = 'microcode',
            visualDiffGuidance = null, targetFiles = null, targetClassNames = null } = input

    // 读取当前组件代码
    let currentCode = ''
    if (componentFiles && componentFiles.length > 0) {
      for (const file of componentFiles) {
        if (file.endsWith('.vue') || file.endsWith('.less')) {
          try {
            const content = readFileSync(file, 'utf-8')
            currentCode += `\n// === ${file} ===\n${content}\n`
          } catch (e) {
            logger.warn(`无法读取文件: ${file}`)
          }
        }
      }
    }

    // 🆕 P0-1: 根据 _reviseTarget 构建精修范围指令
    const scopeInstruction = _reviseTarget === 'layout'
      ? `**本次精修范围：${refineScope}**\n- ✅ 专注于修复 flex-direction / gap / padding / margin / width / height / overflow 等布局属性\n- ✅ 以 Figma 节点数据为权威布局参考，修复所有不一致\n- ❌ 不要修改样式属性（颜色 / 字体 / 阴影 / 圆角 / 边框）\n- ❌ 不要修改 <script> 中的逻辑代码`
      : _reviseTarget === 'stylistic'
      ? `**本次精修范围：${refineScope}**\n- ⚠️ 仅验证 layout 相关问题，不做大幅修改\n- ✅ 检查布局是否存在明显的结构性错误\n- ❌ 不要修改样式属性`
      : `**本次精修范围：${refineScope}**\n- ✅ 全面精修布局结构，确保与 Figma 数据一致`

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

    const prompt = `
你是一个专业的布局精修师，负责精修Vue 3组件的CSS布局，确保与Figma设计稿布局一致。

# 当前任务

检查并修复以下组件的布局结构，以 Figma 节点数据为权威布局参考。

${scopeInstruction}
${visualDiffGuidance ? `\n${visualDiffGuidance}\n` : ''}

# Figma 节点数据（关键布局信息）

\`\`\`json
${JSON.stringify(this._extractLayoutData(figmaNodeData), null, 2)}
\`\`\`

# 布局结构分析

\`\`\`json
${JSON.stringify(layoutStructure, null, 2)}
\`\`\`

# 当前组件代码

${currentCode || '(代码将在运行时读取)'}

# 精修规则

## 1. Figma Auto Layout → CSS Flex 映射

| Figma layoutMode | CSS |
|------------------|-----|
| HORIZONTAL | display: flex; flex-direction: row |
| VERTICAL | display: flex; flex-direction: column |
| 无 layoutMode | display: block（默认） |

## 2. 对齐方式映射

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

## 3. 尺寸精确规则

- 固定宽/高从 figmaNode.absoluteBoundingBox 提取精确像素值
- 子组件高度按 Figma 真实比例分配（禁止平分）
- flex 值与 height 百分比保持正比关系
- 所有子组件高度百分比之和 ≈ 100%
- **Vue3 目标例外**：根容器（最外层 div）**禁止**使用 Figma 固定像素宽高，必须保持 \`width: 100%; height: 100%;\`，由预览 iframe 的 aspect-ratio 维护原始比例

## 4. Flex 高度传递链

- flex 容器必须有至少一个子元素设置 flex: N 或固定高度
- 嵌套 flex 容器递归应用此规则
- 图表容器必须有 min-height: 0 和 min-width: 0

## 5. 禁止事项

- ❌ 禁止在根容器使用 overflow-y: auto
- ❌ 禁止子组件设置与父容器冲突的固定高度
- ❌ 禁止忘记 min-height: 0
- ❌ 禁止 flex 容器不给子元素分配高度

# 输出要求

请精修上述代码中的布局CSS，严格按照Figma数据修复以下内容：

1. 修正 flex-direction 与 Figma layoutMode 不一致的地方
2. 修正 justify-content / align-items 与 Figma 对齐不一致的地方
3. 修正子组件高度比例（从平分改为按 Figma bbox 真实比例）
4. 补充缺失的 min-height: 0
5. 补充缺失的 flex 分配
6. 修正错误的 overflow 属性

## 输出格式

请输出完整的精修后代码。保持文件结构不变，只修改CSS布局相关部分。

对每个修改，在代码上方添加注释说明：
\`\`\`css
/* [Layout Refine] Figma layoutMode=HORIZONTAL → flex-direction: row */
.container {
  display: flex;
  flex-direction: row;
}
\`\`\`

直接输出完整的文件内容，格式如下：
\`\`\`
// === package/index.vue ===
<template>...</template>
<style>...</style>

// === package/components/xxx.vue ===
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

本组件是标准 Vue3 组件（非微码），**必须**把面板头部与背景渲染为真实 DOM/CSS，而非交给宿主面板系统：

- **背景**：根容器必须用真实 CSS 还原 \`layoutStructure\` 中的 background（图/色/渐变）。
- **标题栏**：渲染真实 \`<div class="xxx-header">\`，含标题文本、副标题、更新时间、单位。
- **标题栏右侧控件**（Tab/指标/图标按钮）渲染为真实 DOM，位置与 Figma 一致。
- \`headerSlots\` 中的 title-left / title-right / header-right 元素必须渲染为真实 DOM，不得忽略。
- 承载背景的容器按需 \`overflow: hidden\`。

精修布局时**不得**删除或破坏上述头部/背景 DOM 与样式。
`
    }

    // 🔴 6 红线：所有目标通用（微码 + vue3），2026-07-24 从 vue3 守卫中提升为全局硬约束
    prompt += `
# 🚨 CRITICAL — 图表与面板 UI 还原红线（6 类高频缺陷，违反输出将被自动修正或拒绝）

以下 6 条是硬约束，精修时必须逐条对照 Figma 数据执行。**不使用 cover/center/no-repeat 作为背景默认值；不使用单值 radius；不漏边框；不漏/错 legend；不遗漏卡片区块。**
违反第 1 条（bg-size）的输出将在后处理中被**自动替换**为 \`100% 100%\`。

1. **背景图精确还原（bg-size）** [AUTO-FIX]：
   - Figma 背景图必须精确设置 \`background-size\` 为实际渲染尺寸或 \`100% 100%\`
   - **严禁使用 \`cover\` / \`contain\` / \`center\` / \`no-repeat\`**
   - 正确：\`background-size: 100% 100%;\` 错误：\`backgroundSize: 'cover'\`

2. **环形图环厚（radius）**：
   - ECharts 环形图必须用 \`radius: ['内%', '外%']\` 数组控制环厚
   - 严禁单值 \`radius: '50%'\` 或 \`radius: ['0%', '70%']\`

3. **边框生成（border）**：
   - Figma stroke → \`border: <strokeWeight>px solid <color>\` + \`border-radius: <cornerRadius>px\`
   - 严禁只设 background-color 而遗漏 border

4. **图例位置（legend.position）**：
   - ECharts \`legend\` 必须传 \`top\`/\`bottom\`/\`left\`/\`right\` 对齐 Figma 方位
   - 严禁不传 position 依赖默认值

5. **图例存在性（legend 必生成）**：
   - Figma 有图例 → 必须生成 \`legend: { data: [...] }\`
   - 严禁只写 \`series\` 不写 \`legend\`

6. **交通预测/趋势卡片（区块还原）**：
   - 卡片区块必须渲染为真实 DOM（数值+单位+环比/趋势箭头+状态色）
   - 严禁整块遗漏或用占位文本
`
  }

  /**
   * 从Figma节点数据中提取布局相关信息
   */
  _extractLayoutData(figmaNodeData) {
    if (!figmaNodeData) return {}
    
    const extract = (node, depth = 0) => {
      if (depth > 6) return null // 限制深度
      if (!node || typeof node !== 'object') return null

      const layoutInfo = {
        name: node.name,
        type: node.type
      }

      // 提取布局相关字段
      if (node.layoutMode) layoutInfo.layoutMode = node.layoutMode
      if (node.primaryAxisAlignItems) layoutInfo.primaryAxisAlignItems = node.primaryAxisAlignItems
      if (node.counterAxisAlignItems) layoutInfo.counterAxisAlignItems = node.counterAxisAlignItems
      if (node.absoluteBoundingBox) {
        layoutInfo.bbox = {
          x: node.absoluteBoundingBox.x,
          y: node.absoluteBoundingBox.y,
          width: node.absoluteBoundingBox.width,
          height: node.absoluteBoundingBox.height
        }
      }
      if (node.paddingTop !== undefined) layoutInfo.paddingTop = node.paddingTop
      if (node.paddingRight !== undefined) layoutInfo.paddingRight = node.paddingRight
      if (node.paddingBottom !== undefined) layoutInfo.paddingBottom = node.paddingBottom
      if (node.paddingLeft !== undefined) layoutInfo.paddingLeft = node.paddingLeft
      if (node.itemSpacing !== undefined) layoutInfo.itemSpacing = node.itemSpacing
      if (node.counterAxisSpacing !== undefined) layoutInfo.counterAxisSpacing = node.counterAxisSpacing

      // 递归提取子节点
      if (node.children && Array.isArray(node.children)) {
        layoutInfo.children = node.children
          .map(child => extract(child, depth + 1))
          .filter(Boolean)
      }

      return layoutInfo
    }

    return extract(figmaNodeData)
  }

  /**
   * 执行布局精修
   */
  async execute(params) {
    const { figmaNodeData, layoutStructure, outputPath, generatedFiles, _reviseTarget = 'full', target = 'microcode', onProgress = null, visualDiffGuidance = null, targetFiles = null, targetClassNames = null } = params

    // 🆕 v3.0: 记录修订目标
    logger.info('开始布局精修', {
      fileCount: generatedFiles?.length || 0,
      reviseTarget: _reviseTarget,
      partialRevision: (targetFiles && targetFiles.length) ? { files: targetFiles, classes: targetClassNames } : false
    })

    // 🆕 #5: 部分修订 —— 仅把目标文件交给 refiner，未命中文件不读取也不重写
    const targetSet = new Set(targetFiles || [])
    const genMap = (generatedFiles || []).map(f => ({ rel: f, abs: join(outputPath, f) }))
    let componentFiles = genMap.map(x => x.abs)
    if (targetSet.size > 0) {
      componentFiles = genMap.filter(x => targetSet.has(x.rel)).map(x => x.abs)
      logger.info('🎯 #5: 布局精修局部模式，仅载入目标文件', { files: [...targetSet] })
    }

    try {
      // 🆕 v3.0: 根据 _reviseTarget 调整精修策略
      let refineScope = '全面精修'
      if (_reviseTarget === 'layout') {
        refineScope = '仅布局修正（间距/对齐/flex）'
      } else if (_reviseTarget === 'stylistic') {
        // 如果路由目标是纯样式，layout refiner 可以跳过或做轻量检查
        logger.info('路由目标为 stylistic，layout-refiner 执行轻量模式')
        refineScope = '轻量检查（仅验证 layout 相关问题）'
      }

      // 构建提示词
      const prompt = this.buildRefinePrompt({
        figmaNodeData,
        layoutStructure,
        componentFiles,
        _reviseTarget,
        refineScope,
        target,
        visualDiffGuidance,
        targetFiles,
        targetClassNames
      })

      // 调用LLM
      const response = await invokeWithTimeout(this.llm, prompt, 180000, 'layout-refiner', onProgress, {
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
        logger.info('6 红线自动修补完成（layout-refiner）', { patches: redLinePatches })
      }

      logger.info('布局精修完成', {
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
      logger.error('布局精修失败', { error: error.message })
      // 精修失败不应该阻断流程
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
            let sepPath = sepPathRaw
            if (sepPath.startsWith('/')) {
              const relIdx = sepPath.indexOf('temp-components/')
              if (relIdx >= 0) {
                const afterTemp = sepPath.substring(relIdx + 'temp-components/'.length)
                const parts = afterTemp.split('/')
                if (parts.length > 2) {
                  sepPath = parts.slice(2).join('/')
                }
              }
            }
            target = sepPath
            fenceContent = fenceContent.replace(/\/\/\s*===\s*[\s\S]*?===\s*\n?/g, '').trim()
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
          const sanitized = this._sanitizeFileContent ? this._sanitizeFileContent(fenceContent) : fenceContent
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
        const fp = join(dir, `layout-refiner-parse-fail-${ts}.txt`)
        writeFileSync(fp, content)
        logger.error('layout-refiner 解析失败，已落盘原始输出', { path: fp, contentLength: content.length })
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

        // 规则 1：bg-size 自动修补
        if (/background-size\s*:\s*cover/i.test(content)) {
          content = content.replace(/background-size\s*:\s*cover/gi, 'background-size: 100% 100%')
          patched = true
        }
        if (/background-size\s*:\s*contain/i.test(content)) {
          content = content.replace(/background-size\s*:\s*contain/gi, 'background-size: 100% 100%')
          patched = true
        }
        if (/backgroundSize\s*:\s*['"]cover['"]/i.test(content)) {
          content = content.replace(/backgroundSize\s*:\s*['"]cover['"]/gi, "backgroundSize: '100% 100%'")
          patched = true
        }
        if (/background-position\s*:\s*center/i.test(content)) {
          content = content.replace(/[;\s]*background-position\s*:\s*center\s*;?/gi, '')
          patched = true
        }
        if (/backgroundPosition\s*:\s*['"]center['"]/i.test(content)) {
          content = content.replace(/,\s*backgroundPosition\s*:\s*['"]center['"]/gi, '')
          content = content.replace(/backgroundPosition\s*:\s*['"]center['"]\s*,?\s*/gi, '')
          patched = true
        }
        if (/background-repeat\s*:\s*no-repeat/i.test(content)) {
          content = content.replace(/[;\s]*background-repeat\s*:\s*no-repeat\s*;?/gi, '')
          patched = true
        }

        if (patched) {
          writeFileSync(fullPath, content, 'utf-8')
          patches.push(`${relPath}: bg-size fixed`)
        }
      } catch (e) {
        logger.warn(`_applyRedLineFixes(layout) 处理文件失败: ${relPath}`, { error: e.message })
      }
    }

    return patches
  }

  /**
   * 🆕 v3.0: 检测上游（engineer）产生的结构性问题
   * 判断当前布局问题是否需要回退到 engineer 重做
   */
  detectUpstreamIssues(refinedContent, originalParams) {
    const feedback = {
      needsEngineerRework: false,
      templateIssues: [],
      layoutIssues: []
    }

    try {
      // 检测是否发现 template 层面的结构性问题
      // 例如：组件结构完全错误、缺少必要的关键 DOM 节点等
      if (refinedContent && typeof refinedContent === 'string') {
        // 如果精修输出为空或极短，说明原始代码结构可能有大问题
        if (refinedContent.length < 100) {
          feedback.needsEngineerRework = true
          feedback.templateIssues.push('生成的代码结构不完整，layout-refiner 无法有效精修')
        }
        
        // 检测是否报告了无法修复的布局问题
        if (refinedContent.includes('template 结构错误') || 
            refinedContent.includes('需要重新生成')) {
          feedback.needsEngineerRework = true
          feedback.templateIssues.push('layout-refiner 报告需要重新生成 template')
        }
      }
    } catch (e) {
      logger.warn('detectUpstreamIssues 检查失败', { error: e.message })
    }

    return feedback
  }
}
