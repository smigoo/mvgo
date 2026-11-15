/**
 * P0-6 段内容项节点真实性校准 —— 单测。
 *
 * 判据来源：mc-max-1794719857954-049e54f6「当日总流量」真机实锤：
 *   vision 的 body.items 指向段外标题文字 `2:3560` 与图标方块 `2:3562`，
 *   真内容容器是 `1744:126 cards`（子节点 128×52 / 131×52 并排）。
 */
import { auditSectionItemsTruth, repairSectionItemsTruth } from './section-items-truth.js'

const box = (x: number, y: number, width: number, height: number) => ({
  absoluteBoundingBox: { x, y, width, height },
})

const text = (id: string, name: string, chars: string, b: any, style: any, color?: string) => ({
  id,
  name,
  type: 'TEXT',
  characters: chars,
  ...b,
  style,
  fills: color ? [{ type: 'SOLID', visible: true, color: hexToRgb(color) }] : [],
})

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

/** 与真机同构的最小树：段 2:3660 → bg 层 + cards 层 → 两张卡 */
function buildFigma() {
  return {
    document: {
      id: 'root',
      children: [
        // 段外：标题文字 + 图标（vision 误指的节点）
        {
          id: '2:3559',
          name: 'header',
          type: 'FRAME',
          children: [
            text('2:3560', '当日总流量', '当日总流量', box(57.8, 161.8, 80, 24.3), {
              fontSize: 24,
              fontWeight: 500,
            }, '#333333'),
            {
              id: '2:3562',
              name: 'icon',
              type: 'GROUP',
              ...box(35.8, 164.9, 18, 18.3),
              children: [],
            },
          ],
        },
        {
          id: '2:3660',
          name: '1统计',
          type: 'FRAME',
          ...box(10, 196, 425.8, 91.4),
          children: [
            {
              id: '88:34',
              name: 'bg-[m]',
              type: 'FRAME',
              ...box(10, 196, 425.8, 91.4),
              children: [{ id: '2:3661', name: 'Group', type: 'GROUP', ...box(10, 196, 425.8, 91.4), children: [] }],
            },
            {
              id: '1744:126',
              name: 'cards',
              type: 'FRAME',
              ...box(43, 215.7, 359, 52),
              children: [
                {
                  id: '2:3683',
                  name: 'Group',
                  type: 'GROUP',
                  ...box(43, 215.7, 128, 52),
                  children: [
                    text('2:3685', 't-江阴靖江长江隧道', '江阴靖江长江隧道', box(43, 215.7, 128, 24), {
                      fontSize: 16,
                      fontWeight: 500,
                    }, '#333333'),
                    text('2:3684', 'd-34,620', '34,620', box(94, 239.7, 77, 28), {
                      fontSize: 24,
                      fontWeight: 900,
                    }, '#006fe3'),
                  ],
                },
                {
                  id: '2:3680',
                  name: 'Group',
                  type: 'GROUP',
                  ...box(271, 215.7, 131, 52),
                  children: [
                    text('2:3681', 't-江阴大桥', '江阴大桥', box(271, 215.7, 108.9, 24), {
                      fontSize: 16,
                      fontWeight: 500,
                    }, '#333333'),
                    text('2:3682', 'd-82,379', '82,379', box(271, 239.7, 131, 28), {
                      fontSize: 24,
                      fontWeight: 900,
                    }, '#0c9dbe'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

const visionWithBadItems = () => ({
  layoutStructure: {
    layout: {
      sections: [
        {
          id: '2:3660',
          figmaNodeId: '2:3660',
          name: '当日总流量',
          body: {
            layout: 'horizontal-2-columns',
            items: [
              { id: '2:3560', name: '江阴靖江长江隧道', role: 'stat-card', repeatedFill: '#0d2a4a' },
              { id: '2:3562', name: '江阴大桥', role: 'stat-card', repeatedFill: '#0d2a4a' },
            ],
          },
        },
      ],
    },
  },
})

describe('section-items-truth · 阳性：段外 id 必被重建', () => {
  test('items 指向段外节点 ⇒ 用 cards 组重建，取值全部来自 Figma 真值', () => {
    const vision = visionWithBadItems()
    const stats: any = {}
    repairSectionItemsTruth(vision, buildFigma(), stats)
    const items = (vision as any).layoutStructure.layout.sections[0].body.items
    expect(items).toHaveLength(2)
    expect(items.map((i: any) => i.id)).toEqual(['2:3683', '2:3680'])
    // 数值 / 标签 / 字号 / 字重 / 颜色 均为真值
    expect(items[0].stats[0].value).toBe('34,620')
    expect(items[0].stats[0].styles.fontSize).toBe(24)
    expect(items[0].stats[0].styles.fontWeight).toBe('900')
    expect(items[0].stats[0].styles.color).toBe('#006fe3')
    expect(items[0].texts[0].text).toBe('江阴靖江长江隧道')
    expect(items[0].texts[0].styles.fontSize).toBe(16)
    expect(items[0].texts[0].styles.color).toBe('#333333')
    expect(items[1].stats[0].styles.color).toBe('#0c9dbe')
    // 臆造的深蓝底必须消失（卡片自身无 SOLID fill）
    expect(items[0].repeatedFill).toBeNull()
    expect(items[1].repeatedFill).toBeNull()
    // 高度取真实卡盒，且同款卡等权
    expect(items[0].styles.figmaHeightPx).toBe(52)
    expect(items[1].styles.figmaHeightPx).toBe(52)
    expect(items[0].styles.flexGrow).toBe(1)
    expect(items[1].styles.flexGrow).toBe(1)
    expect(stats.violated).toBe(1)
    expect(stats.rebuilt).toBe(1)
    expect(stats.itemsRebuilt).toBe(2)
  })

  test('并排卡 ⇒ body.layout 归一为 horizontal-N-columns', () => {
    const vision = visionWithBadItems()
    repairSectionItemsTruth(vision, buildFigma())
    expect((vision as any).layoutStructure.layout.sections[0].body.layout).toBe('horizontal-2-columns')
  })

  test('item 落在子树内但是 TEXT ⇒ 同样判违规并重建', () => {
    const vision: any = visionWithBadItems()
    vision.layoutStructure.layout.sections[0].body.items = [
      { id: '2:3685', name: 'x', role: 'stat-card' },
      { id: '2:3681', name: 'y', role: 'stat-card' },
    ]
    const stats: any = {}
    repairSectionItemsTruth(vision, buildFigma(), stats)
    expect(stats.violated).toBe(1)
    expect(vision.layoutStructure.layout.sections[0].body.items.map((i: any) => i.id)).toEqual([
      '2:3683',
      '2:3680',
    ])
  })
})

describe('section-items-truth · 阳性（策略 2）：跨容器等高卡片', () => {
  /** 6 张 126×30 的卡被拆进 2 个行容器（4+2），段 subtree 内无任何单容器有 6 个直接子节点 */
  function buildGridFigma() {
    const card = (id: string, x: number, y: number, n: number) => ({
      id,
      name: 'Frame 21',
      type: 'FRAME',
      ...box(x, y, 126, 30),
      children: [
        text(`${id}-t`, 't', `厂商${n}`, box(x, y, 126, 14), { fontSize: 12, fontWeight: 400 }, '#333333'),
        text(`${id}-d`, 'd', `${n}000`, box(x + 60, y, 60, 14), { fontSize: 12, fontWeight: 700 }, '#006fe3'),
      ],
    })
    const row = (rid: string, y: number, cards: any[]) => ({
      id: rid,
      name: 'row',
      type: 'FRAME',
      ...box(20, y, 564, 30),
      children: cards,
    })
    return {
      document: {
        id: 'root',
        children: [
          {
            id: '38:3137',
            name: '战略合作厂商',
            type: 'GROUP',
            ...box(20, 500, 604, 161),
            children: [
              { id: '38:3138', name: 'bg', type: 'RECTANGLE', ...box(20, 500, 604, 161), children: [] },
              text('38:3139', 'title', '战略合作厂商', box(40, 510, 96, 16), { fontSize: 14 }, '#ffffff'),
              row('38:3140', 520, [
                card('c1', 40, 520, 1),
                card('c2', 180, 520, 2),
                card('c3', 320, 520, 3),
                card('c4', 460, 520, 4),
              ]),
              row('38:3153', 560, [card('c5', 40, 560, 5), card('c6', 180, 560, 6)]),
            ],
          },
        ],
      },
    }
  }

  test('6 卡跨 2 行容器 ⇒ 按等高聚类重建 6 项', () => {
    const vision: any = {
      layout: {
        sections: [
          {
            id: '38:3137',
            figmaNodeId: '38:3137',
            body: {
              items: [1, 2, 3, 4, 5, 6].map(() => ({ id: '', role: 'stat-card' })),
            },
          },
        ],
      },
    }
    const stats: any = {}
    repairSectionItemsTruth(vision, buildGridFigma(), stats)
    const items = vision.layout.sections[0].body.items
    expect(items).toHaveLength(6)
    expect(items.map((i: any) => i.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(items[0].texts[0].text).toBe('厂商1')
    expect(items[0].stats[0].value).toBe('1000')
    expect(stats.rebuilt).toBe(1)
    expect(stats.itemsRebuilt).toBe(6)
  })
})

describe('section-items-truth · 阴性：不该动的绝不改', () => {
  test('items id 本就合法 ⇒ 幂等，字段逐字不变', () => {
    const good = {
      layoutStructure: {
        layout: {
          sections: [
            {
              id: '2:3660',
              figmaNodeId: '2:3660',
              body: {
                layout: 'horizontal-2-columns',
                items: [
                  { id: '2:3683', repeatedFill: '#006fe3', name: 'keep' },
                  { id: '2:3680', repeatedFill: null, name: 'keep2' },
                ],
              },
            },
          ],
        },
      },
    }
    const snapshot = JSON.stringify(good)
    const stats: any = {}
    repairSectionItemsTruth(good, buildFigma(), stats)
    expect(stats.violated).toBeUndefined()
    expect(stats.rebuilt).toBeUndefined()
    // 唯一允许的变化：V3 清空「无真值来源」的 fill（#006fe3 在 2:3683 子树内确实存在 ⇒ 保留）
    expect(JSON.stringify(good)).toBe(snapshot)
  })

  test('段无 figmaNodeId ⇒ 完全不动', () => {
    const vision: any = {
      layout: { sections: [{ id: 'x', body: { items: [{ id: '2:3560' }] } }] },
    }
    const before = JSON.stringify(vision)
    const stats: any = {}
    repairSectionItemsTruth(vision, buildFigma(), stats)
    expect(stats.audited).toBeUndefined()
    expect(JSON.stringify(vision)).toBe(before)
  })

  test('声明的项数与真值卡数不符且无从聚类 ⇒ unresolved，items 原样保留', () => {
    const fig = buildFigma()
    const vision = visionWithBadItems()
    // 声明 5 项，但真值里只有 2 张卡 ⇒ 无合法重建来源
    ;(vision as any).layoutStructure.layout.sections[0].body.items = [
      { id: '2:3560' },
      { id: '2:3562' },
      { id: 'x3' },
      { id: 'x4' },
      { id: 'x5' },
    ]
    const before = JSON.stringify((vision as any).layoutStructure.layout.sections[0].body.items)
    const stats: any = {}
    repairSectionItemsTruth(vision, fig, stats)
    expect(stats.violated).toBe(1)
    expect(stats.unresolved).toBe(1)
    expect(stats.rebuilt).toBeUndefined()
    expect(JSON.stringify((vision as any).layoutStructure.layout.sections[0].body.items)).toBe(before)
  })

  test('无 figmaData ⇒ 不动', () => {
    const vision = visionWithBadItems()
    const before = JSON.stringify(vision)
    repairSectionItemsTruth(vision, null as any)
    expect(JSON.stringify(vision)).toBe(before)
  })
})

describe('section-items-truth · V3 臆造 fill 清除', () => {
  test('items 合法但 repeatedFill 在子树内无对应 SOLID ⇒ 清空并计数', () => {
    const vision: any = {
      layout: {
        sections: [
          {
            id: '2:3660',
            figmaNodeId: '2:3660',
            body: {
              items: [
                { id: '2:3683', repeatedFill: '#0d2a4a' },
                { id: '2:3680', repeatedFill: '#0c9dbe' },
              ],
            },
          },
        ],
      },
    }
    const stats: any = {}
    repairSectionItemsTruth(vision, buildFigma(), stats)
    expect(vision.layout.sections[0].body.items[0].repeatedFill).toBeNull() // 臆造
    expect(vision.layout.sections[0].body.items[1].repeatedFill).toBe('#0c9dbe') // 真值保留
    expect(stats.fillCleared).toBe(1)
  })
})

describe('section-items-truth · audit 只诊断', () => {
  test('报告段子树外的 items，不修改入参', () => {
    const vision = visionWithBadItems()
    const before = JSON.stringify(vision)
    const report = auditSectionItemsTruth(vision as any, buildFigma())
    expect(report).toHaveLength(1)
    expect(report[0].violations.map((v: any) => v.reason)).toEqual([
      'outside-section-subtree',
      'outside-section-subtree',
    ])
    expect(JSON.stringify(vision)).toBe(before)
  })
})
