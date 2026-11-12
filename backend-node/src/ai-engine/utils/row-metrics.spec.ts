/**
 * F18（2026-10-21）：行内列数/单项尺寸/间距的算术推导。
 *
 * 真实真值（c-c8d-195c8d0e 战略合作厂商区）：`4 × 126 + 3 × 20 = 564 = 604 - 20×2`。
 * 阳性对照用真值数字，阴性对照保证「不均匀/多行/异宽」一律不猜。
 */
import {
  deriveRowMetrics,
  columnsFromWidth,
  deriveGridColumnsFromBands,
  deriveGridColumnsFromNode,
} from './row-metrics.js'
import { deriveGapFromBoxes, deriveGapSequence } from './row-metrics.js'

/** 真值：一行 4 个 chip，126×30，间距 20，容器内宽 564 */
const REAL_ROW = [
  { x: 20, y: 57, width: 126, height: 30 },
  { x: 166, y: 57, width: 126, height: 30 },
  { x: 312, y: 57, width: 126, height: 30 },
  { x: 458, y: 57, width: 126, height: 30 },
]

describe('deriveRowMetrics', () => {
  it('阳性对照：真实 4 chip 行 ⇒ 4 / 126 / 30 / 20', () => {
    expect(deriveRowMetrics(REAL_ROW)).toEqual({
      count: 4,
      itemWidth: 126,
      itemHeight: 30,
      gap: 20,
    })
  })

  it('输出顺序无关（乱序输入结果一致）', () => {
    const shuffled = [REAL_ROW[2], REAL_ROW[0], REAL_ROW[3], REAL_ROW[1]]
    expect(deriveRowMetrics(shuffled)).toEqual(deriveRowMetrics(REAL_ROW))
  })

  it('阴性对照：两行（y 不同）⇒ 不猜（null）', () => {
    const twoRows = [
      ...REAL_ROW,
      { x: 20, y: 107, width: 126, height: 30 },
      { x: 166, y: 107, width: 126, height: 30 },
    ]
    expect(deriveRowMetrics(twoRows)).toBeNull()
  })

  it('阴性对照：宽度不一致 ⇒ 不猜（null）', () => {
    const uneven = [
      { x: 0, y: 0, width: 126, height: 30 },
      { x: 146, y: 0, width: 160, height: 30 },
      { x: 326, y: 0, width: 126, height: 30 },
    ]
    expect(deriveRowMetrics(uneven)).toBeNull()
  })

  it('阴性对照：间距不均匀 ⇒ 不猜（null）', () => {
    const unevenGap = [
      { x: 0, y: 0, width: 126, height: 30 },
      { x: 146, y: 0, width: 126, height: 30 },
      { x: 400, y: 0, width: 126, height: 30 },
    ]
    expect(deriveRowMetrics(unevenGap)).toBeNull()
  })

  it('阴性对照：元素重叠 ⇒ 不猜（null）', () => {
    const overlap = [
      { x: 0, y: 0, width: 126, height: 30 },
      { x: 100, y: 0, width: 126, height: 30 },
      { x: 300, y: 0, width: 126, height: 30 },
    ]
    expect(deriveRowMetrics(overlap)).toBeNull()
  })

  it('阴性对照：不足 minCount ⇒ 不猜（null）', () => {
    expect(deriveRowMetrics(REAL_ROW.slice(0, 2), { minCount: 3 })).toBeNull()
  })

  it('缺 bbox 的成员被跳过；是否采纳由调用方 minCount 决定', () => {
    // 默认 minCount=2 ⇒ 剩 2 个合法项仍给出结果（是否用由调用方定）
    expect(deriveRowMetrics([...REAL_ROW.slice(0, 2), null as any])?.count).toBe(2)
    // 调用方要求 ≥3（列表场景）⇒ 同类输入被拒
    expect(
      deriveRowMetrics([...REAL_ROW.slice(0, 2), null as any], { minCount: 3 }),
    ).toBeNull()
    // 空对象无 bbox ⇒ 跳过，剩 3 个
    expect(deriveRowMetrics([...REAL_ROW.slice(0, 3), {} as any])?.count).toBe(3)
  })

  it('容差内（±1px）仍判为同一行/同宽', () => {
    const jitter = [
      { x: 20, y: 57, width: 126, height: 30 },
      { x: 166, y: 58, width: 127, height: 30 },
      { x: 312, y: 57, width: 125, height: 31 },
      { x: 458, y: 57, width: 126, height: 30 },
    ]
    const m = deriveRowMetrics(jitter)
    expect(m?.count).toBe(4)
    expect(m?.gap).toBe(20)
  })
})

describe('columnsFromWidth', () => {
  it('真值自洽：564 / 126 / 20 ⇒ 4', () => {
    expect(columnsFromWidth(564, 126, 20)).toBe(4)
  })

  it('少一项宽度 ⇒ 3', () => {
    expect(columnsFromWidth(420, 126, 20)).toBe(3)
  })

  it('非法入参 ⇒ 0（不猜）', () => {
    expect(columnsFromWidth(NaN, 126, 20)).toBe(0)
    expect(columnsFromWidth(564, 0, 20)).toBe(0)
    expect(columnsFromWidth(564, 126, -1)).toBe(0)
  })
})

/**
 * L3-b：间距反推。真实真值 = 4 个 section 纵向间距 33 / 20 / 20
 * （`76+33+161+20+212+20+265 = 787` 与内容容器等高）。
 */
describe('deriveGapFromBoxes / deriveGapSequence', () => {
  const SECTIONS = [
    { x: 0, y: 51483, width: 604, height: 76 },
    { x: 0, y: 51592, width: 604, height: 161 },
    { x: 0, y: 51773, width: 604, height: 212 },
    { x: 0, y: 52005, width: 604, height: 265 },
  ]

  it('真值：纵向间隔为 33 / 20 / 20', () => {
    expect(deriveGapSequence(SECTIONS, 'column')).toEqual([33, 20, 20])
  })

  it('uniform 模式：不等距 ⇒ 0（不猜）', () => {
    expect(deriveGapFromBoxes(SECTIONS, 'column')).toBe(0)
  })

  it('dominant 模式：取覆盖过半的众数 20', () => {
    expect(deriveGapFromBoxes(SECTIONS, 'column', { mode: 'dominant' })).toBe(20)
  })

  it('等距行：两种模式都给 20（4 chip 真值）', () => {
    const row = [
      { x: 20, y: 57, width: 126, height: 30 },
      { x: 166, y: 57, width: 126, height: 30 },
      { x: 312, y: 57, width: 126, height: 30 },
      { x: 458, y: 57, width: 126, height: 30 },
    ]
    expect(deriveGapFromBoxes(row, 'row')).toBe(20)
    expect(deriveGapFromBoxes(row, 'row', { mode: 'dominant' })).toBe(20)
    expect(deriveGapSequence(row, 'row')).toEqual([20, 20, 20])
  })

  it('row 方向按 x 计算（不是 y）', () => {
    const row = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 125, y: 999, width: 100, height: 40 },
    ]
    expect(deriveGapFromBoxes(row, 'row')).toBe(25)
  })

  it('阴性对照：三个间隔互不相同且无过半众数 ⇒ 0（不猜）', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 0, y: 20, width: 100, height: 10 }, // 10
      { x: 0, y: 60, width: 100, height: 10 }, // 30
      { x: 0, y: 120, width: 100, height: 10 }, // 50
    ]
    expect(deriveGapFromBoxes(boxes, 'column', { mode: 'dominant' })).toBe(0)
    expect(deriveGapSequence(boxes, 'column')).toEqual([10, 30, 50])
  })

  it('阴性对照：频次并列 ⇒ 0（不猜）', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 0, y: 20, width: 100, height: 10 }, // 10
      { x: 0, y: 50, width: 100, height: 10 }, // 20
    ]
    // 两个间隔各 1 次，并列 ⇒ 不猜
    expect(deriveGapFromBoxes(boxes, 'column', { mode: 'dominant' })).toBe(0)
  })

  it('阴性对照：元素重叠 ⇒ 0 / 空数组', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 10, width: 100, height: 50 },
    ]
    expect(deriveGapFromBoxes(boxes, 'column')).toBe(0)
    expect(deriveGapSequence(boxes, 'column')).toEqual([])
  })

  it('负数间隙（-1px 容差内）按 0 处理，不产出负 gap', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 49, width: 100, height: 50 },
    ]
    const g = deriveGapFromBoxes(boxes, 'column')
    expect(g).toBeGreaterThanOrEqual(0)
  })

  it('真实结构（38:3162 型）：背景矩形与内容同层 ⇒ 按带聚簇后仍能算出段间距', () => {
    // bg(604×212) 覆盖全卡 + icon/title 同行 + 三行行容器
    const kids = [
      { x: 0, y: 0, width: 604, height: 212 }, // 背景矩形（与所有兄弟 y 重叠）
      { x: 20, y: 20, width: 16, height: 16 }, // icon
      { x: 44, y: 20, width: 64, height: 16 }, // 标题（与 icon 同行）
      { x: 20, y: 57, width: 564, height: 30 }, // row1
      { x: 20, y: 107, width: 564, height: 30 }, // row2
      { x: 20, y: 157, width: 564, height: 30 }, // row3
    ]
    // 若直接按 y 排序算相邻间隙 ⇒ 首两个间隙为负 ⇒ 旧实现返回空
    expect(deriveGapSequence(kids, 'column')).toEqual([21, 20, 20])
    expect(deriveGapFromBoxes(kids, 'column', { mode: 'dominant' })).toBe(20)
  })

  it('缺 bbox 的子项被跳过；剩 <2 项 ⇒ 0 / []', () => {
    expect(deriveGapFromBoxes([SECTIONS[0], null as any], 'column')).toBe(0)
    expect(deriveGapSequence([SECTIONS[0], {} as any], 'column')).toEqual([])
  })
})

/**
 * 2026-11-12（mc-1794428749650-cc633474）：列数必须由「行带内项数」反算，而不是容器子项 x 聚类。
 * 真机真值：`[126,126,126,126]` + `[126,126]`（564/272 两个行带）⇒ 4 列；
 *          `[126×4] ×3 + [126×3]`（564/564/564/418）⇒ 4 列（末行不满是常态）。
 */
describe('deriveGridColumnsFromBands', () => {
  const row = (n: number, y: number, gap = 20, w = 126) =>
    Array.from({ length: n }, (_, i) => ({ x: i * (w + gap), y, width: w, height: 30 }))
  const band = (n: number, y = 0) => ({ boxes: row(n, y) })

  it('阳性：末行不满 [4,4,4,3] ⇒ 4（众数，不取末行）', () => {
    const r = deriveGridColumnsFromBands([band(4, 0), band(4, 40), band(4, 80), band(3, 120)])
    expect(r?.count).toBe(4)
    expect(r?.itemWidth).toBe(126)
    expect(r?.gap).toBe(20)
    expect(r?.rows).toBe(4)
  })

  it('阳性：两行数量并列 [4,2] ⇒ 取较大值 4（38:3137 实锤）', () => {
    const r = deriveGridColumnsFromBands([band(4, 0), band(2, 40)])
    expect(r?.count).toBe(4)
    expect(r?.agreement).toBe(0.5)
  })

  it('阳性：三行一致 [4,4,4] ⇒ 4（38:3162 实锤）', () => {
    const r = deriveGridColumnsFromBands([band(4, 0), band(4, 40), band(4, 80)])
    expect(r?.count).toBe(4)
    expect(r?.agreement).toBe(1)
  })

  it('阴性：行内宽度不等（表头+内容混排）⇒ null 不猜', () => {
    const mixed = { boxes: [
      { x: 0, y: 0, width: 126, height: 30 },
      { x: 146, y: 0, width: 300, height: 30 },
    ] }
    expect(deriveGridColumnsFromBands([mixed])).toBeNull()
  })

  it('阴性：行内间距不均 ⇒ null 不猜', () => {
    const uneven = { boxes: [
      { x: 0, y: 0, width: 126, height: 30 },
      { x: 146, y: 0, width: 126, height: 30 },
      { x: 400, y: 0, width: 126, height: 30 },
    ] }
    expect(deriveGridColumnsFromBands([uneven])).toBeNull()
  })

  it('阳性：两带并列取大 [3,2] ⇒ 3（末行不满与 [4,2] 同构，不可当噪声丢弃）', () => {
    expect(deriveGridColumnsFromBands([band(3, 0), band(2, 40)])?.count).toBe(3)
  })

  it('阴性：三带互不相同 [2,3,4] ⇒ 无多数 ⇒ null 不猜', () => {
    expect(deriveGridColumnsFromBands([band(2, 0), band(3, 40), band(4, 80)])).toBeNull()
  })

  it('阴性：单个孤立项 ⇒ null（列数无意义）', () => {
    expect(deriveGridColumnsFromBands([band(1, 0)])).toBeNull()
  })

  it('阴性：入参非数组 / 空 ⇒ null', () => {
    expect(deriveGridColumnsFromBands(null as any)).toBeNull()
    expect(deriveGridColumnsFromBands([])).toBeNull()
  })
})

/**
 * 节点适配层：**直接用真机 Figma 几何**（GTcJm0DKQvcJvcOZTh5n1l / node 38:3134）。
 * 三段真实结构：行带 564(4项) / 272(2项) / 418(3项)，背景矩形与 icon 位于同一层。
 */
describe('deriveGridColumnsFromNode（38:3134 真值）', () => {
  const card = (x: number, y: number) => ({ x, y, width: 126, height: 30 })
  const rowBand = (x: number, y: number, n: number) => ({
    x, y, width: n * 126 + (n - 1) * 20, height: 30,
    children: Array.from({ length: n }, (_, i) => card(x + i * 146, y)),
  })
  /** 背景矩形 + icon + 标题 + N 个行带（真实 Figma 同层结构） */
  const section = (bands: Array<{ x: number; y: number; n: number }>) => ({
    x: 26894, y: 51592, width: 604, height: 265,
    children: [
      { x: 26894, y: 51592, width: 604, height: 265 },        // Rectangle 背景
      { x: 26914, y: 51617, width: 16, height: 16 },          // icon
      { x: 26938, y: 51617, width: 64, height: 16 },          // 标题 TEXT
      ...bands.map((b) => rowBand(b.x, b.y, b.n)),
    ],
  })

  it('阳性 38:3206：行带 [4,4,4,3] ⇒ 4 列（不得受背景/icon 干扰）', () => {
    const node = section([
      { x: 26914, y: 52062, n: 4 },
      { x: 26914, y: 52112, n: 4 },
      { x: 26914, y: 52162, n: 4 },
      { x: 26914, y: 52212, n: 3 },
    ])
    const r = deriveGridColumnsFromNode(node)
    expect(r?.count).toBe(4)
    expect(r?.form).toBe('bands')
  })

  it('阳性 38:3137：行带 [4,2] ⇒ 4 列', () => {
    const node = section([
      { x: 26914, y: 51649, n: 4 },
      { x: 26914, y: 51699, n: 2 },
    ])
    expect(deriveGridColumnsFromNode(node)?.count).toBe(4)
  })

  it('阳性形态A：children 本身是并排卡（无行带）⇒ 4 列', () => {
    const node = { children: [0, 1, 2, 3].map((i) => card(26914 + i * 146, 51649)) }
    const r = deriveGridColumnsFromNode(node)
    expect(r?.count).toBe(4)
    expect(r?.form).toBe('single-row')
  })

  it('阴性：行带内部宽度不等（表头+内容混排）⇒ null 不猜', () => {
    const node = { children: [
      { x: 0, y: 0, width: 426, height: 30, children: [
        { x: 0, y: 0, width: 126, height: 30 },
        { x: 146, y: 0, width: 300, height: 30 },
      ] },
    ] }
    expect(deriveGridColumnsFromNode(node)).toBeNull()
  })

  it('阴性：单行带只有 1 项（无法构成列）⇒ null', () => {
    const node = { children: [
      { x: 0, y: 0, width: 126, height: 30, children: [{ x: 0, y: 0, width: 126, height: 30 }] },
    ] }
    expect(deriveGridColumnsFromNode(node)).toBeNull()
  })

  it('阴性：无 children / 子项不足 ⇒ null', () => {
    expect(deriveGridColumnsFromNode({})).toBeNull()
    expect(deriveGridColumnsFromNode(null as any)).toBeNull()
    expect(deriveGridColumnsFromNode({ children: [card(0, 0)] })).toBeNull()
  })
})
