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

// ── 🛡️ 刀72-B（2026-11-06 · mc-max-1793909345196-e0deef47「依旧多份」实锤）────────
//   ③ 内容同构组：vision 顶层段（无内联 box、items 形态、段名各异、条目数各异）
//   对①②判据系统性失明。逐项 canonicalListItem 归一签名 + 几何同方向 + 数量≥2。
describe('刀72-B：③ 内容同构组（vision 顶层并列段折叠）', () => {
  // 统计卡（items 形态）：label+value 平铺角色数组（刀71 修复后归一 texts:1/stats:1）
  const statCard = (label, value, id) => ({
    id,
    name: label,
    body: {
      items: [{
        id,
        layout: 'horizontal',
        content: { elements: [
          { type: 'label', text: label },
          { type: 'value', parts: [{ type: 'number', text: value }] },
        ] },
      }],
    },
  })
  // 分组列表段（children 形态，条目数可不同）
  const groupSection = (name, id, n) => ({
    id,
    name,
    body: {
      children: Array.from({ length: n }, (_, k) => ({
        id: `${id}-item${k}`,
        content: { elements: [
          { type: 'label', text: `厂商${k}` },
          { type: 'label', text: `地址${k}` },
        ] },
      })),
    },
  })
  // figmaRoot 提供纵排 box（geoBoxWithRoot 兜底）：同 x、y 递增、等宽
  const figmaRoot = {
    id: '0:1', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 1000 },
    children: [
      { id: '38:3260', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 90 } },
      { id: '38:3282', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 100, width: 400, height: 90 } },
      { id: '38:3137', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 200, width: 400, height: 200 } },
      { id: '38:3162', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 410, width: 400, height: 300 } },
      { id: '38:3206', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 720, width: 400, height: 400 } },
    ],
  }

  test('阳性1：2 张纵排统计卡（items 形态无内联 box）⇒ 折叠成 1 段、items=2 卡', () => {
    const out = collapseRepeatedSiblingSections(
      [statCard('合作厂商', '33', '38:3260'), statCard('在线设备', '66', '38:3282')],
      { figmaRoot },
    )
    expect(out).toHaveLength(1)
    expect(out[0].collapsed).toBe(true)
    expect(out[0].items).toHaveLength(2)
  })

  test('阳性2：3 个厂商分组（children=6/12/15 条目数不同）⇒ 折叠成 1 段、条目并集', () => {
    const out = collapseRepeatedSiblingSections(
      [groupSection('战略合作厂商', '38:3137', 6), groupSection('优质厂商', '38:3162', 12), groupSection('普通厂商', '38:3206', 15)],
      { figmaRoot },
    )
    expect(out).toHaveLength(1)
    expect(out[0].collapsed).toBe(true)
    expect(out[0].items).toHaveLength(33) // 6+12+15 条目级拍平
  })

  test('阴性1：异构段（texts/stats 签名不同）⇒ 不折', () => {
    const a = statCard('合作厂商', '33', '38:3260')
    const b = groupSection('优质厂商', '38:3162', 12) // 结构不同（texts:2/stats:0 vs texts:1/stats:1）
    const out = collapseRepeatedSiblingSections([a, b], { figmaRoot })
    expect(out).toHaveLength(2)
  })

  test('阴性2：归一为空的段 ⇒ 不折（fail-open 防内容塌陷）', () => {
    const empty = { id: '38:3137', name: '空段', body: { children: [{ id: 'x1' }] } }
    const empty2 = { id: '38:3162', name: '空段2', body: { children: [{ id: 'x2' }] } }
    const out = collapseRepeatedSiblingSections([empty, empty2], { figmaRoot })
    expect(out).toHaveLength(2)
  })

  test('阴性3：无 figmaRoot（无几何证据）⇒ 不折（fail-open）', () => {
    const out = collapseRepeatedSiblingSections(
      [statCard('合作厂商', '33', '38:3260'), statCard('在线设备', '66', '38:3282')],
      {},
    )
    expect(out).toHaveLength(2)
  })

  test('阴性4：尺寸门槛外的小装饰（sizeGate 拒绝）⇒ 不折', () => {
    const out = collapseRepeatedSiblingSections(
      [statCard('合作厂商', '33', '38:3260'), statCard('在线设备', '66', '38:3282')],
      { figmaRoot, _sizeGate: () => false },
    )
    expect(out).toHaveLength(2)
  })
})
