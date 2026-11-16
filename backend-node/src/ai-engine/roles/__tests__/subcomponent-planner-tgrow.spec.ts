/**
 * T-GROW（2026-11-05 · mc-max-1793880532372-38f97905 实锤）：尺寸归一必须**方向感知**。
 *
 * 病灶：`applyFigmaHeightGrow` 只有高度口径，且递归进容器 children 时沿用高度。
 * 而 CSS 里 `flex-direction: row` 分发的是宽度 ⇒ T-TOPO 重建出的横向容器
 * （`89:39` 46×317 + `2:8437` 367×295）拿到 317:295 ≈ 1.04:0.96，
 * 真值宽度比是 46:367 = 0.11:0.89 ⇒ 渲染 ~52:48。
 *
 * 本文件 mock logger，切断 import.meta（与 nested-container spec 同套路）。
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

// device 真值（figma）：cp-设备监测 420×425
//   2:8419 header 388×30        ← 顶部统计栏标题行
//   89:40  slot-con 407×380
//     89:38 switch 396×65       ← 两张统计卡
//     89:37 @antd/tab 46×317
//       89:39 tabs 46×317       ← 左栏竖 tab 轨
//       2:8437 cons 367×295     ← 右栏卡片网格（x 偏移 43）
function node(id: string, name: string, x: number, y: number, w: number, h: number, children: any[] = []) {
  return { id, name, type: 'FRAME', absoluteBoundingBox: { x, y, width: w, height: h }, children }
}

const tabChild1 = node('89:39', 'tabs', 1475, 538, 46, 317)
const tabChild2 = node('2:8437', 'cons', 1518, 550, 367, 295)
const figmaTree = {
  document: node('2:8417', 'cp-设备监测', 1450, 433, 420, 425, [
    node('2:8419', 'header', 1495, 441, 388, 30),
    node('89:40', 'slot-con', 1455, 475, 407, 380, [
      node('89:38', 'switch', 1455, 475, 396, 65),
      node('89:37', '@antd/tab', 1475, 538, 46, 317, [tabChild1, tabChild2]),
    ]),
  ]),
}

const makeLeaf = (id: string, name: string, h: number, type?: string) => ({
  id,
  name,
  ...(type ? { type } : {}),
  layout: 'vertical',
  layoutMetadata: { direction: 'column', height: h, flexGrow: 1 },
  styles: { figmaHeightPx: h },
  body: { children: [] },
})

function deviceLayout() {
  const c1 = makeLeaf('89:39', '左侧导航Tab', 317)
  const c2 = makeLeaf('2:8437', '设备卡片网格', 295)
  return {
    sections: [
      // ⚠️ 必须显式非 header 类型：`applyFigmaHeightGrow` 按设计跳过 `type:'header'`
      //   （归 base-panel 标题栏插槽，不参与列内 flex 分配，也不污染平均值）。
      //   夹具若留空会被 deriveSectionType 判成 header ⇒ 只有 2 段参与归一 ⇒ 断言失真。
      makeLeaf('2:8419', '顶部统计栏', 30, 'stats'),
      makeLeaf('89:38', '设备类型切换', 65, 'stats'),
      {
        id: '89:37',
        name: '@antd/tab',
        layout: 'horizontal',
        layoutSource: 'container-rebuild',
        layoutMetadata: { direction: 'row' },
        children: [c1, c2],
        body: { layout: 'horizontal', children: [c1, c2] },
      },
    ],
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000

describe('T-GROW · 尺寸归一方向感知', () => {
  const planner = new SubcomponentPlanner()
  const plan = (layout: any) =>
    planner.plan(layout, { figmaNodeData: figmaTree, enableInternalSplit: false })

  it('横向容器的子项 grow 按**宽度**比（46:367），不按高度比（317:295）', () => {
    const { effectiveSections } = plan(deviceLayout())
    const container = effectiveSections.find((s: any) => s.id === '89:37')
    expect(container).toBeDefined()
    const kids = container.children || []
    expect(kids.map((c: any) => c.id)).toEqual(['89:39', '2:8437'])
    // 宽度比 46:367 ⇒ Σ=1 归一：46/413 = 0.111、367/413 = 0.888（B1-S2）
    expect(round(kids[0].layoutMetadata.flexGrow)).toBeCloseTo(0.111, 2)
    expect(round(kids[1].layoutMetadata.flexGrow)).toBeCloseTo(0.888, 2)
    // 反证：若是高度口径会得到 0.518 / 0.482（Σ=1）
    expect(round(kids[0].layoutMetadata.flexGrow)).not.toBeCloseTo(0.518, 2)
  })

  it('重建容器缺 figmaHeightPx 时用并集盒补高度 ⇒ 顶层三段参与同一口径归一', () => {
    const { effectiveSections } = plan(deviceLayout())
    const container = effectiveSections.find((s: any) => s.id === '89:37')
    // 并集盒高度 = 317（89:37 自身 46×317 与子项并集一致）
    expect(Number(container.layoutMetadata.height)).toBe(317)
    // 顶层 column 归一口径：30 / 65 / 317，Σ=412（B1-S2 三源归一）
    const top = effectiveSections.map((s: any) => round(s.layoutMetadata.flexGrow))
    expect(top[0]).toBeCloseTo(0.073, 2) // 30/412
    expect(top[1]).toBeCloseTo(0.158, 2) // 65/412
    expect(top[2]).toBeCloseTo(0.769, 2) // 317/412
  })

  it('column 容器行为不变（高度比），不因方向感知改动而漂移', () => {
    const a = makeLeaf('a', 'A', 100)
    const b = makeLeaf('b', 'B', 300)
    const layout = {
      sections: [
        {
          id: 'v-box',
          name: 'vertical-box',
          layout: 'vertical',
          layoutSource: 'container-rebuild',
          children: [a, b],
          body: { layout: 'vertical', children: [a, b] },
        },
      ],
    }
    const { effectiveSections } = plan(layout)
    const box = effectiveSections.find((s: any) => s.id === 'v-box')
    const kids = box.children || []
    // 100:300 ⇒ Σ=1 归一 0.25 / 0.75（B1-S2）
    expect(round(kids[0].layoutMetadata.flexGrow)).toBeCloseTo(0.25, 2)
    expect(round(kids[1].layoutMetadata.flexGrow)).toBeCloseTo(0.75, 2)
  })
})

// A4 回写需要非空 figmaIndex（applyFigmaHeightGrow 入口守卫）⇒ 复用本文件 figmaTree。
const A4_FIGMA = { document: figmaTree.document }

describe('A4 修复值回写（2026-11-16 · 5f60396d 实锤）', () => {
  it('回写①：styles.flexGrow 同步为 Σ=1 修复值（配错残值 0.078 消失）', () => {
    const layout = {
      sections: [
        { ...makeLeaf('a', '甲', 100), styles: { flexGrow: 0.078, figmaHeightPx: 100, geometryPx: { h: 24 } } },
        { ...makeLeaf('b', '乙', 300), styles: { flexGrow: 0.078, figmaHeightPx: 300, geometryPx: { h: 24 } } },
      ],
    }
    const { effectiveSections } = new SubcomponentPlanner().plan(layout as any, { figmaNodeData: A4_FIGMA } as any)
    const [s1, s2] = effectiveSections
    // Σ=1：100/400=0.25、300/400=0.75
    expect(Number(s1.styles?.flexGrow)).toBeCloseTo(0.25, 2)
    expect(Number(s2.styles?.flexGrow)).toBeCloseTo(0.75, 2)
    // 配错残值 0.078 必须已被回写覆盖（5f60396d 形态：0.078 → 0.25）
    expect(Number(s1.styles?.flexGrow)).not.toBeCloseTo(0.078, 2)
  })

  it('回写②：geometryPx 随修复高同步（h=24 残值 → meta.height 真值）', () => {
    const layout = {
      sections: [
        { ...makeLeaf('x', '甲', 114), styles: { flexGrow: 0.078, figmaHeightPx: 114, geometryPx: { h: 24 } } },
        { ...makeLeaf('y', '乙', 140), styles: { flexGrow: 0.078, figmaHeightPx: 140, geometryPx: { h: 24 } } },
      ],
    }
    const { effectiveSections } = new SubcomponentPlanner().plan(layout as any, { figmaNodeData: A4_FIGMA } as any)
    const [sx, sy] = effectiveSections
    expect(sx.styles?.geometryPx?.h).toBe(114)
    expect(sy.styles?.geometryPx?.h).toBe(140)
    expect(sx.styles?.geometryPx?.h).not.toBe(24)
  })

  it('回写③：Σ 恒等（回写后 styles.flexGrow 之和 ≈ 1，三源量纲统一）', () => {
    const layout = {
      sections: [
        makeLeaf('p', '甲', 131),
        makeLeaf('q', '乙', 131),
        makeLeaf('r', '丙', 142),
        makeLeaf('t', '丁', 175),
      ],
    }
    const { effectiveSections } = new SubcomponentPlanner().plan(layout as any, { figmaNodeData: A4_FIGMA } as any)
    const sum = effectiveSections.reduce((a: number, s: any) => a + Number(s.styles?.flexGrow || 0), 0)
    expect(sum).toBeCloseTo(1, 2)
  })
})
