/**
 * F18（2026-10-21）：行内列数/单项尺寸/间距的算术推导。
 *
 * 真实真值（c-c8d-195c8d0e 战略合作厂商区）：`4 × 126 + 3 × 20 = 564 = 604 - 20×2`。
 * 阳性对照用真值数字，阴性对照保证「不均匀/多行/异宽」一律不猜。
 */
import { deriveRowMetrics, columnsFromWidth } from './row-metrics.js'
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
