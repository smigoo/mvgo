/**
 * planner.plan() 视觉结构治本回归（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）。
 *
 * 两件事都只有一个事实源：Figma 节点的 absoluteBoundingBox。
 *   ① 顺序：effectiveSections 必须按 Figma y 排（vision 数组序会把「车型分布」排在两张柱状图之前）；
 *   ② 比例：flexGrow 必须是「高度 / 本层平均高度」（vision 自报 3.73 / 0.952 是臆造，
 *      两张图 Figma 高度其实都是 131px）。
 *
 * 不放进 planner-p2.spec：该套件静态 import logger → backend-root.js 的 import.meta，
 * jest CJS 下整套件加载失败（既有基线）。本文件 mock logger 切断该边。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { SubcomponentPlanner } from '../subcomponent-planner.js'

/** 真实 bbox（.mc-gen/cache/figma-node-data.json 原值，节点 2:9778 子树） */
const FIGMA: any = {
  id: '2:9778',
  name: 'cp-流量监测',
  type: 'FRAME',
  absoluteBoundingBox: { x: 10, y: 109, width: 425.83, height: 807 },
  children: [
    { id: '2:3550', name: 'header-', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 119.14, width: 357, height: 32.54 } },
    { id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 35.83, y: 158.69, width: 357, height: 30.42 } },
    { id: '2:3660', name: 'Group 2136636802', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 196, width: 405.83, height: 91.44 } },
    { id: '2:7459', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.83, y: 287, width: 379, height: 131 } },
    { id: '2:7628', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.83, y: 428, width: 379, height: 131 } },
    { id: '2:3438', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: { x: 32.83, y: 573, width: 379, height: 142 } },
    { id: '2:3565', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 730, width: 379, height: 24.34 } },
    { id: '2:3604', name: '@echarts/line', type: 'GROUP', absoluteBoundingBox: { x: 43.83, y: 764.34, width: 363, height: 140.66 } },
  ],
}

function inlineRow(
  id: string,
  name: string,
  memberNames: string[],
  flexGrow: number,
  figmaHeightPx: number,
) {
  const members = memberNames.map((n, i) => ({
    id: `${id}-m${i + 1}`,
    name: n,
    role: 'item',
    figmaNode: `${id}-n${i + 1}`,
    styles: { flexGrow: 1, flexShrink: 1, flexBasis: 0, figmaHeightPx: figmaHeightPx / 2 },
  }))
  return {
    id,
    name,
    role: 'inline-row',
    layout: 'horizontal',
    layoutSource: 'inline-row',
    figmaNodeId: id,
    children: members,
    header: { title: name },
    body: { layout: 'horizontal', children: members },
    styles: { flexGrow, flexShrink: 1, flexBasis: 0, figmaHeightPx },
  }
}

function chartSection(id: string, title: string, sourceNodeIds: string[], flexGrow: number) {
  return {
    id,
    name: title,
    title,
    type: 'chart',
    layout: 'vertical',
    figmaNodeId: sourceNodeIds[0],
    sourceNodeIds,
    children: [],
    styles: { flexGrow, flexShrink: 1, flexBasis: 0, figmaHeightPx: 131 },
  }
}

/** vision 输出数组序（analysis.json 原样）+ 原样自报的 flexGrow（含 3.73/0.952 臆造比例） */
const layoutStructure: any = {
  layout: {
    type: 'vertical',
    direction: 'column',
    sections: [
      inlineRow('2:3550', 'header-', ['流量监测'], 0.329, 33),
      inlineRow('88:32', 'sub-header', ['24小时', '当日总流量'], 0.307, 30),
      inlineRow('2:3660', 'Group 2136636802', ['江阴大桥82,379', '34,620江阴靖江长江隧道'], 0.923, 91),
      inlineRow('2:3438', 'slot-车型分布', ['客车22350货车16270', '客车66109货车16270'], 1.434, 142),
      inlineRow('2:3565', 'sub-header', ['流量预测', '江阴靖江长江隧道江阴大桥'], 0.29, 24),
      chartSection('slot-hourly-chart-jinjiang', '江阴靖江长江隧道', ['2:7459'], 3.73),
      chartSection('slot-hourly-chart-bridge', '江阴大桥', ['2:7628'], 0.952),
      chartSection('slot-流量预测', '流量预测', ['2:3604'], 1.167),
    ],
  },
  charts: [],
}

function plan(extra: any = {}) {
  return new SubcomponentPlanner().plan(layoutStructure, {
    skipPanelHeaderFilter: false,
    enableInternalSplit: false,
    figmaNodeData: FIGMA,
    ...extra,
  })
}

describe('planner 视觉结构：Figma 坐标是顺序与比例的唯一事实源', () => {
  test('effectiveSections 按 Figma y 升序（车型分布回到两张柱状图之后）', () => {
    const { effectiveSections } = plan()
    expect(effectiveSections.map((s) => s.id)).toEqual([
      '2:3550',
      '88:32',
      '2:3660',
      'slot-hourly-chart-jinjiang',
      'slot-hourly-chart-bridge',
      '2:3438',
      '2:3565',
      'slot-流量预测',
    ])
  })

  test('flexGrow 按 Figma 实测高度归一：两张等高的柱状图必须等比例（3.73 vs 0.952 被纠正）', () => {
    const { effectiveSections } = plan()
    const growOf = (id: string) =>
      effectiveSections.find((s) => s.id === id)?.layoutMetadata?.flexGrow
    const jinjiang = growOf('slot-hourly-chart-jinjiang')
    const bridge = growOf('slot-hourly-chart-bridge')
    expect(jinjiang).toBeGreaterThan(0)
    expect(jinjiang).toBe(bridge)
    // 车型分布 (h=142) 必须比两张 131 的柱状图略高，而不是被压到 0.952
    expect(growOf('2:3438')).toBeGreaterThan(jinjiang as number)
  })

  test('header section 不参与列内 flex 分配，也不污染平均高度', () => {
    const { effectiveSections } = plan()
    const header = effectiveSections.find((s) => s.id === '2:3550')
    expect(header?.type).toBe('header')
    // 参与分配者的均值为 1：(30.42+91.44+131+131+142+24.34+140.66)/7
    const scored = effectiveSections.filter((s) => s.type !== 'header')
    const avg = scored.reduce((sum, s) => sum + (s.layoutMetadata?.flexGrow || 0), 0) / scored.length
    expect(avg).toBeCloseTo(1, 2)
  })

  test('无 figmaNodeData → 退回 vision 原序原值（旧调用方零行为变化）', () => {
    const { effectiveSections } = plan({ figmaNodeData: null })
    expect(effectiveSections.map((s) => s.id)).toEqual([
      '2:3550',
      '88:32',
      '2:3660',
      '2:3438',
      '2:3565',
      'slot-hourly-chart-jinjiang',
      'slot-hourly-chart-bridge',
      'slot-流量预测',
    ])
    const growOf = (id: string) =>
      effectiveSections.find((s) => s.id === id)?.layoutMetadata?.flexGrow
    expect(growOf('slot-hourly-chart-jinjiang')).toBe(3.73)
    expect(growOf('slot-hourly-chart-bridge')).toBe(0.952)
  })
})
