/**
 * F1（2026-10-21 · mc-max-1792563165341-e3ab048a 实锤）— 跨层折叠禁令：展平到最内层重复单元。
 *
 * 事故：优质厂商 `38:3162` 真值 = 「3 个行容器 × 每行 4 张 126×30 卡」共 12 张。
 *   `groupSections` 的 ① 精确签名组只比结构签名、不做几何校验，而 `normalizeRepeatName`
 *   把 `Frame 2136639905/906/907` 统一归一成 `frame` ⇒ 3 个**行容器**被当成 3 个重复
 *   卡片折叠成 `38:3167-list`（items = 3 行），产物只剩每行第一张卡 ⇒ 12 → 3。
 *
 * 本 spec 守三条：
 *   ① 阳性：行容器组（每个都是折叠 list）⇒ 展平成 12 项、type=grid、bbox 取并集；
 *   ② 阴性 A：真正的重复卡片（子为文本、未折叠）⇒ 照旧折叠成 1 个 list，12 项不变；
 *   ③ 阴性 B：混合组（1 张含子列表 + 2 张普通卡）⇒ **不展平**，保持 3 项（卡片才是重复单元）。
 */

import {
  collapseSectionsDeep,
  collapseRepeatedSiblingSections,
  flattenNestedCollapsedItems,
  isCollapsedListSection,
} from '../repeated-section-collapser.js'

function box(w: number, h: number, y = 0, x = 0) {
  return { x, y, width: w, height: h }
}

/** 一张 126×30 厂商卡：name + count 两个文本 */
function vendorCard(id: string, name: string, count: string, b: any) {
  return {
    id,
    name: 'Frame 2136639903',
    absoluteBoundingBox: b,
    children: [
      { id: `${id}-name`, name: 'Frame 2136639903', text: name },
      { id: `${id}-count`, name: 'Frame 2136639903', text: count },
    ],
  }
}

/** 一个宽 564 的行容器，含 4 张卡（x 间隔 146） */
function vendorRow(rowId: string, y: number, prefix: string) {
  const cards = Array.from({ length: 4 }, (_, i) =>
    vendorCard(`${rowId}-c${i}`, `${prefix}${i}`, `${i}台`, box(126, 30, y, 26914 + i * 146)),
  )
  return {
    id: rowId,
    name: `Frame 21366399${String(y).slice(-2)}`,
    absoluteBoundingBox: box(564, 30, y, 26914),
    children: cards,
  }
}

/** 三行 = 12 张卡 */
function threeRows() {
  return [
    vendorRow('38:3167', 51830, 'A'),
    vendorRow('38:3180', 51880, 'B'),
    vendorRow('38:3193', 51930, 'C'),
  ]
}

describe('F1 跨层折叠 → 展平到最内层重复单元', () => {
  it('① 阳性：3 个行容器（子已折叠成 list）⇒ 展平成 12 项 grid，不降级成 3 个行 item', () => {
    const out = collapseSectionsDeep(threeRows(), { minRepeat: 3 })
    expect(out).toHaveLength(1)

    const list = out[0]
    expect(isCollapsedListSection(list)).toBe(true)
    // 关键：12 项，而不是 3 项（事故值）
    expect(list.itemCount).toBe(12)
    expect(list.items).toHaveLength(12)
    expect(list.type).toBe('grid')
    // item 模板必须是最内层真实卡片，不是行容器
    expect(list.itemTemplate.id).toBe('38:3167-c0')
    // 展平后 bbox 取三行并集（行高 30 + 2 个 50 行距 = 130），不是单行 30
    expect(list.absoluteBoundingBox).toEqual({ x: 26914, y: 51830, width: 564, height: 130 })
    expect(list.styles.figmaHeightPx).toBe(130)
    // 阅读序：按 y 再 x（行优先），首项是第 1 行第 1 张
    expect(list.items[0].id).toBe('38:3167-c0')
    expect(list.items[11].id).toBe('38:3193-c3')
  })

  it('② 阴性：真正的重复卡片（子为文本、未折叠）⇒ 照旧折叠成 1 个 list，项数不变', () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      vendorCard(`c${i}`, `厂商${i}`, `${i}台`, box(126, 30, 100, i * 146)),
    )
    const out = collapseSectionsDeep(cards, { minRepeat: 3 })
    expect(out).toHaveLength(1)
    expect(out[0].itemCount).toBe(6)
    expect(out[0].items).toHaveLength(6)
    // 未展平 ⇒ 模板就是第一张卡本身
    expect(out[0].itemTemplate.id).toBe('c0')
    // 未展平 ⇒ 不重算 bbox（沿用组内首项）
    expect(out[0].absoluteBoundingBox).toEqual(box(126, 30, 100, 0))
  })

  it('③ 阴性：混合组（1 张含子列表 + 2 张普通卡）⇒ 不展平，保持 3 项', () => {
    // 直接单测防御分支：分组要求结构签名同构 ⇒ 真实数据里混合组极罕见，
    // 用纯函数层覆盖「不得展平」这一侧。
    const subList = collapseRepeatedSiblingSections(vendorRow('r0', 100, 'X').children, {
      minRepeat: 3,
    })[0]
    expect(isCollapsedListSection(subList)).toBe(true)

    const plain1 = vendorCard('p1', 'P1', '1台', box(126, 30, 200, 26914))
    const plain2 = vendorCard('p2', 'P2', '2台', box(126, 30, 300, 26914))

    const res = flattenNestedCollapsedItems([subList, plain1, plain2])
    expect(res.flattened).toBe(false)
    expect(res.items).toHaveLength(3)
    // 对照组：全是「含子列表的行」⇒ 必须展平
    const rows = threeRows().map((r) => ({
      ...r,
      children: collapseRepeatedSiblingSections(r.children, { minRepeat: 3 }),
    }))
    const ok = flattenNestedCollapsedItems(rows)
    expect(ok.flattened).toBe(true)
    expect(ok.items).toHaveLength(12)
  })
})
