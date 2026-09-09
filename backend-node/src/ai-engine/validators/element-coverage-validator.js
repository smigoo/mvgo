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

export class ElementCoverageValidator {
  /**
   * @param {object} params
   * @param {Array} params.uiElements - doc-analysis.uiElements
   * @param {Record<string, string>} params.files - 生成文件集 {path: content}
   */
  validate({ uiElements, files }) {
    if (!uiElements || !uiElements.length) {
      return { skipped: true, reason: '无文档元素定义', total: 0, covered: 0, coverageRate: 1, missing: [], conditionalMissing: [] }
    }

    // 汇总全部生成代码为语料
    const corpus = Object.entries(files || {})
      .filter(([p]) => /\.(vue|js|ts)$/.test(p))
      .map(([, c]) => c)
      .join('\n')
    const normCorpus = norm(corpus)

    // ── 第一遍：按控件类型分组，计算各类型在 corpus 中的实例数 ──
    const typeGroups = new Map() // control → elements[]
    for (const el of uiElements) {
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

    for (const el of uiElements) {
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

    const total = uiElements.length
    const coverageRate = total ? covered / total : 1
    const pass = missing.length === 0 && conditionalMissing.length === 0

    logger.info('📐 元素覆盖率校验', {
      total, covered, coverageRate: (coverageRate * 100).toFixed(0) + '%',
      missing: missing.length, conditionalMissing: conditionalMissing.length, pass,
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
      repairTargets: [...missing, ...conditionalMissing].map((m) => m.element),
      summary: missing.length || conditionalMissing.length
        ? `文档 ${total} 个元素中 ${missing.length} 个缺失、${conditionalMissing.length} 个条件逻辑缺失`
        : `文档 ${total} 个元素全部覆盖`,
    }
  }
}

export default ElementCoverageValidator
