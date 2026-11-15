/**
 * 🛡️ 步骤 1 · 回收 chart 声明归一 · 阴阳对照（2026-11-15）
 *
 * 病灶（mc-max-1794752955560-c0cb00f1）：视觉把折线子段 `2:3573` 挂成
 * `section.children` 回收子段；planner 叶子分支只放行 collapsed / v-for ⇒
 * 宿主段 `2:3571` 的 `body.children` 只剩装饰 icon，段内容轨 2 个 bar、产物 2 个 echarts。
 * 真值：`1744:125 slot-con` 内标题条下方唯一子节点 `2:3604 @echarts/line-7`
 * (y764.3 h140.7) ⇒ 24px 的标题段实际应覆盖 730→904 = 174px。
 *
 * 阳性（真错必须修）：归一后 body.children 追加 chart 声明、既有节点逐字保留；
 *   观测器读数 3/2/2 plan-gap → 3/3/2 artifact-gap；P0.5 才有对象可算（24→174）。
 * 阴性（不误伤）：装饰 icon / 折叠 list / v-for / 容器段 / chartSpec /
 *   internalSubcomponents / 已归一幂等 / 无真值树 / 无 ref / 多面板 / 高度不足 /
 *   多宿主 / 面板已被引用 ⇒ 逐条不命中，真错仍 FAIL。
 *
 * 判据与验证刻意不同源：本 spec 用独立字面量构造真值树与段计划，
 * 不 import 判据内部的 CHART_TYPES / SKIP_KEYS / 几何 helper（改的人 = 验的人 = 假绿）。
 */
import { reclaimChartDeclarations } from './reclaim-chart-declarations.js'
import { auditChartConservation } from './chart-conservation-audit.js'
import { repairTailChartSectionHeight } from './section-height-ownership.js'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })

/** 独立构造 Figma 真值：容器 slot 内「标题条 tit」+「唯一下方图表面板 panel」。 */
function makeFigma(overrides: any = {}) {
  const chartTop = overrides.chartTop ?? 764.3
  const chartH = overrides.chartH ?? 140.7
  const containerBottom = overrides.containerBottom ?? 904
  const panels = overrides.panels ?? [
    { id: '2:3604', name: '@echarts/line-7', type: 'GROUP', absoluteBoundingBox: box(43.8, chartTop, 363, chartH), children: [] },
  ]
  return {
    document: {
      id: 'root', type: 'FRAME', absoluteBoundingBox: box(0, 0, 500, 1000),
      children: [
        {
          id: '1744:125', name: 'slot-con', type: 'FRAME',
          absoluteBoundingBox: box(10, 158.7, 425.8, containerBottom - 158.7),
          children: [
            {
              id: '2:3571', name: 'tit', type: 'GROUP',
              absoluteBoundingBox: box(35.8, 730, 86, 24.3),
              children: [{ id: '2:3572', name: '流量预测', type: 'TEXT', absoluteBoundingBox: box(57.8, 730, 64, 24.3) }],
            },
            ...panels,
          ],
        },
      ],
    },
  }
}

const icon = { id: '2:3572', name: '装饰图标', role: '装饰', type: 'icon' }
const lineDecl = { id: '2:3574', name: '流量预测折线图', role: 'chart', type: 'line', figmaNode: '2:3573', children: [] }
const barDecls = [
  { id: '2:7626', figmaNode: '2:7625', role: 'chart', type: 'bar' },
  { id: '2:7795', figmaNode: '2:7794', role: 'chart', type: 'bar' },
]

/** 7 段 plan：两个 bar 在主轨，尾段只有 icon（本单同构）。 */
function makePlan(lastBodyChildren: any[] = [icon]) {
  return [
    { id: '2:3559', body: { children: [icon] } },
    { id: '2:3660', body: { items: [{ id: '2:3683', type: 'value', text: '34,620' }] } },
    { id: '1744:127', body: { children: [barDecls[0]] } },
    { id: '1744:128', body: { children: [barDecls[1]] } },
    { id: '2:3439', body: { children: [icon] } },
    { id: '1263:38', body: { children: [icon] } },
    {
      id: '2:3571', title: '流量预测',
      body: { layout: 'horizontal', children: lastBodyChildren, styles: { width: '204px' } },
      styles: { figmaHeightPx: 24 },
      sourceNodeIds: ['2:3571', '2:3572'],
    },
  ] as any[]
}

/** 7 段 source：只有尾段带回收子段（挂在 section.children，非 body.children）。 */
function makeSources(lastChildren: any[] = [
  { id: '2:3573', name: '流量预测折线图', body: { children: [lineDecl] }, children: [] },
]) {
  return [
    { id: '2:3559', body: { children: [icon] } },
    { id: '2:3660', body: { items: [] } },
    { id: '1744:127', body: { children: [barDecls[0]] } },
    { id: '1744:128', body: { children: [barDecls[1]] } },
    { id: '2:3439', body: { children: [icon] } },
    { id: '1263:38', body: { children: [icon] } },
    {
      id: '2:3571', name: '流量预测标题与Tab',
      body: { children: [icon] },
      children: lastChildren,
      reclaimedChildren: lastChildren.map((c: any) => String(c.id)),
    },
  ] as any[]
}

const visionCharts = [
  { section: '2:7625', type: 'bar' },
  { section: '2:7794', type: 'bar' },
  { section: '2:3573', type: 'line' },
]

function run(overrides: any = {}) {
  const sections = overrides.sections ?? makePlan()
  const sourceSections = overrides.sourceSections ?? makeSources()
  const figmaNodeData = overrides.figmaNodeData === undefined ? makeFigma() : overrides.figmaNodeData
  return reclaimChartDeclarations({ sections, sourceSections, figmaNodeData })
}

describe('步骤 1 · 回收 chart 声明归一', () => {
  // ① 本单阳性：命中并搬运
  it('① 本单真错：attached=1，宿主 body.children 追加 line 声明且既有 icon 逐字保留', () => {
    const r = run()
    expect(r.stats).toMatchObject({
      evaluated: 7, sourceMatched: 7, reclaimedDeclarations: 1,
      hostCandidates: 1, truthPanels: 1, attached: 1, skipped: false,
    })
    const last: any = r.sections[r.sections.length - 1]
    expect(last.body.children[0]).toEqual(icon) // 既有节点逐字不变
    expect(last.body.children).toHaveLength(2)
    expect(last.body.children[1]).toMatchObject({ id: '2:3574', role: 'chart', type: 'line' })
    expect(last.body.layout).toBe('horizontal')
    expect(last.body.styles).toEqual({ width: '204px' })
    expect(last.styles).toEqual({ figmaHeightPx: 24 })
    expect(last.chartReclaim).toMatchObject({
      hostSectionId: '2:3571', refId: '2:3571', containerId: '1744:125',
      truthPanelId: '2:3604', truthHeightPx: 174, targetMount: 'body.children',
      reclaimedChartIds: ['2:3573'], chartTypes: ['line'],
    })
  })

  // ② 交叉验证：观测器读数 3/2/2 → 3/3/2（验的人不是修复器自己）
  it('② 步骤 0 基线作回归锚：plan-gap → artifact-gap，gapCount 1→0（产物仍缺，不假报修好）', () => {
    const before = auditChartConservation({ visionCharts, plan: { effectiveSections: makePlan() }, files: {} })
    expect(before).toMatchObject({ planChartDeclarations: 2, gapCount: 1, verdict: 'plan-gap' })
    const r = run()
    const after = auditChartConservation({ visionCharts, plan: { effectiveSections: r.sections }, files: {} })
    expect(after).toMatchObject({
      visionCharts: 3, planChartDeclarations: 3, gapCount: 0,
      missingChartIds: [], verdict: 'plan-only', // files 为空 ⇒ 产物缺席，不编 0
    })
  })

  // ③ 归一后 P0.5 才生效
  it('③ 依赖顺序：归一前 P0.5 recomputed=0，归一后 24→174', () => {
    const before = repairTailChartSectionHeight({ sections: makePlan(), figmaNodeData: makeFigma() })
    expect(before.stats.recomputed).toBe(0)
    const r = run()
    const after = repairTailChartSectionHeight({ sections: r.sections, figmaNodeData: makeFigma() })
    expect(after.stats.recomputed).toBe(1)
    expect((after.sections[after.sections.length - 1] as any).styles.figmaHeightPx).toBe(174)
  })

  // ④ 幂等
  it('④ 幂等：第二次调用不再追加，body.children 长度不变', () => {
    const first = run()
    const second = reclaimChartDeclarations({
      sections: first.sections, sourceSections: makeSources(), figmaNodeData: makeFigma(),
    })
    expect(second.stats.attached).toBe(0)
    expect(second.stats.skippedReason).toBe('already-present')
    expect((second.sections[6] as any).body.children).toHaveLength(2)
  })

  // ⑤ 纯函数
  it('⑤ 纯函数：入参 sections / sourceSections / figma 逐字不变，未命中段保持同一引用', () => {
    const sections = makePlan()
    const sourceSections = makeSources()
    const figma = makeFigma()
    const snap = JSON.stringify({ sections, sourceSections, figma })
    const r = reclaimChartDeclarations({ sections, sourceSections, figmaNodeData: figma })
    expect(JSON.stringify({ sections, sourceSections, figma })).toBe(snap)
    expect(r.sections[0]).toBe(sections[0])
    expect(r.sections[6]).not.toBe(sections[6])
  })

  // ⑥~⑨ 其它类型逐条不命中
  it('⑥ 装饰 icon 回收子段不命中', () => {
    const r = run({ sourceSections: makeSources([{ id: 'icon-sub', body: { children: [icon] } }]) })
    expect(r.stats.attached).toBe(0)
    expect(r.stats.skippedReason).toBe('no-reclaimed-chart')
  })

  it('⑦ 折叠 list / v-for 子段不命中（无 chart 声明）', () => {
    const r = run({ sourceSections: makeSources([
      { id: 'list-sub', collapsed: true, renderHint: 'v-for', body: { items: [{ id: 'row', type: 'text', text: '路段' }] } },
    ]) })
    expect(r.stats.attached).toBe(0)
    expect(r.stats.reclaimedDeclarations).toBe(0)
  })

  it('⑧ 容器段（只有子段壳）/ chartSpec 规格 / internalSubcomponents 另一轨不命中', () => {
    const r = run({ sourceSections: makeSources([
      { id: 'container-sub', children: [{ id: 'inner', role: 'group' }] },
      { id: 'spec-sub', chartSpec: { type: 'line' }, internalSubcomponents: [{ type: 'chart-component', id: 'fake' }] },
    ]) })
    expect(r.stats.attached).toBe(0)
    expect(r.stats.reclaimedDeclarations).toBe(0)
  })

  it('⑨ 主轨已有等价声明（按 figmaNode 去重）⇒ 不命中', () => {
    const r = run({ sections: makePlan([icon, lineDecl]) })
    expect(r.stats.attached).toBe(0)
    expect(r.stats.skippedReason).toBe('already-present')
  })

  // ⑩~⑯ fail-open / 唯一性
  it('⑩ 无 sourceSections ⇒ no-source-sections', () => {
    expect(run({ sourceSections: [] }).stats.skippedReason).toBe('no-source-sections')
  })

  it('⑪ 无 Figma 真值树 ⇒ no-figma-tree', () => {
    expect(run({ figmaNodeData: null }).stats.skippedReason).toBe('no-figma-tree')
  })

  it('⑫ 段 ref 不在真值树 ⇒ no-figma-ref-box', () => {
    const figma: any = makeFigma()
    // 去掉标题条节点（连带其 TEXT 子节点），ref 与 sourceNodeIds 都无处可锚
    figma.document.children[0].children = figma.document.children[0].children.filter(
      (n: any) => String(n.id) !== '2:3571',
    )
    expect(run({ figmaNodeData: figma }).stats.skippedReason).toBe('no-figma-ref-box')
  })

  it('⑬ 容器内多个下方真值面板 ⇒ no-unique-truth-panel（指空段不猜）', () => {
    const r = run({ figmaNodeData: makeFigma({ panels: [
      { id: '2:3604', type: 'GROUP', absoluteBoundingBox: box(43.8, 764.3, 363, 140.7), children: [] },
      { id: '2:3605', type: 'GROUP', absoluteBoundingBox: box(43.8, 800, 363, 100), children: [] },
    ] }) })
    expect(r.stats.attached).toBe(0)
    expect(r.stats.skippedReason).toBe('no-unique-truth-panel')
  })

  it('⑭ 剩余高度不足 2× 标题高 ⇒ no-unique-truth-panel', () => {
    const r = run({ figmaNodeData: makeFigma({ chartTop: 755, chartH: 12, containerBottom: 770 }) })
    expect(r.stats.skippedReason).toBe('no-unique-truth-panel')
  })

  it('⑮ 两个宿主段同时缺 chart ⇒ ambiguous-host', () => {
    const sources = makeSources()
    sources[5] = {
      ...sources[5],
      children: [{ id: 'x-sub', body: { children: [{ id: 'x-line', role: 'chart', type: 'line', figmaNode: 'x-line' }] } }],
    }
    const r = run({ sourceSections: sources })
    expect(r.stats.hostCandidates).toBe(2)
    expect(r.stats.skippedReason).toBe('ambiguous-host')
    expect(r.stats.attached).toBe(0)
  })

  it('⑯ 真值面板已被其它段主轨引用 ⇒ no-unique-truth-panel', () => {
    const sections = makePlan()
    sections[5] = { ...sections[5], body: { children: [{ id: '2:3604', role: 'chart', type: 'pie' }] } }
    const r = run({ sections })
    expect(r.stats.skippedReason).toBe('no-unique-truth-panel')
  })

  // ⑰ 真错仍 FAIL：不得把「修好」写进观测结论
  it('⑰ 归一不改产物：files 给 2 个图表宿主时 verdict 仍为 artifact-gap', () => {
    const r = run()
    const files = {
      'package/components/ContentBridge.vue': 'echarts.init(el)',
      'package/components/ContentTunnel.vue': 'echarts.init(el)',
    }
    const a = auditChartConservation({ visionCharts, plan: { effectiveSections: r.sections }, files })
    expect(a).toMatchObject({ planChartDeclarations: 3, artifactChartMountPoints: 2, verdict: 'artifact-gap' })
  })

  // ⑱ 既有 body 用 items/elements 时追加到同一键（配方自适应产物建模差异）
  it('⑱ 主轨键自适应：body.items 段追加到 items，不新造 children 轨', () => {
    const sections = makePlan()
    sections[6] = { ...sections[6], body: { items: [icon] } }
    const r = run({ sections })
    expect(r.stats.attached).toBe(1)
    const last: any = r.sections[6]
    expect(last.body.items).toHaveLength(2)
    expect(last.body.children).toBeUndefined()
    expect(last.chartReclaim.targetMount).toBe('body.items')
  })
})
