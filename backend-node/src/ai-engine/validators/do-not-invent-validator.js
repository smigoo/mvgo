/**
 * 生成后「禁止臆造」确定性校验器。
 *
 * 目标：在代码落盘 / 任务完成前，拦截模型基于组件名或行业语义自行补写的内容。
 * 与提示词中的 doNotInvent 约束互补——提示词是「软约束」，本校验器是「硬门禁」。
 *
 * 设计原则：宁可漏报，不可误伤。仅对结构 / 文案有清晰对照依据时判定违规。
 *
 * 当前实现三类高置信检查：
 * 1. 核心文案篡改：本组件分析约束 analysis.doNotInvent 中声明的「X→Y / 不要将 X 写成 Y」
 *    类禁止替换对，若在生成代码中分析原词 X 缺失、却出现误词 Y → BLOCK。
 *    注意：无任何硬编码常识词表，完全由每组件动态声明驱动（不同组件约束不同）。
 * 2. 图表系列膨胀：视觉分析标明单系列（单折线 / 单柱），生成代码却出现多个不同
 *    命名系列 → BLOCK（清晰的数据臆造信号）。
 * 3. 图表类型缺失：视觉分析识别到某类型图表（pie/doughnut/bar/line/area），但产物
 *    全文件（含子组件）里没有任何该类型的 echarts series → BLOCK。
 *    🛡️ 治本方向（2026-09-15 · mc-max-1789476464544-07e31fbb 实锤）：vision 识别到
 *    环形图，但 LLM 拆分组件时把图表 DOM 容器漏写（template 无 <div ref=chartRef>），
 *    script 里的 echarts.init 成了死代码。旧版只扫 index.vue（本组件是 50 行壳），
 *    导致「vision 有图 → 产物无图」这种缺失永远查不到。现改为全产物文件扫描。
 *
 * @param {object} opts
 * @param {Record<string,string>} [opts.files] 文件名→文件内容（含 package/index.vue 及子组件）
 * @param {object} [opts.analysis] 视觉分析对象（charts / doNotInvent / layoutStructure）
 * @returns {{ pass: boolean, blockCount: number, issues: Array, _analyzed: boolean }}
 */
import { extractSfcTemplate } from '../utils/sfc-template-extractor.js'

export function validateDoNotInvent({ files = {}, analysis = {} } = {}) {
  const issues = []
  const seen = new Set() // 去重：避免 doNotInvent 中重复声明同一「X→Y」产生多条相同违规

  // 🛡️ 治本（2026-09-15）：改为扫描**全部产物文件**（含 components/*.vue 子组件），
  // 而非仅 index.vue。图表 echarts 初始化代码大多在子组件里，只扫 index.vue 会漏判。
  const allVueContents = Object.entries(files)
    .filter(([p, c]) => typeof c === 'string' && /\.vue$/.test(p))
    .map(([, c]) => c)
  if (allVueContents.length === 0) {
    return { pass: true, issues: [], _analyzed: false }
  }
  const vueContent = allVueContents.join('\n')

  const text = extractTemplateText(vueContent)
  const doNotInvent =
    analysis.doNotInvent ||
    analysis.layoutStructure?.doNotInvent ||
    []

  // ── 1. 核心文案篡改 ──
  const forbiddenPairs = extractForbiddenPairs(doNotInvent)
  for (const { from, to } of forbiddenPairs) {
    if (!from || !to || from === to) continue
    const hasFrom = text.includes(from) || vueContent.includes(from)
    const hasTo = text.includes(to) || vueContent.includes(to)
    // 分析明确是 from，生成却只有 to（没有 from）→ 视为篡改
    if (hasTo && !hasFrom) {
      const msg = `核心文案被篡改：分析证据为「${from}」，生成代码出现「${to}」`
      if (!seen.has(msg)) {
        seen.add(msg)
        issues.push({
          severity: 'BLOCK',
          id: 'DO-NOT-INVENT-TEXT',
          message: msg,
          file: 'package/index.vue',
          snippet: extractSnippet(vueContent, to),
        })
      }
    }
  }

  // ── 2. 图表系列膨胀 ──
  const analysisCharts = analysis.charts || analysis.layoutStructure?.charts || []
  const singleSeries =
    analysisCharts.length > 0 &&
    analysisCharts.every((c) => !c.multiSeries && c.type !== 'multiple')
  const genSeries = countChartSeries(vueContent)
  if (singleSeries && genSeries && genSeries > 1) {
    const msg = `图表系列膨胀：视觉分析为单系列，生成代码出现 ${genSeries} 个系列`
    if (!seen.has(msg)) {
      seen.add(msg)
      issues.push({
        severity: 'WARN',
        id: 'DO-NOT-INVENT-CHART',
        message: msg,
        file: 'package/index.vue',
        snippet: extractSnippet(vueContent, 'series'),
      })
    }
  }

  // ── 2.5 图表类型缺失（治本方向 · 2026-09-15 · 07e31fbb 实锤）──
  // vision 识别到某类型图表，但产物全文件（含子组件）里没有对应类型的 echarts series。
  // 例：vision 有 doughnut，LLM 拆组件时漏写 template 图表容器（chartRef），script 的
  // echarts.init 成死代码 → 最终产物看不到图。旧版只扫 index.vue，查不到这种缺失。
  if (analysisCharts.length > 0) {
    const requiredTypes = new Set(
      analysisCharts
        .map((c) => normalizeChartType(c?.type))
        .filter((t) => t !== null),
    )
    const generatedTypes = collectChartSeriesTypes(vueContent)
    // echarts 的 series 对象缺省 type 时默认为 'line'：vision 说 line 时，
    // 产物只要有任意 series 声明（即便未显式写 type:'line'）即视为满足。
    const hasSeriesDecl = /series\s*:\s*\[/.test(vueContent)
    for (const t of requiredTypes) {
      const satisfied =
        generatedTypes.has(t) || (t === 'line' && hasSeriesDecl)
      if (!satisfied) {
        const msg = `图表类型缺失：视觉分析识别到「${t}」类型图表，但产物代码中没有任何对应类型的 echarts series（图表容器/初始化可能漏写）`
        if (!seen.has(msg)) {
          seen.add(msg)
          issues.push({
            severity: 'BLOCK',
            id: 'DO-NOT-INVENT-CHART-MISSING',
            message: msg,
            file: 'package/index.vue',
          })
        }
      }
    }
  }

  // ── 3. 数据点膨胀 ──
  const analysisDataPoints = analysis.dataPoints || analysis.layoutStructure?.dataPoints
  if (typeof analysisDataPoints === 'number' && analysisDataPoints > 0) {
    const genDataPoints = countDataPoints(vueContent)
    if (genDataPoints && genDataPoints > analysisDataPoints * 1.5) {
      const msg = `数据点膨胀：视觉分析为 ${analysisDataPoints} 个，生成代码出现 ${genDataPoints} 个`
      if (!seen.has(msg)) {
        seen.add(msg)
        issues.push({
          severity: 'WARN',
          id: 'DO-NOT-INVENT-DATA',
          message: msg,
          file: 'package/index.vue',
        })
      }
    }
  }

  // ── 3.5 echarts 挂载点缺失（治本 · 2026-09-15 · 07e31fbb 实锤）──
  // script 写了 echarts.init(chartRef.value)，但 template 漏写 <div ref="chartRef"> 挂载点
  // → chartRef.value 恒 null → 图表永不渲染。这是「图表类型缺失」抓不到的假阳性：
  // series type:'pie' 确实在 script 里，但没有任何 DOM 挂载它。
  const mountMissing = detectEchartsMountPointMissing(files)
  if (mountMissing.length > 0) {
    for (const { path, refName } of mountMissing) {
      const msg = `echarts 挂载点缺失：${path} 的 script 调用了 echarts.init(${refName}.value)，但 template 中没有 <div ref="${refName}"> 挂载点 —— 图表永远无法渲染`
      if (!seen.has(msg)) {
        seen.add(msg)
        issues.push({
          severity: 'BLOCK',
          id: 'DO-NOT-INVENT-CHART-MOUNT-MISSING',
          message: msg,
          file: path,
        })
      }
    }
  }

  const blockCount = issues.filter((i) => i.severity === 'BLOCK').length
  return {
    pass: blockCount === 0,
    blockCount,
    issues,
    _analyzed: true,
  }
}

/**
 * 从 doNotInvent 约束文本中提取「X→Y」禁止替换对（模块顶层预编译）。
 *
 * 否定前缀覆盖：不要 / 禁止 / 严禁 / 切勿 / 切忌 / 避免 / 不能 / 不应 / 不得 / 勿 / 别 / 请勿 / 请不要
 * 介词覆盖：将 / 把 / 误将 / 错将
 * 连接词覆盖：→ / 误写成 / 错写成 / 写成 / 改为 / 写为 / 误写为 / 错写为 / 误为 / 错为 / 替换为 / 替换成
 *
 * 注意：必须显式消费否定前缀和介词，否则首个捕获组会贪婪吞掉前缀
 * （如把「不要将一氧化碳写成二氧化碳」误解析为 from='不要将一氧化碳'）。
 */
const FORBIDDEN_PAIR_RE =
  /(?:不要|禁止|严禁|切勿|切忌|避免|不能|不应|不得|勿|别|请(?:勿|不要)?)?(?:误将|错将|将|把)?\s*([\u4e00-\u9fffA-Za-z0-9_]+?)\s*(?:→|误写成|错写成|写成|误改为|错改为|改为|误写为|错写为|写为|误为|错为|替换[为成]?)\s*([\u4e00-\u9fffA-Za-z0-9_]+)/

export function extractForbiddenPairs(doNotInvent = []) {
  const pairs = []
  for (const rule of doNotInvent) {
    if (typeof rule !== 'string') continue
    const m = rule.match(FORBIDDEN_PAIR_RE)
    if (m && m[1] && m[2] && m[1] !== m[2]) pairs.push({ from: m[1], to: m[2] })
  }
  return pairs
}

/**
 * 提取 vueContent 中 keyword 出现位置的前后上下文片段（单行）。
 * 找不到时返回 undefined。
 */
export function extractSnippet(vueContent, keyword) {
  if (!vueContent || !keyword) return undefined
  const idx = vueContent.indexOf(keyword)
  if (idx === -1) return undefined
  // 向前找到最近行首，向后找到行尾，截取一行
  const lineStart = vueContent.lastIndexOf('\n', idx) + 1
  const lineEnd = vueContent.indexOf('\n', idx + keyword.length)
  const line = vueContent.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim()
  return line.length > 200 ? line.slice(0, 200) + '…' : line
}

/** 提取 template 纯文本（去标签、去插值表达式） */
export function extractTemplateText(vueContent) {
  // 🛡️ 共享边界法（lazy </template> 会被具名插槽提前截断——0ca84358 家族缺陷）
  const tpl = extractSfcTemplate(vueContent)
  const body = tpl ?? vueContent
  return body.replace(/<[^>]+>/g, ' ').replace(/{{[^}]+}}/g, ' ')
}

/**
 * 统计 vueContent 中所有 ECharts data 数组的最大元素数量。
 * 用于检测数据点膨胀（视觉分析说 N 个点，生成代码出现 1.5x 个点）。
 * 
 * 使用括号平衡扫描：data: [1, 2, 3] 或 data: [{value: 1}, {value: 2}]
 * 只统计顶层数组元素（arrayDepth === 1 且不计算嵌套对象的属性）。
 */
export function countDataPoints(vueContent) {
  const re = /data\s*:\s*\[/g
  let m
  let max = 0
  while ((m = re.exec(vueContent)) !== null) {
    const start = m.index + m[0].length - 1
    let arrDepth = 1
    let count = 0
    let inString = false
    let stringChar = null
    
    for (let j = start + 1; j < vueContent.length; j++) {
      const ch = vueContent[j]
      
      // 处理字符串（跳过字符串内的括号）
      if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true
        stringChar = ch
      } else if (inString && ch === stringChar && vueContent[j - 1] !== '\\') {
        inString = false
        stringChar = null
      } else if (!inString) {
        if (ch === '[') {
          arrDepth++
        } else if (ch === ']') {
          if (arrDepth === 1) break
          arrDepth--
        } else if (ch === ',' && arrDepth === 1) {
          count++
        }
      }
    }
    
    if (count > 0 || arrDepth === 1) {
      const total = count + 1
      if (total > max) max = total
    }
  }
  return max === 0 ? null : max
}

/**
 * 把 vision 的图表 type 归一化为 echarts 语义的 category。
 *
 * vision 会输出 pie/doughnut/donut/bar/line/area/multiple 等；echarts 里 doughnut=pie 的子类，
 * area 本质是 line+areaStyle。归一化后用于「图表类型缺失」检查：
 * - pie / doughnut / donut → 'pie'
 * - bar / column → 'bar'
 * - line / area → 'line'
 * - 其余无法归一化的（multiple/空/未知）→ null（跳过检查，避免误伤）
 */
export function normalizeChartType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (!t) return null
  if (/pie|doughnut|donut|ring|环形|饼图/.test(t)) return 'pie'
  if (/bar|column|柱状|柱形/.test(t)) return 'bar'
  if (/line|area|curve|折线|曲线|面积/.test(t)) return 'line'
  if (/radar|雷达/.test(t)) return 'radar'
  if (/gauge|仪表/.test(t)) return 'gauge'
  if (/scatter|散点/.test(t)) return 'scatter'
  return null
}

/**
 * 收集产物代码中所有 echarts series 的 type 归一化集合。
 *
 * 扫描全产物（含子组件），提取 `type: 'pie'` / `type: "bar"` 等 series 声明，
 * 归一化后返回 Set。用于「图表类型缺失」检查——vision 有某类型、产物无该类型 → BLOCK。
 *
 * 注意：series 数组内每个对象都可能有 type 字段；也兼容旧式单 series 直写 type。
 */
export function collectChartSeriesTypes(vueContent) {
  const types = new Set()
  if (!vueContent || typeof vueContent !== 'string') return types
  // 匹配 series 对象内的 type: 'xxx'（含双引号/单引号）
  const typeRe = /type\s*:\s*['"]([a-zA-Z]+)['"]/g
  let m
  while ((m = typeRe.exec(vueContent)) !== null) {
    const norm = normalizeChartType(m[1])
    if (norm) types.add(norm)
  }
  return types
}

/**
 * 检测「echarts.init 存在但 template 无对应 ref 挂载点」的假阳性图表。
 *
 * 🛡️ 治本（2026-09-15 · mc-max-1789476464544-07e31fbb 实锤）：
 * LLM 在 script 里写了完整 echarts 代码（`const chartRef = ref(null)` +
 * `echarts.init(chartRef.value)`），但 template 里漏写 `<div ref="chartRef">` 挂载点
 * → chartRef.value 恒为 null → 图表永不渲染。这种「script 有 echarts、template 无 DOM」
 * 无法被「图表类型缺失」检查抓住（series type:'pie' 确实在 script 里）。
 *
 * 判据（精确、零误伤）：
 * 1. 逐 .vue 文件独立检查（不跨文件），避免误判子组件；
 * 2. 提取 script 里 `echarts.init(X.value)` / `echarts.init(X)` 的 ref 名 X；
 * 3. 若 X 是简单标识符（排除 this.$refs / document.getElementById 等），
 *    且该文件 template 里没有 `ref="X"` → 挂载点缺失。
 *
 * @param {Record<string,string>} files 文件名→内容
 * @returns {Array<{ path: string, refName: string }>}
 */
export function detectEchartsMountPointMissing(files) {
  const missing = []
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue
    if (!/echarts\.init\(/.test(content)) continue

    const template = extractSfcTemplate(content)
    if (!template) continue

    // 提取 echarts.init(X) / echarts.init(X.value) 的 ref 名（只认简单标识符）
    const initRe = /echarts\.init\(\s*([A-Za-z_$][\w$]*)(?:\.value)?\s*\)/g
    const refNames = new Set()
    let m
    while ((m = initRe.exec(content)) !== null) {
      refNames.add(m[1])
    }
    if (refNames.size === 0) continue // 提取不到 ref 名（this.$refs / getElementById 等）→ 跳过

    for (const refName of refNames) {
      const refAttr = new RegExp(`ref\\s*=\\s*["']${refName}["']`)
      if (!refAttr.test(template)) {
        missing.push({ path, refName })
      }
    }
  }
  return missing
}

/**
 * 统计 echarts option 中最大的「顶层 series 对象」数量。
 *
 * 注意：真实 echarts 代码中每个 series 对象内部都嵌套 data: [...] / areaStyle / markLine
 * 等数组与对象，用简单的非贪婪正则 [..] 会提前在第一个内嵌数组处收尾、少算 series 数，
 * 导致「单系列被扩写成多系列」的臆造信号漏报。此处改用括号平衡扫描，只统计 series 数组
 * 顶层（arrayDepth===1 且 objDepth===0）的 { 对象，正确识别多系列折线/柱形。
 */
export function countChartSeries(vueContent) {
  const re = /series\s*:\s*\[/g
  let m
  let max = 0
  while ((m = re.exec(vueContent)) !== null) {
    const start = m.index + m[0].length - 1 // 定位 series 数组的 '['
    let arrDepth = 1 // 我们已在 series 数组内
    let objDepth = 0
    let count = 0
    for (let j = start + 1; j < vueContent.length; j++) {
      const ch = vueContent[j]
      if (ch === '[') arrDepth++
      else if (ch === ']') {
        if (arrDepth === 1) break // 关闭 series 数组，停止扫描
        arrDepth--
      } else if (ch === '{') {
        if (arrDepth === 1 && objDepth === 0) count++ // 顶层 series 对象
        objDepth++
      } else if (ch === '}') {
        if (objDepth > 0) objDepth--
      }
    }
    if (count > max) max = count
  }
  return max === 0 ? null : max
}
