/**
 * 刀33（2026-10-29 · mc-max-1793266461373-e7290dc5 实锤）— 折叠产物**形态事实**
 * （`type` / `layout` / `gridColumns`）改由**成员几何方向**决定，数量仅兜底。
 *
 * ## 两个病灶（本 spec 各守一侧）
 *
 *   ① `type` 是纯数量判据：`finalItems.length >= 6 ? 'grid' : 'list'`（全库唯一赋 type 处）
 *      ⇒ 「6 张卡**纵排**成一列」被判成 `grid` ⇒ `section-tree#decideBaseName` 映射
 *      `CardGrid`（多列网格），真值是纵排 `ListSection`。
 *
 *   ② `layout` 是**首卡继承**并且**无人修正**：`buildCollapsedSection` 以 `...first` 展开
 *      ⇒ 折叠段的 `layout` = 首个成员自身的（卡片内部）方向；而唯一会复算容器方向的
 *      `subcomponent-planner#refineDerivedContainerLayout` 开头 `idx.get(String(sec.id))`
 *      —— 折叠段 id 是 `<firstId>-list`（合成 id）查不到 figma 索引 ⇒ 直接 return。
 *      实测：6 张卡纵排的折叠产物 `type:'list'` 却 `layout:'horizontal'` ⇒ 下游
 *      `layout-direction-guard` / `vfor-list-direction-guard` 按 `layout` 把 v-for 外层
 *      强制成 `row` ⇒ **6 卡横向溢出（只见 1 张）**，正是用户报的形态。
 *
 * ## 判据（复用单一来源 `figma-node-layout-facts#decideLayoutForBoxes`，不新增方向判据）
 *   有 bbox（≥2）⇒ grid → `grid`/`grid`/cols；flex → `list` + `horizontal`|`vertical`；
 *   stack（同 bbox 叠层，**方向事实不存在**）⇒ `list` 且**不写 layout**；
 *   无 bbox（vision 手写段 / 合成段）⇒ **保持旧行为**（数量兜底、不动 layout）。
 */

import { collapseSectionsDeep, collapseRepeatedSiblingSections } from '../repeated-section-collapser.js'

function box(w: number, h: number, y = 0, x = 0) {
  return { x, y, width: w, height: h }
}

/** 一张 126×30 卡：带 `layout:'horizontal'`（模拟「首卡内部方向」）与 2 个文本子项 */
function card(id: string, b: any, layout: string | null = 'horizontal') {
  const c: any = {
    id,
    name: 'Frame 2136639903',
    absoluteBoundingBox: b,
    children: [
      { id: `${id}-name`, name: 'Frame 2136639903', text: 'A' },
      { id: `${id}-count`, name: 'Frame 2136639903', text: '1台' },
    ],
  }
  if (layout) c.layout = layout
  return c
}

describe('刀33 折叠产物形态事实（几何优先 / 数量兜底）', () => {
  it('① 阳性：6 张卡**纵排成一列** ⇒ type=list、layout=vertical（旧：grid + 继承 horizontal）', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`v${i}`, box(320, 72, 100 + i * 80, 0)))
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    expect(out).toHaveLength(1)
    const sec = out[0] as any
    expect(sec.itemCount).toBe(6)
    expect(sec.type).toBe('list')
    expect(sec.layout).toBe('vertical')
    // 并集几何仍是全成员并集（刀25 既有行为）
    expect(sec.absoluteBoundingBox).toEqual({ x: 0, y: 100, width: 320, height: 472 })
  })

  it('② 阳性：6 张卡 3 行 × 2 列 ⇒ type=grid、layout=grid、gridColumns=2', () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      card(`g${i}`, box(120, 50, 100 + Math.floor(i / 2) * 60, (i % 2) * 200)),
    )
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    const sec = out[0] as any
    expect(sec.itemCount).toBe(6)
    expect(sec.type).toBe('grid')
    expect(sec.layout).toBe('grid')
    expect(sec.gridColumns).toBe(2)
  })

  it('③ 阳性：12 张卡 3 行 × 4 列（跨层展平路径）⇒ type=grid、gridColumns=4', () => {
    const rows = [0, 1, 2].map((r) => ({
      id: `row${r}`,
      name: `Frame 21366399${r}`,
      absoluteBoundingBox: box(564, 30, 51830 + r * 50, 26914),
      children: Array.from({ length: 4 }, (_, i) =>
        card(`g${r}-${i}`, box(126, 30, 51830 + r * 50, 26914 + i * 146)),
      ),
    }))
    const out = collapseSectionsDeep(rows, { minRepeat: 3 })
    const sec = out[0] as any
    expect(sec.itemCount).toBe(12)
    expect(sec.type).toBe('grid')
    expect(sec.layout).toBe('grid')
    expect(sec.gridColumns).toBe(4)
  })

  it('④ 阳性：6 张卡**横排一行** ⇒ type=list、layout=horizontal（单行不是网格）', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`h${i}`, box(126, 30, 100, i * 146)))
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    const sec = out[0] as any
    expect(sec.itemCount).toBe(6)
    expect(sec.type).toBe('list')
    expect(sec.layout).toBe('horizontal')
  })

  it('⑤ 阳性：6 张卡**同 bbox 叠层** ⇒ type=list 且**不写 layout**（方向事实不存在，不臆造）', () => {
    const same = box(126, 30, 100, 0)
    const cards = Array.from({ length: 6 }, (_, i) => card(`s${i}`, { ...same }))
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    const sec = out[0] as any
    expect(sec.itemCount).toBe(6)
    expect(sec.type).toBe('list')
    // stack ⇒ 无方向事实 ⇒ 保留 `...first` 原值（此处 fixture 传 'horizontal'），不新增臆造方向
    expect(sec.layout).toBe('horizontal')
  })

  it('⑥ 反向（回归）：6 项**无 bbox** ⇒ type 走数量兜底 grid、layout 不被改写', () => {
    const cards = Array.from({ length: 6 }, (_, i) => {
      const c: any = card(`n${i}`, box(126, 30, 100, i * 146), 'horizontal')
      delete c.absoluteBoundingBox
      return c
    })
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    const sec = out[0] as any
    expect(sec.itemCount).toBe(6)
    expect(sec.type).toBe('grid') // 无真值不判方向 ⇒ 旧数量兜底
    expect(sec.layout).toBe('horizontal') // 未写几何事实 ⇒ 保留继承值
  })

  it('⑦ 反向：3 项（< 6）纵排 ⇒ type=list、layout=vertical（数量不参与判定）', () => {
    const cards = Array.from({ length: 3 }, (_, i) => card(`t${i}`, box(320, 72, 100 + i * 80, 0)))
    const out = collapseRepeatedSiblingSections(cards, { minRepeat: 3 })
    expect(out).toHaveLength(1)
    const sec = out[0] as any
    expect(sec.itemCount).toBe(3)
    expect(sec.type).toBe('list')
    expect(sec.layout).toBe('vertical')
  })
})
