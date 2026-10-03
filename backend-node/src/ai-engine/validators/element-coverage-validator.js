/**
 * ElementCoverageValidator — 文档页面元素覆盖率校验器（L0-B 扩展）
 * 职责：对照 doc-analysis.uiElements 检查生成代码的元素覆盖情况
 * 规则：
 *  - 普通元素：元素名 / 控件类型特征 / 数据字段，三通道识别
 *  - 控件类型通道：按类型分组做实例计数（防止 1 个 stat-card 让 N 个数字卡片"假覆盖"）
 *  - 条件元素（conditional）：未静态出现时，必须存在 v-if 条件逻辑（不误报）
 *  - 缺失元素 → 输出缺失清单（含条件逻辑提示），供 L2 精准路由修补
 * 设计要点：确定性校验（零 LLM），证据化输出
 * v2 修复（实测 fail 教训）：控件特征匹配必须实例计数，否则同类型元素互相"借证"
 */
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'element-coverage-validator' })

/** 控件类型 → 代码特征（组件库标签/结构线索，通用词表非业务词） */
const CONTROL_PATTERNS = {
  '数字卡片': [/stat/i, /metric/i, /number-card/i, /count-card/i],
  '统计卡': [/stat/i, /metric/i],
  '指标卡': [/metric/i, /indicator/i, /stat/i],
  '表格': [/<a-table/i, /<el-table/i, /<table/i, /columns/i, /dataSource/i],
  '列表': [/list/i, /v-for/i],
  '折叠面板': [/collapse/i, /accordion/i, /panel/i, /expand/i],
  '折叠面板组': [/collapse/i, /accordion/i, /panel/i, /expand/i],
  '手风琴': [/collapse/i, /accordion/i],
  '状态标签': [/tag/i, /badge/i, /label/i, /status/i],
  '标签': [/tag/i, /badge/i, /label/i],
  '图表': [/chart/i, /echarts/i, /v-chart/i, /setOption/i],
  '柱状图': [/bar/i, /echarts/i, /setOption/i],
  '折线图': [/line/i, /echarts/i, /setOption/i],
  '饼图': [/pie/i, /echarts/i, /setOption/i],
  '表单': [/form/i, /input/i, /select/i],
}

/** 归一化文本 */
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_（）()【】\[\]:：]/g, '')

/** 统计正则全局匹配次数 */
function countMatches(re, corpus) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  return (corpus.match(global) || []).length
}

// ══════════════════════════════════════════════════════════════
// 🛡️ P1-8（2026-10-01 · mc-max-1790830432735-07a812f7 实锤）：`@技术栈` 标记落地校验
//
// 背景：设计稿把节点命名为 `@antd/table` / `@antd/button`（契约 = 该区域由对应库组件渲染，
// `figma-connector#extractTechStackHints` 已把它解析成 {library, component}）。但**此前没有任何
// 门禁核对产物是否真的用了该组件** ⇒ 07a812f7 里「保存按钮整块消失、表格被手写 div 取代」
// 全程零报警、任务判「成功」。
//
// 判定依据 = **真值节点名**（不是文档分析的 control 词表）：`@<lib>/<component>` 是 Figma 侧的
// 确定性事实，比「Vision 猜的 role」可靠。库 → 标签前缀用**确定性映射**，不枚举组件
// （新增组件自动覆盖），与 prompt 里「已全局注册 ant-design-vue，直接写 `<a-xxx>`」的契约同源。
// ══════════════════════════════════════════════════════════════

/** 组件库 → 标签前缀（kebab 与 Pascal 两种写法都会接受） */
const TECHSTACK_LIB_TAG_PREFIX = {
  antd: 'a', ant: 'a', 'ant-design-vue': 'a', 'ant-design': 'a', arco: 'a', 'arco-design': 'a',
  element: 'el', 'element-plus': 'el', el: 'el',
  vant: 'van', nutui: 'nut', nut: 'nut', naive: 'n', 'naive-ui': 'n',
}

/** 图表库（canvas 运行时渲染，落地判据用实例 + setOption，而非标签） */
const CHART_LIB_RX = /^(echarts?|chartjs|charts?|plotly|g2|g2plot|antv|d3|highcharts|bizcharts|vchart)$/

/** `@lib/component` 标记提取（与 figma-connector#extractTechStackHints 同源正则） */
const TECHSTACK_MARKER_RX = /@([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/

const toPascal = (s) => String(s || '').split(/[-_]+/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join('')

/**
 * 从 Figma 真值节点树收集 `@技术栈` 标记节点（**不去重**，每个标记实例一条）。
 * 🛡️ #78 S2（2026-10-01）：techstack-section-contract 需要 per-nodeId 粒度
 *   （同一 `@antd/table` 可能多实例、且要按 nodeId 做 section 锚定），故抽出非去重版；
 *   `collectTechStackMarkers`（P1-8 门禁去重口径）在本函数之上做去重 —— 单一事实源。
 * @param {object} figmaNodeData 原始 Figma 节点树（或 {document} 包装）
 * @returns {Array<{nodeId:string|null,nodeName:string,library:string,component:string,raw:string}>}
 */
export function collectTechStackMarkerNodes(figmaNodeData) {
  const out = []
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    const name = String(node.name || '')
    const m = name.match(TECHSTACK_MARKER_RX)
    if (m) {
      out.push({
        nodeId: node.id || null,
        nodeName: name,
        library: m[1].toLowerCase(),
        component: m[2].toLowerCase(),
        raw: m[0],
      })
    }
    for (const c of node.children || []) walk(c, depth + 1)
  }
  walk(figmaNodeData?.document || figmaNodeData)
  return out
}

/**
 * 从 Figma 真值节点树收集 `@技术栈` 标记（去重按 lib/component，同名多实例只记一次）。
 * @param {object} figmaNodeData 原始 Figma 节点树（或 {document} 包装）
 * @returns {Array<{nodeId:string|null,nodeName:string,library:string,component:string,raw:string}>}
 */
export function collectTechStackMarkers(figmaNodeData) {
  const out = []
  const seen = new Set()
  for (const marker of collectTechStackMarkerNodes(figmaNodeData)) {
    const key = `${marker.library}/${marker.component}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(marker)
    }
  }
  return out
}

/**
 * 🛡️ #78 S2：单个标记 → 产物应使用的组件标签（如 `a-table`）。
 * @returns {string|null} null = 图表库（canvas 渲染无标签）或未知库（不判定，fail-open）
 */
export function techStackTagHint(marker) {
  const library = String(marker?.library || '').toLowerCase()
  const component = String(marker?.component || '').toLowerCase()
  if (!library || !component) return null
  if (CHART_LIB_RX.test(library)) return null
  const prefix = TECHSTACK_LIB_TAG_PREFIX[library]
  if (!prefix) return null
  return `${prefix}-${component}`
}

/**
 * 单个标记 → 产物中必须出现的标签/调用正则。
 * 🛡️ 2026-10-03 起导出为**判据单一来源**：section-content-guard#checkTechStackContractTags
 * （per-section 契约-产物一致性检测）复用本函数，严禁另写第二份 kebab/Pascal 正则副本。
 * @returns {RegExp[]|null} null = 未知库（**不判定**，fail-open，避免假阳性阻断）
 */
export function techStackRequiredPatterns(marker) {
  const library = String(marker?.library || '').toLowerCase()
  const component = String(marker?.component || '').toLowerCase()
  if (!library || !component) return null
  if (CHART_LIB_RX.test(library)) return [/\becharts\b/i, /setOption\s*\(/]
  const prefix = TECHSTACK_LIB_TAG_PREFIX[library]
  if (!prefix) return null
  const pascal = toPascal(component)
  // 三种常见写法：kebab `<a-table` / 带前缀 Pascal `<ATable` / 裸 Pascal `<Table`
  // ⚠️ 刻意不加 `i` 标志：`<table`（原生标签）不算「用了 antd table」，否则该门禁形同虚设。
  const patterns = [
    new RegExp(`<${prefix}-${component}\\b`),
    new RegExp(`<${prefix.toUpperCase()}${pascal}\\b`),
    new RegExp(`<${pascal}\\b`),
  ]
  return patterns
}

/**
 * `@技术栈` 标记的落地校验（确定性、零 LLM）。
 * @param {object} params
 * @param {Array} params.markers collectTechStackMarkers 的返回值
 * @param {Record<string,string>} params.files 生成文件集
 * @returns {{total:number, covered:number, missing:Array, coveredDetails:Array}}
 */
export function validateTechStack({ markers = [], files = {} } = {}) {
  const corpus = Object.entries(files || {})
    .filter(([p]) => /\.(vue|js|ts)$/.test(p))
    .map(([, c]) => c)
    .join('\n')
  const missing = []
  const coveredDetails = []
  for (const marker of markers || []) {
    const patterns = techStackRequiredPatterns(marker)
    if (!patterns) {
      // 未知库：不判定（fail-open），但要留下痕迹，便于后续补映射
      coveredDetails.push({ ...marker, via: 'unknown-library(skip)' })
      continue
    }
    const hit = patterns.find((re) => re.test(corpus))
    if (hit) coveredDetails.push({ ...marker, via: String(hit) })
    else missing.push({ ...marker, expected: patterns.map((re) => String(re)) })
  }
  return { total: (markers || []).length, covered: coveredDetails.length, missing, coveredDetails }
}

export class ElementCoverageValidator {
  /**
   * @param {object} params
   * @param {Array} params.uiElements - doc-analysis.uiElements
   * @param {Record<string, string>} params.files - 生成文件集 {path: content}
   * @param {Array} [params.techStackMarkers] - 🛡️ P1-8：Figma `@技术栈` 标记（collectTechStackMarkers 产物）
   */
  validate({ uiElements, files, techStackMarkers } = {}) {
    const markers = Array.isArray(techStackMarkers) ? techStackMarkers : []
    if ((!uiElements || !uiElements.length) && markers.length === 0) {
      return { skipped: true, reason: '无文档元素定义', total: 0, covered: 0, coverageRate: 1, missing: [], conditionalMissing: [] }
    }

    // 汇总全部生成代码为语料
    const corpus = Object.entries(files || {})
      .filter(([p]) => /\.(vue|js|ts)$/.test(p))
      .map(([, c]) => c)
      .join('\n')
    const normCorpus = norm(corpus)
    // 🛡️ P1-8：Figma 路径可能没有 docAnalysis.uiElements（只有 `@技术栈` 标记）⇒ 文档元素按空集处理
    const docElements = Array.isArray(uiElements) ? uiElements : []

    // ── 第一遍：按控件类型分组，计算各类型在 corpus 中的实例数 ──
    const typeGroups = new Map() // control → elements[]
    for (const el of docElements) {
      const control = el.control || el.controlType || ''
      if (!typeGroups.has(control)) typeGroups.set(control, [])
      typeGroups.get(control).push(el)
    }
    // 每种类型的实例额度 = corpus 中该类型特征的最大匹配数
    const typeQuota = new Map() // control → 剩余额度
    for (const [control, elements] of typeGroups) {
      const patterns = CONTROL_PATTERNS[control] || []
      let maxCount = 0
      for (const re of patterns) {
        maxCount = Math.max(maxCount, countMatches(re, corpus))
      }
      typeQuota.set(control, Math.min(maxCount, elements.length))
    }

    // ── 第二遍：三通道识别 ──
    const missing = []
    const conditionalMissing = []
    const coveredDetails = []
    let covered = 0

    for (const el of docElements) {
      const name = el.name || el.paramName || ''
      const control = el.control || el.controlType || ''
      const field = (el.field || '').split('（')[0].replace(/`/g, '')

      // ① 元素名直接出现（最强证据）
      if (name && normCorpus.includes(norm(name))) {
        covered++
        coveredDetails.push({ element: name, via: `name:"${name}"`, conditional: !!el.conditional })
        continue
      }

      // ② 数据绑定字段出现（间接覆盖）
      if (field && normCorpus.includes(norm(field))) {
        covered++
        coveredDetails.push({ element: name, via: `field:${field}`, conditional: !!el.conditional })
        continue
      }

      // ③ 控件类型通道（实例计数 — 有额度才算覆盖，防同类型借证）
      const quota = typeQuota.get(control) || 0
      if (quota > 0) {
        typeQuota.set(control, quota - 1)
        covered++
        coveredDetails.push({ element: name, via: `control:${control}(实例)`, conditional: !!el.conditional })
        continue
      }

      // ④ 条件元素：检查 v-if 条件逻辑
      if (el.conditional) {
        if (/v-if\s*=/.test(corpus)) {
          covered++
          coveredDetails.push({ element: name, via: 'conditional:v-if', conditional: true })
        } else {
          conditionalMissing.push({
            element: name,
            control,
            condition: el.description,
            hint: `条件元素「${name}」未找到 v-if 条件渲染逻辑（文档条件: ${el.description || '未注明'}）`,
          })
        }
        continue
      }

      // 全部通道未命中 → 缺失
      missing.push({
        element: name,
        control,
        field,
        hint: `文档元素「${name}」（${control || '未知控件'}）在生成代码中未找到对应实现`,
      })
    }

    // ── 第三遍：🛡️ P1-8 `@技术栈` 标记落地校验（Figma 真值驱动，与文档元素通道正交）──
    const techStack = markers.length > 0
      ? validateTechStack({ markers, files })
      : { total: 0, covered: 0, missing: [], coveredDetails: [] }
    for (const m of techStack.missing) {
      missing.push({
        element: m.raw,
        control: '技术栈',
        field: '',
        techStack: m,
        hint: `设计稿节点「${m.nodeName}」标注为 @${m.library}/${m.component}（契约：由该库组件渲染），`
          + `但生成代码中未见 ${m.expected.join(' 或 ')}`,
      })
    }

    const total = docElements.length
    const coverageRate = total ? covered / total : 1
    const pass = missing.length === 0 && conditionalMissing.length === 0

    logger.info('📐 元素覆盖率校验', {
      total, covered, coverageRate: (coverageRate * 100).toFixed(0) + '%',
      missing: missing.length, conditionalMissing: conditionalMissing.length,
      techStack: `${techStack.covered}/${techStack.total}`,
      pass,
    })

    return {
      skipped: false,
      pass,
      total,
      covered,
      coverageRate,
      coveredDetails,
      missing,
      conditionalMissing,
      // 🛡️ P1-8：技术栈切片单列，避免「文档元素覆盖率」被技术栈缺失污染（口径分账）
      techStack,
      techStackMissing: techStack.missing,
      repairTargets: [...missing, ...conditionalMissing].map((m) => m.element),
      summary: missing.length || conditionalMissing.length
        ? `文档 ${total} 个元素中 ${missing.length} 个缺失、${conditionalMissing.length} 个条件逻辑缺失`
          + (techStack.missing.length ? `；@技术栈 标记未落地 ${techStack.missing.length} 个` : '')
        : `文档 ${total} 个元素全部覆盖`
          + (techStack.total ? `；@技术栈 ${techStack.covered}/${techStack.total} 已落地` : ''),
    }
  }
}

export default ElementCoverageValidator
