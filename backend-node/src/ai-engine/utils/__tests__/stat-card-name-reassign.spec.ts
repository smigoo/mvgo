/**
 * F1 · stat-card name 按 Figma 宿主 id 幂等回填 —— 判据 spec
 *
 * 阳性：E2 错位版（136:129 name=超高车辆 / 136:127 name=危化品车）⇒ 回填为子树真值 label。
 * 阴性：① 已正确 ⇒ 零改动（中间卡 136:128 与全正确版）；
 *       ② 归属正确但带后缀（'危化品车卡片'）⇒ 不误改；
 *       ③ 幂等（跑两次第二次 reassigned=0）；
 *       ④ fail-open（无真值树 / id 不在树 / 子树无文本）。
 */

import { reassignStatCardNames } from '../stat-card-name-reassign.js'

// ── fixture：E2「重点车辆监测」三卡真值（取自 c-vehicle-monitor-0dce5e24 实测坐标/字号）──
function t(id: string, characters: string, y: number, fontSize: number) {
  return {
    id,
    name: 't',
    type: 'TEXT',
    characters,
    style: { fontSize, fontWeight: 400 },
    absoluteBoundingBox: { x: 88, y, width: 40, height: 14 },
  }
}
function card(id: string, children: any[]) {
  return { id, name: '1', type: 'FRAME', children }
}
const figma = {
  document: {
    id: '0:0',
    name: 'root',
    type: 'FRAME',
    children: [
      card('136:129', [t('2:8042', '危化品车', 1009.3, 12.32), t('2:8043', '51', 1028.5, 20), t('2:8044', '次', 1030.4, 12.32)]),
      card('136:128', [t('2:8045', '重型货车', 1009.2, 12.32), t('2:8046', '2', 1028.5, 20), t('2:8047', '次', 1030.3, 12.32)]),
      card('136:127', [t('2:8048', '超高车辆', 1009.2, 12.32), t('2:8049', '19', 1028.5, 20), t('2:8050', '次', 1030.3, 12.32)]),
    ],
  },
}
const mkSections = (names: [string, string, string]) => [
  { id: '136:129', role: 'stat-card', name: names[0] },
  { id: '136:128', role: 'stat-card', name: names[1] },
  { id: '136:127', role: 'stat-card', name: names[2] },
]

describe('F1 reassignStatCardNames · stat-card name 宿主回填', () => {
  test('阳性：E2 错位版 ⇒ 首尾两卡回填为子树真值 label，中间卡零改动', () => {
    const sections = mkSections(['超高车辆', '重型货车', '危化品车'])
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3)
    expect(r.reassigned).toBe(2)
    expect(sections[0].name).toBe('危化品车')
    expect(sections[0].nameReassignedFrom).toBe('超高车辆')
    expect(sections[1].name).toBe('重型货车') // 归属正确 ⇒ 不动
    expect(sections[1].nameReassignedFrom).toBeUndefined()
    expect(sections[2].name).toBe('超高车辆')
    expect(sections[2].nameReassignedFrom).toBe('危化品车')
    expect(r.details).toEqual([
      { id: '136:129', from: '超高车辆', to: '危化品车', copies: 1 },
      { id: '136:127', from: '危化品车', to: '超高车辆', copies: 1 },
    ])
  })

  test('阴性①：三卡 name 全正确 ⇒ 零改动', () => {
    const sections = mkSections(['危化品车', '重型货车', '超高车辆'])
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3)
    expect(r.reassigned).toBe(0)
    expect(sections.map((s) => s.name)).toEqual(['危化品车', '重型货车', '超高车辆'])
  })

  test('阴性②：归属正确但带后缀（危化品车卡片）⇒ 不误改', () => {
    const sections = mkSections(['危化品车卡片', '重型货车卡片', '超高车辆卡片'])
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.reassigned).toBe(0)
    expect(r.skipped).toBe(3)
    expect(sections.map((s) => s.name)).toEqual(['危化品车卡片', '重型货车卡片', '超高车辆卡片'])
  })

  test('阴性③：幂等 —— 跑两次，第二次 reassigned=0', () => {
    const sections = mkSections(['超高车辆', '重型货车', '危化品车'])
    reassignStatCardNames({ sections, figmaNodeData: figma })
    const r2 = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r2.reassigned).toBe(0)
    expect(sections.map((s) => s.name)).toEqual(['危化品车', '重型货车', '超高车辆'])
  })

  test('阴性④：fail-open —— 无真值树 / 无 sections / id 不在树 / 子树无文本', () => {
    const s1 = mkSections(['超高车辆', '重型货车', '危化品车'])
    expect(reassignStatCardNames({ sections: s1, figmaNodeData: null }).examined).toBe(0)
    expect(reassignStatCardNames({ sections: [], figmaNodeData: figma }).examined).toBe(0)
    // id 不在真值树 ⇒ 子树空 ⇒ skipped，零改动
    const s2 = [{ id: '999:999', role: 'stat-card', name: '超高车辆' }]
    const r = reassignStatCardNames({ sections: s2, figmaNodeData: figma })
    expect(r.examined).toBe(1)
    expect(r.skipped).toBe(1)
    expect(s2[0].name).toBe('超高车辆')
  })

  test('嵌套：卡在 children 内（sections[1].children）同样被收集', () => {
    const sections = [
      { id: '136:121', role: 'content-container', name: '统计卡片区', children: mkSections(['超高车辆', '重型货车', '危化品车']) },
    ]
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3)
    expect(r.reassigned).toBe(2)
  })

  // 🔴 E2 真实形态（vision 原生）：`136:121 统计卡片区` → `body.items[136:127,128,129]`
  test('真实形态：卡在 body.items 内（vision 原生下发命名）同样被收集', () => {
    const sections = [
      {
        id: '136:121',
        role: '常驻',
        name: '统计卡片区',
        body: { layout: 'horizontal-3-items', items: mkSections(['超高车辆', '重型货车', '危化品车']) },
      },
    ]
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3)
    expect(r.reassigned).toBe(2)
    expect(r.details).toEqual([
      { id: '136:129', from: '超高车辆', to: '危化品车', copies: 1 },
      { id: '136:127', from: '危化品车', to: '超高车辆', copies: 1 },
    ])
  })

  // `body.children` 是 `body.items` 的同义字段名（section-tree.js:1478-1479 既有澄清）
  test('同义形态：卡在 body.children 内同样被收集', () => {
    const sections = [
      { id: '136:121', role: '常驻', name: '统计卡片区', body: { children: mkSections(['超高车辆', '重型货车', '危化品车']) } },
    ]
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3)
    expect(r.reassigned).toBe(2)
  })

  // 🔴 同义双写（实测 084e8c19：sections[1] 同时挂 .children 与 body.children，
  //    两份为 JSON 独立副本）⇒ examined 按 id 去重不虚高，但**两份副本都要回填**。
  test('同义双写：同一批卡双挂在 .children 与 body.children ⇒ 计数去重、副本全覆盖', () => {
    const mk = () => mkSections(['超高车辆', '重型货车', '危化品车'])
    const copyA = mk()
    const copyB = mk()
    const sections = [{ id: '136:121', role: '常驻', name: '统计卡片区', children: copyA, body: { children: copyB } }]
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(3) // 不是 6
    expect(r.reassigned).toBe(2) // 不是 4
    // 两份副本都被改对
    expect(copyA.map((s) => s.name)).toEqual(['危化品车', '重型货车', '超高车辆'])
    expect(copyB.map((s) => s.name)).toEqual(['危化品车', '重型货车', '超高车辆'])
    // 明细里 copies=2
    expect(r.details.every((d) => d.copies === 2)).toBe(true)
  })

  test('非目标角色（role=chart / 无 role）不参与', () => {
    const sections = [
      { id: '136:129', role: 'chart', name: '超高车辆' },
      { id: '136:127', name: '危化品车' },
    ]
    const r = reassignStatCardNames({ sections, figmaNodeData: figma })
    expect(r.examined).toBe(0)
    expect(sections.map((s) => s.name)).toEqual(['超高车辆', '危化品车'])
  })
})
