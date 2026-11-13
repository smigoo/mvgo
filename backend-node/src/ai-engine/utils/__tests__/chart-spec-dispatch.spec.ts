/**
 * 🛡️ 2026-11-13 · 图表规格单点下发（mc-max-1794542621368-771da11e 白色图例实锤）
 *
 * 病灶链：R1-geo 路径（chart-section.js chartSectionToInternalSub）产出 chart-component
 * 时漏了 chartSpec（planner R1 有、R1-geo 没有）⇒ 派工清单渲染「⚠️ 图表规格缺失（无
 * vision 真值可下发），按名称语义实现完整图表」⇒ 授权臆造 ⇒ LLM 深色大屏先验全量释放
 * （霓虹 series 色 #00e0ff/#ffaa00 + 白色图例/轴文字 rgba(255,255,255,*)），浅色主题产物
 * 视觉错乱。
 *
 * 治本三件套（本 spec 覆盖）：
 * 1. matchChartSpecForSub：R1-geo 规格匹配（section id 直等 + 几何包含桥），
 *    颗粒度契约 = 只透传 vision L1/L2 字段 + Figma 容器尺寸真值 chartBox；
 * 2. chartSectionToInternalSub(cs, spec) 规格透传；
 * 3. prompt 模板零硬编码（interaction-guide.md tooltip 模板无字面色值；
 *    figma.md「不能是 ECharts 默认值」假指令废弃；「按名称语义实现」清零）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  matchChartSpecForSub,
  chartSectionToInternalSub,
} from '../chart-section.js'

const ROOT = join(__dirname, '../../../..')

function read(p) {
  return readFileSync(join(ROOT, p), 'utf8')
}

describe('matchChartSpecForSub（R1-geo 规格匹配）', () => {
  const CHARTS = [
    {
      section: '2:7625',
      type: 'bar',
      series: ['北京方向', '上海方向'],
      seriesColors: ['#1588f8', '#18c02e'],
      legend: ['北京方向', '上海方向'],
      legendPosition: 'top-right',
      axes: 'X轴为小时',
      tooltip: '显示时间点、方向、流量',
    },
    {
      section: '2:3565',
      type: 'line',
      series: ['实际流量', '预测流量'],
      seriesColors: ['#18c02e', '#1588f8'],
    },
  ]

  it('判据①：section id 直等（chartsTruth 形态）', () => {
    const cs = { id: 'chart-truth-0', sourceNodeIds: ['2:7625'] }
    const spec = matchChartSpecForSub(cs, CHARTS)
    expect(spec).not.toBeNull()
    expect(spec.type).toBe('bar')
    expect(spec.seriesColors).toEqual(['#1588f8', '#18c02e'])
  })

  it('判据②：几何包含桥（@echarts 节点中心落在 c.section 节点盒内）', () => {
    // @echarts 节点 id（1:abc）与 charts[].section（2:3565）不同 id，靠盒包含衔接
    const cs = { id: 'chart-1:abc', sourceNodeIds: ['1:abc'] }
    const boxOf = (id) => (id === '2:3565' ? { x: 40, y: 760, width: 363, height: 140 } : null)
    const nodeById = new Map([['1:abc', { id: '1:abc', bbox: { x: 60, y: 800, width: 300, height: 80 } }]])
    const spec = matchChartSpecForSub(cs, CHARTS, boxOf, nodeById)
    expect(spec).not.toBeNull()
    expect(spec.type).toBe('line')
    expect(spec.series).toEqual(['实际流量', '预测流量'])
  })

  it('chartBox 容器尺寸真值注入（Figma 节点树取，非 vision 估值）', () => {
    const cs = { id: 'chart-truth-0', sourceNodeIds: ['2:7625'] }
    const boxOf = (id) => (id === '2:7625' ? { x: 33, y: 287, width: 379.4, height: 130.6 } : null)
    const spec = matchChartSpecForSub(cs, CHARTS, boxOf, new Map())
    expect(spec.chartBox).toEqual({ width: 379.4, height: 130.6 })
  })

  it('无命中返回 null（不产空规格）', () => {
    const cs = { id: 'chart-9:zzz', sourceNodeIds: ['9:zzz'] }
    expect(matchChartSpecForSub(cs, CHARTS, () => null, new Map())).toBeNull()
    expect(matchChartSpecForSub(cs, [], () => null, new Map())).toBeNull()
    expect(matchChartSpecForSub(cs, CHARTS)).toBeNull() // 无 boxOf 且无直等
  })

  it('tooltip 内容透传但样式字段不在规格白名单（悬停态用 ECharts 默认）', () => {
    const cs = { id: 'chart-truth-0', sourceNodeIds: ['2:7625'] }
    const spec = matchChartSpecForSub(cs, CHARTS)
    expect(spec.tooltip).toBe('显示时间点、方向、流量') // 内容描述透传
    expect(spec.backgroundColor).toBeUndefined()
    expect(spec.textStyle).toBeUndefined()
  })
})

describe('chartSectionToInternalSub（规格载荷透传）', () => {
  it('有 spec ⇒ chartSpec 键产出', () => {
    const spec = { type: 'line', series: ['a'], chartBox: { width: 363, height: 140 } }
    const sub = chartSectionToInternalSub({ id: 'c1', title: '折线图' }, spec)
    expect(sub.chartSpec).toEqual(spec)
    expect(sub.type).toBe('chart-component')
  })

  it('无 spec ⇒ 不产 chartSpec 键（与 planner R1 同形状）', () => {
    const sub = chartSectionToInternalSub({ id: 'c1', title: '折线图' })
    expect(sub).not.toHaveProperty('chartSpec')
  })
})

describe('prompt 模板零硬编码（图表/tooltip）', () => {
  it('interaction-guide.md：tooltip 模板无字面色值（历史黑底白字模板已删）', () => {
    const md = read('src/ai-engine/prompts/engineer/dynamic/interaction-guide.md')
    const sec = md.slice(md.indexOf('## 3. 图表 Tooltip 交互'), md.indexOf('## 4. 开关'))
    expect(sec).not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\.7\)/)
    expect(sec).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.2\)/)
    expect(sec).not.toMatch(/color:\s*'(#ffffff|rgba\(255)/)
    expect(sec).toMatch(/ECharts 默认样式|禁止硬编码任何字面色值/)
  })

  it('figma.md：「不能是 ECharts 默认值」假指令已废弃（悬停态默认样式合规）', () => {
    const md = read('references/prompts/figma.md')
    expect(md).not.toMatch(/不能是 ECharts 默认值/)
    expect(md).not.toMatch(/Tooltip 样式（必须提取 Figma 数据）/)
    expect(md).toMatch(/直接使用 ECharts 默认样式/)
  })

  it('microcode-engineer：「按名称语义实现」授权臆造句清零，兜底改为 charts[] 指针', () => {
    const src = read('src/ai-engine/roles/microcode-engineer.js')
    expect(src).not.toMatch(/按名称语义实现完整图表/)
    expect(src).toMatch(/charts\[\] JSON 中选择与本组件系列名一致的条目/)
    // 规格块增强：容器尺寸真值 + 主题文字槽红线 + 主题明度下发
    expect(src).toMatch(/chartBox.*Figma 节点真值/)
    expect(src).toMatch(/消费主题文字槽（Less 语义变量），禁止字面色值/)
    expect(src).toMatch(/本组件主题明度/)
    // tooltip 样式语义：默认即可
    expect(src).toMatch(/tooltip 样式用 ECharts 默认/)
  })

  it('chart-section.js：R1-geo 规格匹配已接线（两处调用均传 spec）', () => {
    const src = read('src/ai-engine/utils/chart-section.js')
    const calls = src.match(/chartSectionToInternalSub\(cs, matchChartSpecForSub\(/g) || []
    expect(calls.length).toBe(2) // 挂宿主 + hostedPlanSubs
  })
})
