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
    // 宽度比 46:367 ⇒ 46/206.5 = 0.223、367/206.5 = 1.777
    expect(round(kids[0].layoutMetadata.flexGrow)).toBeCloseTo(0.223, 2)
    expect(round(kids[1].layoutMetadata.flexGrow)).toBeCloseTo(1.777, 2)
    // 反证：若是高度口径会得到 1.036 / 0.964
    expect(round(kids[0].layoutMetadata.flexGrow)).not.toBeCloseTo(1.036, 2)
  })

  it('重建容器缺 figmaHeightPx 时用并集盒补高度 ⇒ 顶层三段参与同一口径归一', () => {
    const { effectiveSections } = plan(deviceLayout())
    const container = effectiveSections.find((s: any) => s.id === '89:37')
    // 并集盒高度 = 317（89:37 自身 46×317 与子项并集一致）
    expect(Number(container.layoutMetadata.height)).toBe(317)
    // 顶层 column 归一口径：30 / 65 / 317，avg=137.33
    const top = effectiveSections.map((s: any) => round(s.layoutMetadata.flexGrow))
    expect(top[0]).toBeCloseTo(0.218, 2) // 30/137.33
    expect(top[1]).toBeCloseTo(0.473, 2) // 65/137.33
    expect(top[2]).toBeCloseTo(2.309, 2) // 317/137.33
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
    // 100:300 ⇒ 0.5 / 1.5
    expect(round(kids[0].layoutMetadata.flexGrow)).toBeCloseTo(0.5, 2)
    expect(round(kids[1].layoutMetadata.flexGrow)).toBeCloseTo(1.5, 2)
  })
})
