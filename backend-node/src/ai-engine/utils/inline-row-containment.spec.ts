/**
 * F17（2026-10-21）：inline-row 成员 bbox 包含去重。
 *
 * 真实事故 mc-max-1792497064987-195c8d0e「合作厂商弹窗」：
 * Vision 把「两张统计卡 + 各自卡内的标题/数字」6 个节点报成同一行成员
 * ⇒ merger 原样拍平成 6 个平级 item ⇒「卡」这一层消失，`33`/`合作厂商` 变成卡的兄弟。
 *
 * 本 spec 的阳性对照即该真实几何；阴性对照保证不误伤「真正的并排 chip 行」。
 */
import {
  mergeInlineRowsIntoSections,
  groupRowMembersByContainment,
} from './inline-row-merger.js'

type Box = { x: number; y: number; width?: number; height?: number; w?: number; h?: number }

/** 真实结构（真实 figma bbox，已归一化为相对坐标；宽高一致） */
const REAL_BOXES: Record<string, Box> = {
  // 卡1 = bg(265×76) + icon；标题/数字是它的**兄弟**
  '38:3260': { x: 6, y: 0, width: 265, height: 76 },
  '38:3262': { x: 103, y: 38.9, width: 28, height: 28 }, // 「33」
  '38:3263': { x: 103.7, y: 13, width: 64, height: 24 }, // 「合作厂商」
  // 卡2
  '38:3282': { x: 335, y: 0, width: 265, height: 76 },
  '38:3284': { x: 432, y: 38.9, width: 28, height: 28 }, // 「66」
  '38:3285': { x: 432.7, y: 13, width: 64, height: 24 }, // 「在线设备」
}

const boxOfReal = (id: string): Box | null => REAL_BOXES[id] || null

/** 真实文案（Figma TEXT.characters）—— 用于验证「被吸入的子项文案拼进父 name」 */
const REAL_TEXTS: Record<string, string> = {
  '38:3262': '33',
  '38:3263': '合作厂商',
  '38:3284': '66',
  '38:3285': '在线设备',
}

function row(members: string[], id = '796:3') {
  return { id, name: 'slot-icon', layout: 'horizontal', members }
}

/** 构造 figma 树：root → 一或多个「行容器」→ members（members 需存在的 bbox 节点） */
function figmaTree(rows: Array<{ id: string; members: string[] }>, boxes: Record<string, Box>) {
  return {
    id: '38:3134',
    name: 'root',
    type: 'FRAME',
    children: rows.map((r) => ({
      id: r.id,
      name: r.id,
      type: 'GROUP',
      children: r.members.map((m) => ({
        id: m,
        name: m,
        type: REAL_TEXTS[m] ? 'TEXT' : 'FRAME',
        ...(REAL_TEXTS[m] ? { characters: REAL_TEXTS[m] } : {}),
        absoluteBoundingBox: boxes[m] as any,
      })),
    })),
  }
}

describe('groupRowMembersByContainment', () => {
  it('阳性对照：真实 6 成员收敛为 2 张卡，文本降为卡内子项', () => {
    const out = groupRowMembersByContainment(
      ['38:3260', '38:3262', '38:3263', '38:3282', '38:3284', '38:3285'],
      boxOfReal,
    )
    expect(out.roots).toEqual(['38:3260', '38:3282'])
    expect(out.childrenOf.get('38:3260')).toEqual(['38:3262', '38:3263'])
    expect(out.childrenOf.get('38:3282')).toEqual(['38:3284', '38:3285'])
  })

  it('阴性对照：真正并排的 4 个 chip 不被合并', () => {
    const chips: Record<string, Box> = {
      a: { x: 0, y: 0, width: 126, height: 30 },
      b: { x: 146, y: 0, width: 126, height: 30 },
      c: { x: 292, y: 0, width: 126, height: 30 },
      d: { x: 438, y: 0, width: 126, height: 30 },
    }
    const out = groupRowMembersByContainment(['a', 'b', 'c', 'd'], (id) => chips[id])
    expect(out.roots).toEqual(['a', 'b', 'c', 'd'])
    expect(out.childrenOf.size).toBe(0)
  })

  it('阴性对照：部分重叠（越界 20px）不算包含', () => {
    const boxes: Record<string, Box> = {
      a: { x: 0, y: 0, width: 265, height: 76 },
      b: { x: 200, y: 0, width: 126, height: 30 }, // 右缘 326 > 265
    }
    const out = groupRowMembersByContainment(['a', 'b'], (id) => boxes[id])
    expect(out.roots).toEqual(['a', 'b'])
  })

  it('传递关系：A⊃B⊃C ⇒ 逐级挂靠，不并成一层', () => {
    const boxes: Record<string, Box> = {
      A: { x: 0, y: 0, width: 600, height: 400 },
      B: { x: 10, y: 10, width: 300, height: 200 },
      C: { x: 20, y: 20, width: 100, height: 50 },
    }
    const out = groupRowMembersByContainment(['A', 'B', 'C'], (id) => boxes[id])
    expect(out.roots).toEqual(['A'])
    expect(out.childrenOf.get('A')).toEqual(['B'])
    expect(out.childrenOf.get('B')).toEqual(['C'])
  })

  it('面积并列歧义 ⇒ 放弃该成员的去重（宁可漏并不误并）', () => {
    const boxes: Record<string, Box> = {
      A: { x: 0, y: 0, width: 300, height: 300 },
      B: { x: 0, y: 0, width: 300, height: 300 }, // 与 A 同面积
      C: { x: 10, y: 10, width: 50, height: 50 },
    }
    const out = groupRowMembersByContainment(['A', 'B', 'C'], (id) => boxes[id])
    expect(out.roots).toContain('C') // 不能把 C 判给任一方
    expect(out.childrenOf.get('A')).toBeUndefined()
    expect(out.childrenOf.get('B')).toBeUndefined()
  })

  it('bbox 双口径：{w,h} 与 {width,height} 都必须能判出包含', () => {
    const boxes: Record<string, Box> = {
      outer: { x: 0, y: 0, w: 265, h: 76 },
      inner: { x: 100, y: 10, width: 64, height: 24 },
    }
    const out = groupRowMembersByContainment(['outer', 'inner'], (id) => boxes[id])
    expect(out.roots).toEqual(['outer'])
    expect(out.childrenOf.get('outer')).toEqual(['inner'])
  })

  it('容差 2px：越界 1px 仍算包含，越界 5px 不算', () => {
    const inside1: Record<string, Box> = {
      o: { x: 0, y: 0, width: 100, height: 100 },
      i: { x: -1, y: 0, width: 50, height: 50 },
    }
    expect(
      groupRowMembersByContainment(['o', 'i'], (id) => inside1[id]).roots,
    ).toEqual(['o'])
    const outside5: Record<string, Box> = {
      o: { x: 0, y: 0, width: 100, height: 100 },
      i: { x: -5, y: 0, width: 50, height: 50 },
    }
    expect(
      groupRowMembersByContainment(['o', 'i'], (id) => outside5[id]).roots,
    ).toEqual(['o', 'i'])
  })

  it('无 bbox 的成员保持为根（不猜）', () => {
    const out = groupRowMembersByContainment(['a', 'b'], () => null)
    expect(out.roots).toEqual(['a', 'b'])
    expect(out.childrenOf.size).toBe(0)
  })
})

describe('mergeInlineRowsIntoSections + F17', () => {
  it('阳性对照：行块只产出 2 个 item，每个 item 带 2 个子项', () => {
    const layout = { type: 'vertical-stack', direction: 'vertical', sections: [] as any[] }
    const tree = figmaTree([{ id: '796:3', members: Object.keys(REAL_BOXES) }], REAL_BOXES)
    const out: any = mergeInlineRowsIntoSections(
      layout,
      [row(Object.keys(REAL_BOXES))],
      tree,
    )
    const block = out.sections.find((s: any) => s.id === '796:3')
    expect(block).toBeTruthy()
    expect(block.children).toHaveLength(2)
    expect(block.children[0].children).toHaveLength(2)
    expect(block.children[1].children).toHaveLength(2)
    // 卡内文本必须出现在 name 里（覆盖度判据靠 name 子串命中）
    expect(String(block.children[0].name)).toContain('合作厂商')
    expect(String(block.children[0].name)).toContain('33')
  })

  it('阴性对照：4 chip 行保持 4 个 item、无 children', () => {
    const boxes: Record<string, Box> = {
      a: { x: 0, y: 0, width: 126, height: 30 },
      b: { x: 146, y: 0, width: 126, height: 30 },
      c: { x: 292, y: 0, width: 126, height: 30 },
      d: { x: 438, y: 0, width: 126, height: 30 },
    }
    const layout = { type: 'vertical-stack', direction: 'vertical', sections: [] as any[] }
    const out: any = mergeInlineRowsIntoSections(
      layout,
      [row(['a', 'b', 'c', 'd'], '55:1')],
      figmaTree([{ id: '55:1', members: ['a', 'b', 'c', 'd'] }], boxes),
    )
    const block = out.sections.find((s: any) => s.id === '55:1')
    expect(block.children).toHaveLength(4)
    expect(block.children.every((c: any) => !c.children)).toBe(true)
  })

  it('收敛后只剩 1 项 ⇒ 该行不产出扁平块（交回 E1）', () => {
    const boxes: Record<string, Box> = {
      card: { x: 0, y: 0, width: 265, height: 76 },
      t1: { x: 100, y: 10, width: 64, height: 24 },
      t2: { x: 100, y: 40, width: 28, height: 28 },
    }
    const layout = { type: 'vertical-stack', direction: 'vertical', sections: [] as any[] }
    const out: any = mergeInlineRowsIntoSections(
      layout,
      [row(['card', 't1', 't2'], '11:1')],
      figmaTree([{ id: '11:1', members: ['card', 't1', 't2'] }], boxes),
    )
    expect(out.sections.find((s: any) => s.id === '11:1')).toBeUndefined()
  })
})
