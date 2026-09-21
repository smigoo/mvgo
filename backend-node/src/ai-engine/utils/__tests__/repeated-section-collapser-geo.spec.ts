/**
 * 折叠器治本三件套 — 单元测试（2026-09-20）
 *
 * 覆盖：
 * ① 递归折叠：嵌套 children 里的同构项也能折叠（旧实现只扫顶层，E1 后静默失效）
 * ② 几何同构签名：命名不同（1/2/3）、宽度不同（140/120/141）但高度/行/语义槽位一致 → 折叠
 * ③ _vforData：items 每项带 texts/textStyles/resourceFiles（v-for prompt 数据源）
 * + 尺寸门槛：小装饰（icon 内 Rectangle）不折叠；无 box（fixture）放行保持旧行为
 */

import {
  collapseSectionsDeep,
  collapseRepeatedSiblingSections,
  isGeoIsomorphic,
  sectionRepeatSignature,
  isCollapsedListSection,
} from '../repeated-section-collapser.js'

function box(w: number, h: number, y = 0, x = 0) {
  return { x, y, width: w, height: h }
}

/** 造一张同构卡：bg(无文本) + icon + label group(文本) + value group(文本) */
function card(id: string, name: string, b: any, label: string, value: string, color: string, icon: string) {
  return {
    id,
    name,
    absoluteBoundingBox: b,
    // 命名与真实 Figma 一致（bg / icon / Group 2136638xxx）——槽位指纹靠「归一化名+含文本」
    children: [
      { id: `${id}-bg`, name: 'bg' },
      { id: `${id}-icon`, name: 'icon' },
      {
        id: `${id}-labelGroup`,
        name: 'Group 2136639001',
        children: [{ id: `${id}-label`, name: 'label', text: label }],
      },
      {
        id: `${id}-valueGroup`,
        name: 'Group 2136639002',
        children: [
          { id: `${id}-num`, name: 'num', text: value, styles: { color } },
          { id: `${id}-unit`, name: 'unit', text: '次' },
        ],
      },
    ],
  }
}

describe('① 递归折叠（collapseSectionsDeep）', () => {
  test('嵌套 children 内的同构项被折叠（旧实现只扫顶层）', () => {
    const inner = [0, 1, 2, 3].map((i) =>
      card(`c${i}`, `Group 213663859${i}`, box(220, 32, 2282 + i * 46), `标签${i}`, '28%', '#fff', 'icon-1.png'),
    )
    const sections = [
      { id: 'root', name: 'con', children: [{ id: 'col', name: '统计', children: inner }] },
    ]
    const out = collapseSectionsDeep(sections)
    // 顶层未变，但深层出现 collapsed
    const flat: any[] = []
    const walk = (secs: any[]) => {
      for (const s of secs || []) {
        flat.push(s)
        walk(s.children || [])
      }
    }
    walk(out)
    const collapsed = flat.filter((s) => isCollapsedListSection(s))
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].itemCount).toBe(4)
  })
})

describe('② 几何同构签名', () => {
  test('命名不同（1/2/3）+ 宽度不同（140/120/141）+ 高同 + 同行 + 语义槽位一致 → 折叠', () => {
    const cards = [
      card('136:129', '1', box(140, 74, 984, 37), '危化品车', '51', '#ff4d4f', 'icon-8036.png'),
      card('136:128', '2', box(120, 74, 984, 200), '重型货车', '2', '#1890ff', 'icon-8049.png'),
      card('136:127', '3', box(141, 74, 984, 350), '超高车辆', '19', '#fa8c16', 'icon-123.png'),
    ]
    expect(isGeoIsomorphic(cards[0], cards[1])).toBe(true)
    expect(isGeoIsomorphic(cards[0], cards[2])).toBe(true)
    const out = collapseRepeatedSiblingSections(cards)
    expect(out).toHaveLength(1)
    expect(out[0].itemCount).toBe(3)
  })

  test('高度不同 → 不判同构', () => {
    const a = card('a', '1', box(140, 74, 984), 'x', '1', '#fff', 'i.png')
    const b = card('b', '2', box(140, 120, 984), 'x', '1', '#fff', 'i.png')
    expect(isGeoIsomorphic(a, b)).toBe(false)
  })

  test('不同行（y 差 > 4）→ 不判同构', () => {
    const a = card('a', '1', box(140, 74, 984), 'x', '1', '#fff', 'i.png')
    const b = card('b', '2', box(140, 74, 1200), 'x', '1', '#fff', 'i.png')
    expect(isGeoIsomorphic(a, b)).toBe(false)
  })
})

describe('③ _vforData（v-for 数据源）', () => {
  test('折叠产物 items 带 texts/textStyles/resourceFiles', () => {
    const cards = [
      card('136:129', '1', box(140, 74, 984), '危化品车', '51', '#ff4d4f', 'icon-8036.png'),
      card('136:128', '2', box(120, 74, 984), '重型货车', '2', '#1890ff', 'icon-8049.png'),
      card('136:127', '3', box(141, 74, 984), '超高车辆', '19', '#fa8c16', 'icon-123.png'),
    ]
    const out = collapseRepeatedSiblingSections(cards)
    const items = out[0].items as any[]
    expect(items).toHaveLength(3)
    expect(items[0]._vforData.texts).toContain('危化品车')
    expect(items[0]._vforData.texts).toContain('51')
    expect(items[0]._vforData.textStyles).toContain('#ff4d4f')
    // 每项数据独立（不自证同源）
    expect(items[1]._vforData.textStyles).toContain('#1890ff')
    expect(items[2]._vforData.textStyles).toContain('#fa8c16')
  })
})

describe('尺寸门槛', () => {
  test('小装饰（icon 内 Rectangle 级尺寸）不折叠', () => {
    const tiny = [0, 1, 2].map((i) => ({
      id: `r${i}`,
      name: 'Rectangle 26',
      absoluteBoundingBox: box(10, 10, 966, 36 + i * 12),
      children: [{ id: `r${i}-x`, name: 'x' }],
    }))
    const out = collapseSectionsDeep(tiny)
    expect(out.filter(isCollapsedListSection)).toHaveLength(0)
  })

  test('无几何 box（fixture）→ 放行保持旧行为', () => {
    const noBox = [0, 1, 2].map((i) => ({
      id: `n${i}`,
      name: 'Group 2136637' + (100 + i),
      body: { children: [{ role: 'item' }, { role: 'item' }, { role: 'item' }] },
    }))
    const out = collapseRepeatedSiblingSections(noBox)
    expect(out).toHaveLength(1)
    expect((out[0] as any).itemCount).toBe(3)
  })
})

describe('幂等性', () => {
  test('已折叠 section 不再参与下钻（二次调用零变化）', () => {
    const cards = [
      card('c0', 'Group 1', box(220, 32, 100), 'A', '1', '#fff', 'i.png'),
      card('c1', 'Group 2', box(220, 32, 146), 'B', '2', '#fff', 'i.png'),
      card('c2', 'Group 3', box(220, 32, 192), 'C', '3', '#fff', 'i.png'),
    ]
    const once = collapseSectionsDeep(cards)
    const twice = collapseSectionsDeep(once)
    expect((twice[0] as any).itemCount).toBe(3)
    expect(twice).toHaveLength(1)
  })
})

describe('①a 视觉顺序排序（整改 P3）', () => {
  test('横排兄弟 x 倒序（Z 序右→左）→ items 按 x 升序输出', () => {
    // 真实场景：重点车辆 2:8023 三卡，children 数组 Z 序 x=274/166/37
    const cards = [
      card('136:127', '3', box(141, 74, 984, 274), '超高车辆', '19', '#fa8c16', 'icon-123.png'),
      card('136:128', '2', box(120, 74, 984, 166), '重型货车', '2', '#1890ff', 'icon-8049.png'),
      card('136:129', '1', box(140, 74, 984, 37), '危化品车', '51', '#ff4d4f', 'icon-8036.png'),
    ]
    const out = collapseRepeatedSiblingSections(cards) as any[]
    expect(out).toHaveLength(1)
    const texts = out[0].items.map((it: any) => it._vforData.texts[0])
    expect(texts).toEqual(['危化品车', '重型货车', '超高车辆'])
  })

  test('纵排：同名（精确签名组）不同 y → items 按 y 升序输出', () => {
    // 精确签名组（sig 相同）不检查 y，可能混入不同行同名 section → 兜底按 y 排序
    const cards = [
      card('a', 'Group 2136638', box(220, 32, 500), '第三', '3', '#fff', 'i.png'),
      card('b', 'Group 2136638', box(220, 32, 300), '第二', '2', '#fff', 'i.png'),
      card('c', 'Group 2136638', box(220, 32, 100), '第一', '1', '#fff', 'i.png'),
    ]
    const out = collapseRepeatedSiblingSections(cards) as any[]
    expect(out).toHaveLength(1)
    const texts = out[0].items.map((it: any) => it._vforData.texts[0])
    expect(texts).toEqual(['第一', '第二', '第三'])
  })

  test('无 box 或 box 不全 → 保持原序（不排序，不破坏回归）', () => {
    const noBox = [0, 1, 2].map((i) => ({
      id: `n${i}`,
      name: 'Group 2136637' + (100 + i),
      body: { children: [{ role: 'item', text: String(i) }] },
    }))
    const out = collapseRepeatedSiblingSections(noBox) as any[]
    expect(out).toHaveLength(1)
    const texts = out[0].items.map((it: any) => it._vforData.texts[0])
    expect(texts).toEqual(['0', '1', '2'])
  })
})

describe('①b chart 容器豁免（整改 P8，防御项）', () => {
  test('chart 类型容器内部不下钻折叠', () => {
    const ellipses = [0, 1, 2].map((i) => ({
      id: `e${i}`,
      name: 'Ellipse 10',
      absoluteBoundingBox: box(60, 60, 900, 100 + i * 70),
      children: [{ id: `e${i}-x`, name: 'x' }],
    }))
    const sections = [
      {
        id: '2:1289',
        name: '@eachrts/环形图',
        type: 'chart',
        children: ellipses,
      },
    ]
    const out = collapseSectionsDeep(sections) as any[]
    expect(out).toHaveLength(1)
    // chart 内部 Ellipse 未被折叠成 list（children 仍是 3 个原 Ellipse）
    expect(out[0].children).toHaveLength(3)
    expect(out[0].children.every((c: any) => !isCollapsedListSection(c))).toBe(true)
  })

  test('非 chart 容器不受影响（防御不误伤）', () => {
    const inner = [0, 1, 2].map((i) =>
      card(`c${i}`, `Group 213663859${i}`, box(220, 32, 100 + i * 46), `标签${i}`, '28%', '#fff', 'icon-1.png'),
    )
    const sections = [
      { id: 'root', name: 'con', children: [{ id: 'col', name: '统计', children: inner }] },
    ]
    const out = collapseSectionsDeep(sections) as any[]
    const flat: any[] = []
    const walk = (secs: any[]) => {
      for (const s of secs || []) {
        flat.push(s)
        walk(s.children || [])
      }
    }
    walk(out)
    expect(flat.filter((s) => isCollapsedListSection(s))).toHaveLength(1)
  })
})
