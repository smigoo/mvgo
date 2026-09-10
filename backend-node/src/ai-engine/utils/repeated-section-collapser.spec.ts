import {
  collapseRepeatedSiblingSections,
  isCollapsedListSection,
  normalizeRepeatName,
  sectionRepeatSignature,
} from './repeated-section-collapser.js'

function card(id: string, groupNo: string) {
  return {
    id,
    name: `Group ${groupNo}`,
    role: 'inline-row',
    body: {
      children: [
        { id: `${id}-a`, role: 'item' },
        { id: `${id}-b`, role: 'item' },
        { id: `${id}-c`, role: 'item' },
      ],
    },
  }
}

function deco(id: string) {
  return {
    id,
    name: 'Group 1321317970',
    role: 'inline-row',
    body: {
      children: [
        { id: `${id}-a`, role: 'item' },
        { id: `${id}-b`, role: 'item' },
      ],
    },
  }
}

describe('collapseRepeatedSiblingSections', () => {
  it('normalize：Group/Frame 编号与 figma id 不进签名', () => {
    expect(normalizeRepeatName('Group 2136637321')).toBe('group')
    expect(normalizeRepeatName('Group 1321317970')).toBe('group')
    expect(normalizeRepeatName('Frame 2136638825')).toBe('frame')
    expect(normalizeRepeatName('2:8438')).toBe('figma-node')
    expect(normalizeRepeatName('header-stats')).toBe('header-stats')
  })

  it('同构卡签名相同、卡与装饰签名不同', () => {
    const a = sectionRepeatSignature(card('2:8438', '2136637321'))
    const b = sectionRepeatSignature(card('2:8467', '2136637552'))
    const d = sectionRepeatSignature(deco('2:8459'))
    expect(a).toBe(b)
    expect(a).not.toBe(d)
  })

  it('device 形态：12 卡 + 12 装饰交错 → 1 个 grid，itemCount=12，装饰并入 item.deco', () => {
    const chrome = [
      { id: 'header-stats', name: '顶部统计区', body: { children: [{ role: 'statistic' }] } },
      { id: 'content-area', name: '主内容区', body: { children: [{ role: 'sidebar' }, { role: 'body' }] } },
      { id: '89:37', name: '@antd/tab', body: { children: [{ role: 'tab' }, { role: 'panel' }] } },
    ]
    const pair: any[] = []
    for (let i = 0; i < 12; i++) {
      pair.push(card(`card-${i}`, `2136637${100 + i}`))
      pair.push(deco(`deco-${i}`))
    }
    const out = collapseRepeatedSiblingSections([...chrome, ...pair])
    const lists = out.filter((s) => isCollapsedListSection(s))
    expect(lists).toHaveLength(1)
    expect(lists[0].type).toBe('grid')
    expect(lists[0].itemCount).toBe(12)
    expect(lists[0].items).toHaveLength(12)
    expect(lists[0].items[0].deco).toBeTruthy()
    expect(out.map((s) => s.id)).toEqual([
      'header-stats',
      'content-area',
      '89:37',
      'card-0-list',
    ])
  })

  it('仅 2 个同构兄弟 → 不折叠', () => {
    const sections = [
      { id: 'h', name: 'header', body: { children: [] } },
      card('c1', '1'),
      card('c2', '2'),
    ]
    const out = collapseRepeatedSiblingSections(sections)
    expect(out).toHaveLength(3)
    expect(out.every((s) => !s.collapsed)).toBe(true)
  })

  it('3 个同构 Frame → 1 个 list（不并入无关 chrome）', () => {
    const mkFrame = (id: string, n: number) => ({
      id,
      name: `Frame ${n}`,
      body: {
        children: [
          { role: 'label' },
          { role: 'value' },
        ],
      },
    })
    const out = collapseRepeatedSiblingSections([
      { id: 'header-stats', name: '顶部统计区', body: { children: [{ role: 'statistic' }] } },
      mkFrame('f1', 2136638825),
      mkFrame('f2', 2136638826),
      mkFrame('f3', 2136638827),
    ])
    expect(out).toHaveLength(2)
    expect(out[1].type).toBe('list')
    expect(out[1].itemCount).toBe(3)
    expect(out[0].id).toBe('header-stats')
  })
})
