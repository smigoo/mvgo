/**
 * 🛡️ A 层：并列分组守卫（2026-11-12 · mc-1794428749650-cc633474 实锤）
 *
 * 事故：三张分组卡（161/212/265 高、标题「战略合作厂商/优质厂商/普通厂商」、
 * 各自 icon + 独立底框）被 ③ 组条目级拍平成 1 段 33 条 ⇒ 产物只剩一个组标题、
 * 33 条平铺 5 列、另两组底框与行列语义全丢。
 *
 * 守卫判据：组内每段都有 header.title 且两两不同 ⇒ 并列分组，禁止跨段合并。
 * 命中 = 不折（阳性）；不命中形态必须仍按刀72-B 折叠（阴性，防回潮）。
 */
import { collapseRepeatedSiblingSections } from './repeated-section-collapser.js'

type Sec = Record<string, any>

/** 分组卡段：与真实数据同形（header.title + body.children 条目 + 底框） */
function groupCard(title: string, id: string, n: number, bg = 'rgba(0,0,0,0.2)'): Sec {
  return {
    id,
    name: `Group ${id}`,
    header: { title, figmaNode: `${id}-title` },
    body: {
      layout: 'grid',
      gridColumns: 4,
      bgColor: bg,
      children: Array.from({ length: n }, (_, k) => ({
        id: `${id}-item${k}`,
        name: `厂商${k}`,
        content: {
          elements: [
            { type: 'label', text: `厂商${k}` },
            { type: 'label', text: `${k}台` },
          ],
        },
      })),
    },
  }
}

/** 三段真实 box：同 x、y 递增、等宽 604、高度各异（161/212/265） */
const figmaRoot = {
  id: '0:1',
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 },
  children: [
    { id: '38:3137', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 161 } },
    { id: '38:3162', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 181, width: 604, height: 212 } },
    { id: '38:3206', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 413, width: 604, height: 265 } },
  ],
}

describe('A 层 · 并列分组守卫', () => {
  test('阳性1：三组各带互不相同标题 ⇒ 不折，保留 3 段与各自标题', () => {
    const out = collapseRepeatedSiblingSections(
      [
        groupCard('战略合作厂商', '38:3137', 6, 'rgba(226,208,132,0.2)'),
        groupCard('优质厂商', '38:3162', 12, 'rgba(216,255,233,0.32)'),
        groupCard('普通厂商', '38:3206', 15, 'rgba(244,254,255,0.35)'),
      ],
      { figmaRoot },
    )
    expect(out).toHaveLength(3)
    expect(out.map((s) => s.header?.title)).toEqual([
      '战略合作厂商',
      '优质厂商',
      '普通厂商',
    ])
    // 每段条目数保持自己的行数，不被拍平
    expect(out.map((s) => (s.body?.children || s.body?.items || []).length)).toEqual([6, 12, 15])
    expect(out.every((s) => !s.collapsed)).toBe(true)
  })

  test('阳性2：守卫命中时回调留痕（分组标题 + id）', () => {
    const seen: any[] = []
    collapseRepeatedSiblingSections(
      [groupCard('甲组', 'a', 4), groupCard('乙组', 'b', 5)],
      { figmaRoot, onConserveGroup: (info: any) => seen.push(info) },
    )
    expect(seen).toHaveLength(1)
    expect(seen[0].titles).toEqual(['甲组', '乙组'])
  })

  // ── 阴性对照：以下形态必须仍按刀72-B 折叠，不得因本守卫放宽而回潮 ──────────
  test('阴性1：无 header.title 的 vision 碎段（刀72-B 原场景）⇒ 仍折成 1 段、条目并集', () => {
    const bare = (name: string, id: string, n: number): Sec => ({
      id,
      name,
      body: {
        children: Array.from({ length: n }, (_, k) => ({
          id: `${id}-item${k}`,
          content: {
            elements: [
              { type: 'label', text: `厂商${k}` },
              { type: 'label', text: `地址${k}` },
            ],
          },
        })),
      },
    })
    const out = collapseRepeatedSiblingSections(
      [bare('战略合作厂商', '38:3137', 6), bare('优质厂商', '38:3162', 12), bare('普通厂商', '38:3206', 15)],
      { figmaRoot },
    )
    expect(out).toHaveLength(1)
    expect(out[0].collapsed).toBe(true)
    expect(out[0].items).toHaveLength(33)
  })

  test('阴性2：标题全相同的重复实例卡（12 张「设备监测」）⇒ 仍折', () => {
    const cards = Array.from({ length: 4 }, (_, k) =>
      groupCard('设备监测', `d${k}`, 3),
    )
    const out = collapseRepeatedSiblingSections(cards, {
      figmaRoot: {
        id: '0:1',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 1200 },
        children: cards.map((c, k) => ({
          id: c.id,
          type: 'GROUP',
          absoluteBoundingBox: { x: 0, y: k * 120, width: 400, height: 100 },
        })),
      },
    })
    expect(out).toHaveLength(1)
    expect(out[0].collapsed).toBe(true)
  })

  test('阴性3：部分段有标题、部分无 ⇒ fail-open 仍折（不新增拒绝面）', () => {
    const withTitle = groupCard('甲组', '38:3137', 4)
    const bare: Sec = {
      id: '38:3162',
      name: '乙组',
      body: { children: [{ id: 'b1', content: { elements: [{ type: 'label', text: 'x1' }, { type: 'label', text: 'y1' }] } }] },
    }
    const out = collapseRepeatedSiblingSections([withTitle, bare], { figmaRoot })
    expect(out).toHaveLength(1)
    expect(out[0].collapsed).toBe(true)
  })

  test('阴性4：单段内条目仍按段内折叠（守卫只拦跨段）', () => {
    const single = groupCard('战略合作厂商', '38:3137', 6)
    const out = collapseRepeatedSiblingSections([single], { figmaRoot })
    expect(out).toHaveLength(1)
  })
})
