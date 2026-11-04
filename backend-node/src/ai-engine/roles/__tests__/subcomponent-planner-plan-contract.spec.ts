/**
 * P 层 plan 契约单测（2026-11-04）：P-1 画布 / P-3 图表宿主事实 / P-4 段内结构事实。
 * P-2 几何契约双写另见 figma-height-ratio.spec.ts（applyFigmaSectionRatios 路径）。
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'
import { applyFigmaSectionRatios } from '../../utils/figma-height-ratio.js'

function node(id: string, name: string, x: number, y: number, w: number, h: number, children: any[] = []) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: w, height: h },
    children,
  }
}

describe('P 层 plan 契约', () => {
  const ROOT = node('0:1', 'cp-demo', 0, 0, 420, 186, [
    node('2:1', 'tab-bar', 0, 0, 420, 40, [
      { id: '2:11', name: 'tab-text', type: 'TEXT', characters: '运行中', absoluteBoundingBox: { x: 8, y: 12, width: 40, height: 16 }, children: [] },
    ]),
    node('2:2', 'chart-area', 0, 40, 420, 100),
    node('2:3', 'list', 0, 140, 420, 46),
  ])

  test('P-1：Figma 根 bbox 锁进 plan.canvas（单一事实源）', () => {
    const layout = { layout: { sections: [
      { id: '2:1', name: 'tab-bar' },
      { id: '2:2', name: 'chart-area' },
      { id: '2:3', name: 'list' },
    ] } }
    const res: any = new SubcomponentPlanner().plan(layout, { figmaNodeData: ROOT })
    expect(res.canvas).toEqual({ width: 420, height: 186, source: 'figma-root-bbox' })
  })

  test('P-1：无 figma 数据 ⇒ fail-open，plan.canvas 缺省（不硬造）', () => {
    const layout = { layout: { sections: [
      { id: '2:1', name: 'tab-bar' },
      { id: '2:2', name: 'chart-area' },
    ] } }
    const res: any = new SubcomponentPlanner().plan(layout, {})
    expect(res.canvas).toBeUndefined()
  })

  test('P-3：chartDataHints.section 聚合为 section.chartFacts（真引用挂载）', () => {
    const layout = { layout: { sections: [
      { id: '2:2', name: 'chart-area' },
      { id: '2:3', name: 'list' },
    ] } }
    const res: any = new SubcomponentPlanner().plan(layout, {
      figmaNodeData: ROOT,
      chartDataHints: [
        { chartType: 'bar', section: '2:2', title: '当日流量' },
        { chartType: 'line', section: '2:2', title: '趋势' },
        { chartType: 'ring', section: '不存在的段' },
      ],
    })
    const chartSec = res.effectiveSections.find((s: any) => s.id === '2:2')
    expect(chartSec?.chartFacts).toEqual({ count: 2, types: ['bar', 'line'] })
  })

  test('P-4：叶子 section 锚点子树顶层元素归一为 internalGeometry', () => {
    const layout = { layout: { sections: [
      { id: '2:1', name: 'tab-bar' },
      { id: '2:3', name: 'list' },
    ] } }
    const res: any = new SubcomponentPlanner().plan(layout, { figmaNodeData: ROOT })
    const tabSec = res.effectiveSections.find((s: any) => s.id === '2:1')
    expect(Array.isArray(tabSec?.internalGeometry)).toBe(true)
    expect(tabSec.internalGeometry).toEqual([
      { x: 8, y: 12, w: 40, h: 16, text: '运行中' },
    ])
  })

  test('P-4：合成段 id（非 N:M）⇒ skipped，不硬造', () => {
    const layout = { layout: { sections: [
      { id: '2:1-list', name: 'list-synthetic' },
      { id: '2:3', name: 'list' },
    ] } }
    const res: any = new SubcomponentPlanner().plan(layout, { figmaNodeData: ROOT })
    const syn = res.effectiveSections.find((s: any) => s.id === '2:1-list')
    expect(syn?.internalGeometry).toBeUndefined()
  })

  test('P-2：A4 writeSectionRatios 命中时 geometryPx 契约双写（rootDirect 路径）', () => {
    const doc = node('0:1', 'cp-demo', 0, 0, 200, 114, [
      node('5:1', 'header-标题栏', 0, 0, 200, 28),
      node('5:2', 'content-slot', 0, 28, 200, 86),
    ])
    const sections: any[] = [
      { role: 'header', name: '头部标题栏' },
      { name: '今日累计' },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, doc, stats)
    expect(stats.rootDirect).toBe(2)
    expect(sections[0].geometryPx).toEqual({ h: 28 })
    expect(sections[1].geometryPx).toEqual({ h: 86 })
    expect(sections[0].styles.figmaHeightPx).toBe(28)
  })
})
