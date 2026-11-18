/**
 * 🛡️ G1 图表承载唯一化 · T1 判据单测（2026-11-18）
 *
 * 守护四层豁免收紧判据：
 *   R4 轴刻度排除（chart-type-detection.js）
 *   R2 图层名标记（chart-type-detection.js）
 *   R3 几何标记（chart-type-detection.js）
 *   R1 产物自证矛盾（chart-missing-types.js，只有这里拿得到产物 content）
 *
 * 正反例口径见 docs/2026-11-18-图表承载链路三层静默治理方案.md §5.2。
 * 缺任一反例即为假绿：真文字承载图必须仍被豁免、正常图零 missing、边界 fail-open。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findMissingChartTypes } from '../chart-missing-types.js'
import { collectTextCarriedChartTypes } from '../chart-type-detection.js'
import { indexFigmaNodes } from '../section-tree.js'
import { validateDoNotInvent } from '../../validators/do-not-invent-validator.js'
import { injectEchartsFallback } from '../../roles/microcode/code-healer.js'

const SRC = join(__dirname, '../../..')

const texts = (chars: string[], prefix = 't') =>
  chars.map((c, i) => ({ id: `${prefix}-${i}`, type: 'TEXT', name: 'text', characters: c }))

const figma = (section: string, name: string, w: number, h: number, chars: string[]) => ({
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [
      {
        id: section,
        name,
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
        children: texts(chars),
      },
    ],
  },
})

const echartsBar = `<template><div ref="chartRef"></div></template>
<script>import * as echarts from 'echarts'; echarts.init(chartRef).setOption({ series: [{ type: 'bar', data: [1] }] })</script>`

const run = (section: string, name: string, w: number, h: number, chars: string[], files: Record<string, string> = {}) =>
  findMissingChartTypes({
    charts: [{ type: 'pie', section }],
    files: { 'package/index.vue': '<template><div/></template>', ...files },
    figmaNodeData: figma(section, name, w, h, chars),
  })

describe('G1/T1 四层豁免收紧 —— 正例（必须 missing，现行豁免不得遮住）', () => {
  it('R4 轴刻度：小几何 + 中性图层名 + 23 个纯数字刻度 ⇒ missing=pie，r4 有计数', () => {
    const ticks = Array.from({ length: 23 }, (_, i) => String(i * 25))
    const r = run('2:7898', 'card', 120, 60, ticks)
    expect(r.missing.map((m: any) => m.type)).toEqual(['pie'])
    expect(r.exemptBlocked.r4).toBeGreaterThanOrEqual(1)
  })

  it('R2 图层名：@echarts/line 已显式标注图表位 ⇒ missing=pie，r2 有计数', () => {
    const r = run('2:7898', '@echarts/line', 120, 60, ['600', '400', '200'])
    expect(r.missing.map((m: any) => m.type)).toEqual(['pie'])
    expect(r.exemptBlocked.r2).toBeGreaterThanOrEqual(1)
  })

  it('R2 图层名：cp-ring-gauge / 2charts 同样禁豁免', () => {
    for (const name of ['cp-ring-gauge', '2charts', 'slot-车型分布']) {
      const r = run('1:2446', name, 120, 60, ['33', '66'])
      expect(r.missing.map((m: any) => m.type)).toEqual(['pie'], `图层名 ${name}`)
    }
  })

  it('R1 产物自证：产物已在画 bar 但缺 pie ⇒ 文字承载解释不成立，r1 有计数', () => {
    // 用「1,234」这类真数据卡文本：R4 不拦，豁免本来成立，靠 R1 否决
    const r = run('2:3446', 'card', 120, 60, ['1,234'], {
      'package/components/Chart.vue': echartsBar,
    })
    expect(r.missing.map((m: any) => m.type)).toEqual(['pie'])
    expect(r.exemptBlocked.r1).toBeGreaterThanOrEqual(1)
  })

  it('R3 几何：387×142 + 11 TEXT 的大图位 ⇒ missing=pie，r3 有计数', () => {
    const r = run('2:3438', 'slot-车型分布', 387, 142, Array.from({ length: 11 }, (_, i) => `${i * 10}`))
    expect(r.missing.map((m: any) => m.type)).toEqual(['pie'])
    expect(r.exemptBlocked.r3).toBeGreaterThanOrEqual(1)
  })

  it('四层计数结构恒在（零命中也打 0）', () => {
    const r = findMissingChartTypes({ charts: [], files: {} })
    expect(r.exemptBlocked).toEqual({ r1: 0, r2: 0, r3: 0, r4: 0 })
  })
})

describe('G1/T1 反例（不得收紧成误伤）', () => {
  it('真文字承载卡：小几何 + card + 今日累计/1,234/次 + 产物无图 ⇒ 仍豁免', () => {
    const r = run('2:3559', 'card', 120, 60, ['今日累计', '1,234', '次'])
    expect(r.missing).toEqual([])
    expect(r.carriedByText.has('pie')).toBe(true)
  })

  it('正常图：产物有 pie series ⇒ 零 missing（四层均不拦截）', () => {
    const r = run('2:3446', 'card', 120, 60, ['33', '66'], {
      'package/components/Chart.vue': `<template><div ref="chartRef"></div></template>
<script>import * as echarts from 'echarts'; echarts.init(chartRef).setOption({ series: [{ type: 'pie', data: [1] }] })</script>`,
    })
    expect(r.missing).toEqual([])
  })

  it('无 figmaIndex / 空 charts / 无 .vue ⇒ fail-open 零崩溃', () => {
    expect(findMissingChartTypes({ charts: [{ type: 'pie', section: '2:1' }], files: {} }).missing.map((m: any) => m.type)).toEqual(['pie'])
    expect(findMissingChartTypes({ charts: [], files: {} }).missing).toEqual([])
    expect(findMissingChartTypes({}).missing).toEqual([])
  })

  it('底层纯函数：collectTextCarriedChartTypes 第三参数可收计数，不传时行为不变', () => {
    const idx = indexFigmaNodes(figma('1:2446', '@echarts/line', 100, 50, ['600']).document)
    const stats = { r1: 0, r2: 0, r3: 0, r4: 0 }
    expect(collectTextCarriedChartTypes([{ type: 'pie', section: '1:2446' }], idx, stats).size).toBe(0)
    expect(stats.r2).toBe(1)
    expect(collectTextCarriedChartTypes([{ type: 'pie', section: '1:2446' }], idx).size).toBe(0)
  })
})

describe('G1/T2 契约同源：四消费者同一输入必得同一 missing', () => {
  const charts = [
    { type: 'pie', section: '2:3446' },
    { type: 'bar', section: '2:3550' },
  ]
  const files = {
    'package/index.vue': '<template><div/></template>',
    'package/components/Pie.vue': '<template><div data-section-id="2:3446">x</div></template>',
    'package/components/Bar.vue': '<template><div data-section-id="2:3550">x</div></template>',
  }
  // pie 段：R2 图层名禁豁免（纯刻度文本）；bar 段：R4 轴刻度排除
  const figmaDoc = {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: '2:3446', name: '@echarts/pie', type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          children: texts(['600', '400']),
        },
        {
          id: '2:3550', name: 'card', type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          children: texts(['20', '10', '0']),
        },
      ],
    },
  }

  it('findMissingChartTypes（单一来源）与门禁 2.5 的缺失集合逐字相等', () => {
    const direct = findMissingChartTypes({ charts, files, figmaNodeData: figmaDoc })
    expect(direct.missing.map((m: any) => `${m.chart.section}||${m.type}`)).toEqual([
      '2:3446||pie',
      '2:3550||bar',
    ])
    const v = validateDoNotInvent({ files, analysis: { charts }, figmaNodeData: figmaDoc })
    const from25 = v.issues
      .filter((i: any) => i.id === 'DO-NOT-INVENT-CHART-MISSING')
      .map((i: any) => `${i._sectionId}||${i.message.match(/识别到「(\w+)」/)?.[1]}`)
    expect(from25.sort()).toEqual(['2:3446||pie', '2:3550||bar'].sort())
    expect(v.warnChartMissing).toBe(2)
  })

  it('2.5/2.7 互斥：重叠段只上报一条，2.7 仍计数', () => {
    const v = validateDoNotInvent({ files, analysis: { charts }, figmaNodeData: figmaDoc })
    expect(v.warnChartSectionMissing).toBe(2)
    expect(v.issues.filter((i: any) => i.id === 'DO-NOT-INVENT-CHART-SECTION-MISSING')).toHaveLength(0)
  })

  it('N2-mc / N2-vue3 只消费同一 missing，不自带判据、不改 code-healer 早退', () => {
    const MC = readFileSync(join(SRC, 'ai-engine/roles/microcode-engineer.js'), 'utf-8')
    const VUE3 = readFileSync(join(SRC, 'ai-engine/roles/vue3-engineer.js'), 'utf-8')
    const HEALER = readFileSync(join(SRC, 'ai-engine/roles/microcode/code-healer.js'), 'utf-8')
    for (const [, src] of [['mc', MC], ['vue3', VUE3]] as const) {
      expect(src).toMatch(/const \{ missing: missingCharts, exemptBlocked \} = findMissingChartTypes\(\{/)
      expect(src).not.toMatch(/collectTextCarriedChartTypes\(/) // 不得自带豁免判据
    }
    // G1 边界：注入层早退保持原样（G1′ 才动）
    expect(HEALER).toMatch(/content\.includes\('echarts\.init\('\)/)
  })

  it('N2 计数行：mc/vue3 双端同源——判缺计数 + 早退计数 + 0 也打的日志行', () => {
    const MC = readFileSync(join(SRC, 'ai-engine/roles/microcode-engineer.js'), 'utf-8')
    const VUE3 = readFileSync(join(SRC, 'ai-engine/roles/vue3-engineer.js'), 'utf-8')
    for (const [name, src] of [['mc', MC], ['vue3', VUE3]] as const) {
      expect(src).toMatch(/let n2SkippedByExistingChart = 0;/) // name
      expect(src).toMatch(/n2SkippedByExistingChart \+= 1;/) // name
      expect(src).toMatch(/🛡️ N2 图表兜底·已评估/) // name：日志行 0 也打
      // 归因沿用注入器同一字面量（不另立判据，避免假绿）
      expect(src).toMatch(/healedForN2\.includes\('echarts\.init\('\)/) // name
    }
  })

  it('N2 注入器早退阳性对照：已有 echarts 原样返回；无 echarts 真注入', () => {
    // 🔴 P0-a（2026-11-18）：注入落点已锚点化——无 -root 类时必须靠模板内 data-section-id 容器
    //    定位；无任何锚点则**不注入**（宁缺勿越界，杜绝 canvas 落 </template>/宿主外壳之外）。
    //    故夹具须带真实锚点（`data-section-id` 与 code-generator.js:1113 / 门禁 2.7 同源）。
    const withChart = `<template><div class="root" data-section-id="1:1"><div class="c"/></div></template>
<script setup>import * as echarts from 'echarts'; echarts.init(document.querySelector('.c'))</script>`
    const noChart = `<template><div class="root" data-section-id="1:1"><div class="c"/></div></template><script setup></script>`
    // 早退：不计入注入（patched===healedForN2 触发早退计数的前提）
    expect(injectEchartsFallback(withChart, { chartType: 'bar', chartSeries: 'x' })).toBe(withChart)
    // 对照：无 echarts 时确实注入（早退计数不会把真注入误记为跳过）
    const injected = injectEchartsFallback(noChart, { chartType: 'bar', chartSeries: 'x' })
    expect(injected).toContain('echarts.init(')
    expect(injected).not.toBe(noChart)
    // 落点回归锚：必须注入 data-section-id 容器内，不得越出模板顶层
    expect(injected).toMatch(/<div class="root" data-section-id="1:1"[^>]*>\s*<div ref="chartRef"/)
  })
})
