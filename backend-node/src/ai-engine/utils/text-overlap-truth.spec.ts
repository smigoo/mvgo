/**
 * text-overlap-truth.spec.ts — RUNTIME-016 文本重叠判据（单一事实源）的阴阳对照。
 *
 * 阳（必须豁免，防假阳 · 2026-11-15 探针 5/8 实锤）：
 *   ① 父子：`总数:<span>5</span>`（父容器盒罩住子盒，ratio 恒 ≈1）
 *   ② 真实卡片：label div 内含值 span（工单形态）
 *   ③ 描边立体字：同一文本两层完全重合（ratio = 1）
 *   ④ 同文本 ratio 恰好 0.9（阈值边界内）
 * 阴（必须 BLOCK，防假阴 · 0cce5478 / 6c12ab55 真坍缩）：
 *   ⑤ 两 static 兄弟互压（不同文本）
 *   ⑥ 同文本但只叠 0.53（不是复制层，是错位）
 *   ⑦ 交比恰在阈值下（0.15 不 BLOCK，0.16 BLOCK）
 *   ⑧ 无 ancestors 事实的旧输入 ⇒ 祖先豁免不误触发（fail-open 到旧行为）
 * 形态约束：kept 对象字段必须与旧 evidence 逐字一致（9 字段），下游零改动。
 */
import {
  TEXT_OVERLAP_RATIO_THRESHOLD,
  SAME_TEXT_LAYER_MIN_RATIO,
  overlapRatio,
  isAncestorPair,
  explainStructuralOverlap,
  computeTextOverlaps,
  filterStructuralOverlaps,
  collectTextOverlaps,
} from './text-overlap-truth.js'

type Node = {
  i?: number
  text?: string
  x: number
  y: number
  w: number
  h: number
  fs?: number
  anc?: string
  ancestors?: number[]
  tf?: boolean
  pos?: string
}

const box = (x: number, y: number, w: number, h: number) => [x, y, w, h]

describe('overlapRatio（无量纲交比）', () => {
  it('完全重合 = 1', () => {
    expect(overlapRatio(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBeCloseTo(1)
  })
  it('不相交 = 0', () => {
    expect(overlapRatio(box(0, 0, 10, 10), box(20, 20, 10, 10))).toBe(0)
  })
  it('以较小面积为分母（父子包含 = 1）', () => {
    // 子完全在父内 ⇒ 交面积 = 子面积 ⇒ ratio = 1
    expect(overlapRatio(box(0, 0, 100, 100), box(10, 10, 10, 10))).toBeCloseTo(1)
  })
  it('非法入参 fail-open 到 0（不抛）', () => {
    expect(overlapRatio(null as any, box(0, 0, 1, 1))).toBe(0)
    expect(overlapRatio([0, 0, NaN, 1], box(0, 0, 1, 1))).toBe(0)
  })
})

describe('X1 祖先对（isAncestorPair / explainStructuralOverlap）', () => {
  it('祖先链命中 ⇒ ancestor-pair 豁免', () => {
    const parent: Node = { i: 0, text: '总数:5', x: 0, y: 0, w: 200, h: 40, ancestors: [] }
    const child: Node = { i: 1, text: '5', x: 120, y: 4, w: 12, h: 30, ancestors: [0] }
    expect(isAncestorPair(parent, child)).toBe(true)
    const { overlaps, skipped } = collectTextOverlaps([parent, child])
    expect(overlaps).toHaveLength(0)
    expect(skipped).toEqual([{ a: '总数:5', b: '5', ratio: 1, reason: 'ancestor-pair' }])
  })

  it('真实卡片结构（label div 内含值 span）豁免', () => {
    const nodes: Node[] = [
      { i: 0, text: '异常数:5', x: 0, y: 0, w: 180, h: 26, ancestors: [] },
      { i: 1, text: '5', x: 56, y: 2, w: 12, h: 24, ancestors: [0] },
      { i: 2, text: '统计时间', x: 0, y: 40, w: 80, h: 18, ancestors: [] },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(overlaps).toHaveLength(0)
    expect(skipped.map((s) => s.reason)).toEqual(['ancestor-pair'])
  })

  it('无 ancestors 事实（旧输入）⇒ 不豁免，回落旧行为', () => {
    const nodes: Node[] = [
      { text: '总数:5', x: 0, y: 0, w: 200, h: 40 },
      { text: '5', x: 120, y: 4, w: 12, h: 30 },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps).toHaveLength(1)
  })
})

describe('X3 同文本复制层', () => {
  it('描边立体字（同文本完全重合）⇒ same-text-layer 豁免', () => {
    const nodes: Node[] = [
      { i: 0, text: '22350', x: 0, y: 0, w: 84, h: 40, ancestors: [] },
      { i: 1, text: '22350', x: 0, y: 0, w: 84, h: 40, ancestors: [] },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(overlaps).toHaveLength(0)
    expect(skipped[0].reason).toBe('same-text-layer')
  })

  it('同文本但只叠 53% ⇒ 仍 BLOCK（错位不是复制层）', () => {
    const nodes: Node[] = [
      { i: 0, text: '北京方向', x: 0, y: 0, w: 64, h: 22, ancestors: [] },
      { i: 1, text: '北京方向', x: 30, y: 0, w: 64, h: 22, ancestors: [] },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].ratio).toBe(0.53)
  })

  it('阈值边界：ratio = 0.9 豁免，0.89 不豁免', () => {
    const at = explainStructuralOverlap({ ratio: SAME_TEXT_LAYER_MIN_RATIO, a: 'x', b: 'x' })
    const below = explainStructuralOverlap({ ratio: SAME_TEXT_LAYER_MIN_RATIO - 0.01, a: 'x', b: 'x' })
    expect(at.skip).toBe(true)
    expect(below.skip).toBe(false)
  })

  it('不同文本即使完全重合也不豁免（防假阴回归 0cce5478）', () => {
    const nodes: Node[] = [
      { i: 0, text: '5', x: 310.9, y: 111.7, w: 12, h: 20, ancestors: [] },
      { i: 1, text: '总数:', x: 295.5, y: 114.7, w: 31.7, h: 14, ancestors: [] },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].ratio).toBe(0.7)
    expect(overlaps[0].a).toBe('5')
    expect(overlaps[0].b).toBe('总数:')
  })
})

describe('阴性对照：真排版坍缩必须 BLOCK', () => {
  it('static 兄弟互压（客车 22350 × 隧道大桥）', () => {
    const nodes: Node[] = [
      { i: 0, text: '客车 22350', x: 20, y: 10, w: 85, h: 22, ancestors: [] },
      { i: 1, text: '隧道大桥', x: 30, y: 14, w: 64, h: 22, ancestors: [] },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps[0].ratio).toBe(0.82)
  })

  it('阈值边界：刚好 0.15 不 BLOCK，0.16 BLOCK', () => {
    // 10x10 与 10x10，水平重叠 1px ⇒ 1*10/(100) = 0.1；重叠 2px ⇒ 0.2
    const at = computeTextOverlaps([
      { i: 0, text: 'a', x: 0, y: 0, w: 10, h: 10 },
      { i: 1, text: 'b', x: 8.5, y: 0, w: 10, h: 10 },
    ])
    expect(at).toHaveLength(0) // ratio = 0.15，不大于阈值
    const over = computeTextOverlaps([
      { i: 0, text: 'a', x: 0, y: 0, w: 10, h: 10 },
      { i: 1, text: 'b', x: 8.4, y: 0, w: 10, h: 10 },
    ])
    expect(over).toHaveLength(1)
    expect(TEXT_OVERLAP_RATIO_THRESHOLD).toBe(0.15)
  })
})

describe('X2 变换节点（AABB 假交）', () => {
  it('任一方带 transform ⇒ transformed-geometry 豁免（rotate 轴标签）', () => {
    const nodes: Node[] = [
      { i: 0, text: '2026-11-01', x: 40, y: 40, w: 58, h: 58, ancestors: [], tf: true },
      { i: 1, text: '2026-11-02', x: 62, y: 56, w: 60, h: 60, ancestors: [], tf: true },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(overlaps).toHaveLength(0)
    expect(skipped[0].reason).toBe('transformed-geometry')
  })

  it('只有一方带 transform 也豁免（旋转标签压静态文本 = 视觉不叠）', () => {
    const nodes: Node[] = [
      { i: 0, text: '旋转标签', x: 0, y: 0, w: 80, h: 40, ancestors: [], tf: true },
      { i: 1, text: '静态说明', x: 10, y: 8, w: 80, h: 40, ancestors: [] },
    ]
    const { skipped } = collectTextOverlaps(nodes)
    expect(skipped[0].reason).toBe('transformed-geometry')
  })

  it('transform 缺省（false/undefined）不影响旧行为', () => {
    const nodes: Node[] = [
      { i: 0, text: '客车 22350', x: 20, y: 10, w: 85, h: 22, ancestors: [] },
      { i: 1, text: '隧道大桥', x: 30, y: 14, w: 64, h: 22, ancestors: [], tf: false },
    ]
    const { overlaps, skipped } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps).toHaveLength(1)
  })
})

describe('非 static 定位：只诊断、不豁免', () => {
  it('absolute 对仍 BLOCK（设计叠层与 absolute 堆坍缩几何不可分）', () => {
    const nodes: Node[] = [
      { i: 0, text: '隧道总数', x: 12, y: 26, w: 56, h: 20, ancestors: [], pos: 'absolute' },
      { i: 1, text: 'NEW', x: 14, y: 24, w: 37, h: 18, ancestors: [], pos: 'absolute' },
    ]
    const { overlaps, skipped, positionFacts } = collectTextOverlaps(nodes)
    expect(skipped).toHaveLength(0)
    expect(overlaps).toHaveLength(1)
    expect(positionFacts.total).toBe(1)
    expect(positionFacts.nonStatic).toBe(1)
    expect(positionFacts.samples[0]).toMatchObject({ a: '隧道总数', b: 'NEW', aPos: 'absolute', bPos: 'absolute' })
  })

  it('全 static 对 ⇒ nonStatic=0（诊断不误报）', () => {
    const nodes: Node[] = [
      { i: 0, text: 'a', x: 0, y: 0, w: 10, h: 10, ancestors: [], pos: 'static' },
      { i: 1, text: 'b', x: 2, y: 2, w: 10, h: 10, ancestors: [], pos: 'static' },
    ]
    const { positionFacts } = collectTextOverlaps(nodes)
    expect(positionFacts).toMatchObject({ total: 1, nonStatic: 0 })
  })

  it('已豁免的对不计入定位诊断（只统计仍会 BLOCK 的）', () => {
    const nodes: Node[] = [
      { i: 0, text: '总数:5', x: 0, y: 0, w: 200, h: 40, ancestors: [], pos: 'absolute' },
      { i: 1, text: '5', x: 120, y: 4, w: 12, h: 30, ancestors: [0], pos: 'static' },
    ]
    const { overlaps, positionFacts } = collectTextOverlaps(nodes)
    expect(overlaps).toHaveLength(0)
    expect(positionFacts.total).toBe(0)
  })
})

describe('evidence 形态零漂移（下游 D2 指导/锚点提取依赖）', () => {
  it('kept 对象字段与旧版逐字一致（9 字段，无 nested 泄漏）', () => {
    const { overlaps } = collectTextOverlaps([
      { i: 0, text: 'a', x: 0, y: 0, w: 10, h: 10, fs: 14, anc: 'x < y', ancestors: [] },
      { i: 1, text: 'b', x: 2, y: 2, w: 10, h: 10, fs: 20, anc: 'x < y', ancestors: [] },
    ])
    expect(Object.keys(overlaps[0]).sort()).toEqual(
      ['a', 'b', 'ratio', 'aBox', 'bBox', 'aFs', 'bFs', 'aAnc', 'bAnc'].sort(),
    )
    expect(overlaps[0]).not.toHaveProperty('nested')
    expect(overlaps[0]).not.toHaveProperty('transformed')
    expect(overlaps[0]).not.toHaveProperty('aPos')
    expect(overlaps[0]).not.toHaveProperty('bPos')
  })

  it('filterStructuralOverlaps 保留 skipped 审计信息（reason 可核）', () => {
    const { kept, skipped } = filterStructuralOverlaps([
      { a: '1', b: '1', ratio: 1, nested: false },
      { a: '2', b: '3', ratio: 0.4, nested: false },
      { a: '4', b: '5', ratio: 1, nested: true },
    ])
    expect(kept).toHaveLength(1)
    expect(skipped.map((s) => s.reason)).toEqual(['same-text-layer', 'ancestor-pair'])
  })
})
