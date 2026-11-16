/**
 * 🛡️ R3-2（2026-11-16）：`layoutMode` 声明与几何实测的对账（AL reconcile）。
 *
 * 背景（`docs/2026-11-14-布局真值整治方案.md` R3）：
 *   设计稿的 `layoutMode` 不可信 —— 真机 `2:3660` 标 HORIZONTAL 但子项重叠（gap −72），
 *   `88:32` 未标却是一行。整治方案定的规则是「几何优先，声明只作交叉验证」，
 *   但 `figma-node-layout-facts#buildNodeLayoutFacts`（B'）当时仍留「有声明就是 high、
 *   几何完全不参与」的旧分支 ⇒ 同一节点两套裁决，planner 与 validator 可以得出相反方向。
 *
 * 本 spec 锁三件事：
 *   ① 阳性：声明与几何冲突 ⇒ 几何胜 + `alConflict` 留痕（B'）/ `modeConflict`（S1）；
 *   ② 阴性：两源一致时输出**逐字不变**（零回归）；
 *   ③ 污染源：绝对定位子项、非容器类型带声明，都不得影响裁决。
 */
import { buildNodeLayoutFacts } from '../figma-node-layout-facts.js'
import { inferLayoutFacts, inferLayoutFactsForContainer } from '../layout-geom-facts.js'
import {
  filterLayoutChildren,
  resolveDeclaredAutoLayout,
  LAYOUT_AL_STAT_KEYS,
} from '../layout-child-filter.js'

function box(x: number, y: number, w: number, h: number) {
  return { x, y, width: w, height: h }
}
function child(id: string, x: number, y: number, w: number, h: number, extra: Record<string, any> = {}) {
  return { id, type: 'FRAME', absoluteBoundingBox: box(x, y, w, h), ...extra }
}

describe('layout-child-filter — 声明定性', () => {
  it('FRAME + HORIZONTAL ⇒ 声明成立（valid，dir=row）', () => {
    const al = resolveDeclaredAutoLayout({ type: 'FRAME', layoutMode: 'HORIZONTAL' })
    expect(al).toMatchObject({ declared: true, dir: 'row', valid: true, reason: 'ok' })
  })

  it('GROUP + HORIZONTAL ⇒ 声明作废（Figma 里 GROUP 不可能有 AL）', () => {
    const al = resolveDeclaredAutoLayout({ type: 'GROUP', layoutMode: 'HORIZONTAL' })
    expect(al).toMatchObject({ declared: true, valid: false, reason: 'non-container-type:GROUP' })
  })

  it('layoutMode=NONE / 缺失 ⇒ 未声明', () => {
    expect(resolveDeclaredAutoLayout({ type: 'FRAME', layoutMode: 'NONE' }).declared).toBe(false)
    expect(resolveDeclaredAutoLayout({ type: 'FRAME' }).declared).toBe(false)
  })

  it('绝对定位子项被剔除，flow 子项保留', () => {
    const parent = {
      id: 'p',
      children: [
        child('a', 0, 0, 50, 50),
        child('abs', 10, 0, 10, 50, { layoutPositioning: 'ABSOLUTE' }),
        child('b', 50, 0, 50, 50),
      ],
    }
    const out = filterLayoutChildren(parent)
    expect(out.children.map((c: any) => c.id)).toEqual(['a', 'b'])
    expect(out.absoluteSkipped).toBe(1)
  })
})

describe('buildNodeLayoutFacts — R3 AL 对账', () => {
  it('① 阳性：声明 HORIZONTAL 但子项纵向堆叠 ⇒ 几何胜（column）+ alConflict 留痕', () => {
    const stats: Record<string, number> = {}
    const node = {
      id: '9:1',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      absoluteBoundingBox: box(0, 0, 200, 200),
      children: [child('9:2', 0, 0, 50, 50), child('9:3', 0, 100, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node, { stats })
    expect(facts['9:1']).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      alConflict: true,
      alDeclared: 'row',
      alSource: 'HORIZONTAL',
    })
    expect(facts['9:1'].source).not.toBe('figma-layoutMode')
    expect(stats.alConflict).toBe(1)
    expect(stats.alDeclared).toBe(1)
  })

  it('② 阴性对照：声明 VERTICAL 且几何同为纵向 ⇒ 输出逐字不变（零回归）', () => {
    const node = {
      id: '9:10',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      absoluteBoundingBox: box(0, 0, 200, 200),
      children: [child('9:11', 0, 0, 100, 40), child('9:12', 0, 60, 100, 40)],
    }
    const stats: Record<string, number> = {}
    const facts = buildNodeLayoutFacts(node, { stats })
    expect(facts['9:10']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
    expect(stats.alAgree).toBe(1)
    expect(stats.alConflict).toBe(0)
  })

  it('③ 绝对定位浮层不得造出假冲突：剔掉后仍是一行 ⇒ 采信声明 row', () => {
    const stats: Record<string, number> = {}
    const node = {
      id: '9:20',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      absoluteBoundingBox: box(0, 0, 200, 200),
      children: [
        child('9:21', 0, 0, 50, 50),
        // 浮层：压在 a/b 之间，未剔除时会把 side-by-side 比例拉到 1/3 ⇒ 误判 column
        child('9:22', 20, 0, 10, 50, { layoutPositioning: 'ABSOLUTE' }),
        child('9:23', 50, 0, 50, 50),
      ],
    }
    const facts = buildNodeLayoutFacts(node, { stats })
    expect(facts['9:20']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
    expect(stats.absoluteSkipped).toBe(1)
    expect(stats.alConflict).toBe(0)
  })

  it('④ GROUP 带 layoutMode ⇒ 声明作废，走几何，且计 alInvalid', () => {
    const stats: Record<string, number> = {}
    const node = {
      id: '9:30',
      type: 'GROUP',
      layoutMode: 'VERTICAL',
      absoluteBoundingBox: box(0, 0, 200, 200),
      children: [child('9:31', 0, 0, 50, 50), child('9:32', 100, 0, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node, { stats })
    expect(facts['9:30']).toMatchObject({ display: 'flex', flexDirection: 'row' })
    expect(facts['9:30'].source).toBe('geometric-inference')
    expect(facts['9:30'].alConflict).toBeUndefined()
    expect(stats.alInvalid).toBe(1)
  })

  it('⑤ 声明存在但子项不足以测几何（单子项）⇒ al-only，置信度降级为 low', () => {
    const node = {
      id: '9:40',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      absoluteBoundingBox: box(0, 0, 200, 200),
      children: [child('9:41', 0, 0, 200, 200)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['9:40']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'al-only',
      confidence: 'low',
    })
  })

  it('⑥ 计数键 0 也打：无声明文件也得有全集键', () => {
    const stats: Record<string, number> = {}
    buildNodeLayoutFacts({ id: '0:0', children: [child('1:1', 0, 0, 10, 10)] }, { stats })
    for (const k of LAYOUT_AL_STAT_KEYS) {
      expect(stats[k]).toBe(0)
    }
  })
})

describe('inferLayoutFacts — 与 B′ 同口径（声明只作交叉验证）', () => {
  const container = () => ({
    id: '2:3660',
    name: '1统计',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    absoluteBoundingBox: box(0, 0, 400, 300),
    children: [child('a', 0, 0, 380, 100), child('b', 0, 120, 380, 100)],
  })

  it('① 声明 HORIZONTAL 但子项纵向 ⇒ modeConflict + alAgree=false，方向仍按几何 column', () => {
    const f = inferLayoutFactsForContainer(container())
    expect(f.mode).toBe('column')
    expect(f.modeConflict).toBe(true)
    expect(f.alAgree).toBe(false)
    expect(f.alDeclared).toBe('row')
  })

  it('② 两侧计数可观测：alDeclared / alAgree / alInvalid / absoluteSkipped 均初始化', () => {
    const stats: Record<string, number> = {}
    const tree = {
      document: {
        id: 'root',
        children: [container()],
      },
    }
    inferLayoutFacts(tree, stats)
    expect(stats.alDeclared).toBe(1)
    expect(stats.modeConflict).toBe(1)
    expect(stats.alAgree).toBe(0)
    expect(stats.alInvalid).toBe(0)
    expect(stats.absoluteSkipped).toBe(0)
  })

  it('③ 非容器类型带声明 ⇒ 不参与对账（alInvalid），不算冲突', () => {
    const tree = {
      document: {
        id: 'root',
        children: [
          {
            id: 'g:1',
            type: 'GROUP',
            layoutMode: 'VERTICAL',
            absoluteBoundingBox: box(0, 0, 400, 300),
            children: [child('x', 0, 0, 100, 50), child('y', 200, 0, 100, 50)],
          },
        ],
      },
    }
    const stats: Record<string, number> = {}
    const facts = inferLayoutFacts(tree, stats)
    expect(facts['g:1'].mode).toBe('row')
    expect(facts['g:1'].modeConflict).toBeUndefined()
    expect(facts['g:1'].alInvalid).toBe(true)
    expect(stats.alInvalid).toBe(1)
  })
})
