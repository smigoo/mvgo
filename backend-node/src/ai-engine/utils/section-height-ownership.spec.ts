/**
 * 🛡️ P0.5 段→组件高度归属修复器 · 阴阳对照（2026-11-15）
 *
 * 独立字面量构造 Figma 真值与段计划，不用修复器自己的常量做断言，
 * 防「改的人 = 验的人」假绿。真值形状取自
 * mc-max-1794751753773-12e2285e：容器 y=730/bottom=904、标题 ref y=730/h=24.3。
 */
import { repairTailChartSectionHeight } from './section-height-ownership.js'

const box = (x: number, y: number, w: number, h: number) => ({
  x, y, width: w, height: h,
})

function makeFigma(overrides: any = {}) {
  const containerY = overrides.containerY ?? 600
  const containerH = overrides.containerH ?? 304
  const chartTop = overrides.chartTop ?? 764.3
  const chartH = overrides.chartH ?? 140.7
  return {
    document: {
      id: 'root',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 500, 1000),
      children: [
        {
          id: 'container',
          type: 'FRAME',
          absoluteBoundingBox: box(0, containerY, 425, containerH),
          children: [
            { id: 'early-node', type: 'FRAME', absoluteBoundingBox: box(0, 600, 100, 24), children: [] },
            {
              id: 'header',
              type: 'GROUP',
              absoluteBoundingBox: box(0, 730, 100, 24.3),
              children: [
                { id: 'ref', type: 'GROUP', absoluteBoundingBox: box(0, 730, 86, 24.3), children: [] },
              ],
            },
            { id: 'chart-node', type: 'FRAME', absoluteBoundingBox: box(0, chartTop, 379, chartH), children: [] },
          ],
        },
      ],
    },
  }
}

function makeChartSection(extra: any = {}) {
  return {
    id: 'ref',
    styles: { figmaHeightPx: 24 },
    body: { children: [{ id: 'ref', role: 'chart', type: 'line' }] },
    ...extra,
  }
}

const run = (sections: any[], figmaNodeData: any = makeFigma()) =>
  repairTailChartSectionHeight({ sections, figmaNodeData })

describe('P0.5 尾部图表段高度归属', () => {
  it('阴性：声明 24px 但真值尾部剩余 174px ⇒ 重算为 174（不写死值）', () => {
    const { sections, stats } = run([makeChartSection()])
    expect(sections[0].styles.figmaHeightPx).toBe(174)
    expect(sections[0].heightOwnership).toMatchObject({
      refId: 'ref',
      containerId: 'container',
      declaredHeightPx: 24,
      truthHeightPx: 174,
    })
    expect(stats.recomputed).toBe(1)
  })

  it('阴性：不修改入参（纯函数）', () => {
    const s = makeChartSection()
    run([s])
    expect(s.styles.figmaHeightPx).toBe(24)
  })

  it('阴性：幂等 —— 跑第二次不再改动', () => {
    const first = run([makeChartSection()])
    const second = run(first.sections)
    expect(second.stats.recomputed).toBe(0)
    expect(second.sections[0].styles.figmaHeightPx).toBe(174)
  })

  it('阴性：图表声明在 declaredContent.items 也能命中（自适应建模差异）', () => {
    const s = {
      id: 'ref',
      styles: { figmaHeightPx: 24 },
      declaredContent: { items: [{ id: 'ref', type: 'line' }] },
    }
    expect(run([s]).sections[0].styles.figmaHeightPx).toBe(174)
  })

  it('阴性：ref 走 figmaNodeId 字段也能命中（自适应 ref 归属）', () => {
    const s = { ...makeChartSection(), id: 'unknown', figmaNodeId: 'ref' }
    expect(run([s]).sections[0].styles.figmaHeightPx).toBe(174)
  })

  it('阳性：无图表声明 ⇒ 原样返回（同一引用）', () => {
    const s = { id: 'ref', styles: { figmaHeightPx: 24 }, body: { children: [] } }
    const r = run([s])
    expect(r.sections[0]).toBe(s)
    expect(r.stats.chartSections).toBe(0)
  })

  it('阳性：真值剩余高度只有声明高的 1.5 倍 ⇒ 不重算', () => {
    const r = run([makeChartSection()], makeFigma({ containerY: 730, containerH: 36, chartTop: 750, chartH: 12 }))
    expect(r.stats.recomputed).toBe(0)
    expect(r.sections[0].styles.figmaHeightPx).toBe(24)
  })

  it('阳性：不是尾部段（另有段 ref 更靠下）⇒ 不重算', () => {
    const later = { id: 'chart-node', styles: { figmaHeightPx: 141 }, body: { children: [{ role: 'chart' }] } }
    const r = run([makeChartSection(), later])
    expect(r.stats.recomputed).toBe(0)
  })

  it('阳性：无 Figma 真值 ⇒ skipped 且逐字原样', () => {
    const s = makeChartSection()
    const r = run([s], null)
    expect(r.stats.skipped).toBe(true)
    expect(r.stats.skippedReason).toBe('no-figma-tree')
    expect(r.sections[0]).toBe(s)
  })

  it('阳性：ref 不在真值树（指空段 = 没给）⇒ 不重算', () => {
    const s = { ...makeChartSection(), id: 'phantom', figmaNodeId: 'phantom' }
    expect(run([s]).stats.recomputed).toBe(0)
  })

  it('阳性：段缺声明高 ⇒ 不重算', () => {
    const s = { ...makeChartSection(), styles: {} }
    expect(run([s]).stats.recomputed).toBe(0)
  })

  it('阳性：容器子节点没有更下方内容 ⇒ 不重算', () => {
    const noLower = makeFigma()
    noLower.document.children[0].children = [
      { id: 'header', type: 'GROUP', absoluteBoundingBox: box(0, 730, 100, 24.3), children: [
        { id: 'ref', type: 'GROUP', absoluteBoundingBox: box(0, 730, 86, 24.3), children: [] },
      ] },
    ]
    expect(run([makeChartSection()], noLower).stats.recomputed).toBe(0)
  })

  it('阳性：空段清单 ⇒ skipped / 计数行键齐全（0 也打）', () => {
    const r = run([])
    expect(r.stats.skipped).toBe(true)
    expect(Object.keys(r.stats).sort()).toEqual(
      ['chartSections', 'details', 'evaluated', 'recomputed', 'skipped', 'skippedReason', 'tailCandidates'].sort(),
    )
  })

  it('阳性：多个图表段只重算尾部那一个，其它段保持同一引用', () => {
    const early = { id: 'early-node', styles: { figmaHeightPx: 24 }, body: { children: [{ role: 'chart' }] } }
    const tail = makeChartSection()
    const r = run([early, tail])
    expect(r.stats.recomputed).toBe(1)
    expect(r.sections[0]).toBe(early)
    expect(r.sections[1].styles.figmaHeightPx).toBe(174)
  })

  it('阳性：多个图表段共享同一 top ⇒ 归属不明确，全部不修（不猜）', () => {
    const a = makeChartSection()
    const b = { id: 'ref', styles: { figmaHeightPx: 24 }, children: [{ role: 'chart' }] }
    const r = run([a, b])
    expect(r.stats.recomputed).toBe(0)
    expect(r.sections[0]).toBe(a)
    expect(r.sections[1]).toBe(b)
  })
})
