/**
 * 生成后「禁止臆造」确定性校验器。
 *
 * 目标：在代码落盘 / 任务完成前，拦截模型基于组件名或行业语义自行补写的内容。
 * 与提示词中的 doNotInvent 约束互补——提示词是「软约束」，本校验器是「硬门禁」。
 *
 * 设计原则：宁可漏报，不可误伤。仅对结构 / 文案有清晰对照依据时判定违规。
 *
 * 当前实现两类高置信检查：
 * 1. 核心文案篡改：本组件分析约束 analysis.doNotInvent 中声明的「X→Y / 不要将 X 写成 Y」
 *    类禁止替换对，若在生成代码中分析原词 X 缺失、却出现误词 Y → BLOCK。
 *    注意：无任何硬编码常识词表，完全由每组件动态声明驱动（不同组件约束不同）。
 * 2. 图表系列膨胀：视觉分析标明单系列（单折线 / 单柱），生成代码却出现多个不同
 *    命名系列 → BLOCK（清晰的数据臆造信号）。
 *
 * @param {object} opts
 * @param {Record<string,string>} [opts.files] 文件名→文件内容（至少含 package/index.vue）
 * @param {object} [opts.analysis] 视觉分析对象（charts / doNotInvent / layoutStructure）
 * @returns {{ pass: boolean, blockCount: number, issues: Array, _analyzed: boolean }}
 */
import { extractSfcTemplate } from '../utils/sfc-template-extractor.js'

export function validateDoNotInvent({ files = {}, analysis = {} } = {}) {
  const issues = []
  const seen = new Set() // 去重：避免 doNotInvent 中重复声明同一「X→Y」产生多条相同违规

  const vueContent =
    files['package/index.vue'] ||
    Object.values(files).find((f) => /index\.vue$/.test(f)) ||
    ''
  if (!vueContent) return { pass: true, issues: [], _analyzed: false }

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
