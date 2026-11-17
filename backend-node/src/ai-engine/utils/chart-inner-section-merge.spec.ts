/**
 * 图表内部件段归并（2026-11-17 · 环境监测 ef014f7d / 4cac37a8 实锤）
 *
 * 真机段计划（.checkpoint/analysis.json subComponentPlan.effectiveSections）：
 *   89:42 container(sub-t, 32) / 2:7898 折线图(113) / chart-legend 图例(src:[], 14) / mark-line 预警线(src:[], 22)
 * 产物 flex：0.348 / 0.261 / 0.152 / 0.239（Σ=1）⇒ chart 段 87px（真值 113px）、图例文字掉段外。
 *
 * 判据三条同时成立才并：合成段（无真值锚、未标幻觉）+ 同层有图表段 + 高度 ≤ 图表段 × 0.35。
 */

import {
  mergeChartInnerSections,
  CHART_INNER_MAX_HEIGHT_RATIO,
} from './chart-inner-section-merge.js'

const FIGMA = {
  document: {
    id: '73:3',
    name: 'root',
    children: [
      { id: '89:42', name: 'sub-t', children: [] },
      { id: '2:7898', name: '@echarts/line', children: [] },
    ],
  },
}

const mk = (over: any) => ({
  id: '',
  type: 'list',
  title: '',
  styles: {},
  ...over,
})

describe('mergeChartInnerSections', () => {
  it('阳性：chart-legend / mark-line 合成小段被并（ef014f7d 原样段计划）', () => {
    const sections = [
      mk({ id: '89:42', type: 'container', title: 'sub-t', styles: { figmaHeightPx: 32 } }),
      mk({ id: '2:7898', type: 'chart', title: '折线图', styles: { figmaHeightPx: 113 } }),
      mk({ id: 'chart-legend', type: 'chart', title: '图例', styles: { figmaHeightPx: 14 } }),
      mk({ id: 'mark-line', type: 'list', title: '预警线', styles: { figmaHeightPx: 22 } }),
    ]
    const { sections: out, stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(2)
    expect(stats.mergedIds).toEqual(['chart-legend', 'mark-line'])
    expect(out.map((s: any) => s.id)).toEqual(['89:42', '2:7898'])
    // 两个真段原对象引用保持不变（契约字段靠对象身份）
    expect(out[0]).toBe(sections[0])
    expect(out[1]).toBe(sections[1])
  })

  it('阴性：有真值锚的小段不并（sub-t 32px 是真实容器段）', () => {
    const sections = [
      mk({ id: '89:42', type: 'container', styles: { figmaHeightPx: 32 } }),
      mk({ id: '2:7898', type: 'chart', styles: { figmaHeightPx: 113 } }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(0)
  })

  it('阴性：合成段但高度超阈值（≥35%）不并 —— 防误并真业务段', () => {
    const sections = [
      mk({ id: '2:7898', type: 'chart', styles: { figmaHeightPx: 113 } }),
      mk({ id: 'vision-card', type: 'list', styles: { figmaHeightPx: 60 } }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(0)
    // 阈值语义锚定（60/113 = 0.53 > 0.35）
    expect(60 / 113).toBeGreaterThan(CHART_INNER_MAX_HEIGHT_RATIO)
  })

  it('阴性：同层无图表段 ⇒ 不并（无图表语境时合成段可能是真实业务段）', () => {
    const sections = [
      mk({ id: '89:42', type: 'container', styles: { figmaHeightPx: 200 } }),
      mk({ id: 'chart-legend', type: 'list', styles: { figmaHeightPx: 14 } }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(0)
  })

  it('阴性：已标幻觉 anchorValid=false 的段不被本判据二次裁决', () => {
    const sections = [
      mk({ id: '2:7898', type: 'chart', styles: { figmaHeightPx: 113 } }),
      mk({ id: 'ghost', type: 'list', styles: { figmaHeightPx: 14 }, anchorValid: false }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(0)
  })

  it('阴性：无高度信息（无法判定几何）⇒ 不并（fail-open）', () => {
    const sections = [
      mk({ id: '2:7898', type: 'chart', styles: { figmaHeightPx: 113 } }),
      mk({ id: 'mystery', type: 'list' }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(0)
  })

  it('阳性：图表段用锚节点技术栈标记识别（@echarts）且 type 非 chart', () => {
    const sections = [
      mk({ id: '2:7898', type: 'list', figmaNodeId: '2:7898', styles: { figmaHeightPx: 113 } }),
      mk({ id: 'axis-x', type: 'list', styles: { figmaHeightPx: 20 } }),
    ]
    const { stats } = mergeChartInnerSections(sections, FIGMA)
    expect(stats.merged).toBe(1)
    expect(stats.mergedIds).toEqual(['axis-x'])
  })

  it('无 figmaNodeData ⇒ 原样返回（fail-open）', () => {
    const sections = [mk({ id: 'a' }), mk({ id: 'b' })]
    const r = mergeChartInnerSections(sections, null)
    expect(r.sections).toBe(sections)
    expect(r.stats.evaluated).toBe(0)
  })
})
