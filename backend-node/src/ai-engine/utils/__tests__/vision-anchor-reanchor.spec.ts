/**
 * 🛡️ P0-E（2026-11-09 · mc-max-1794210168571-8ebb795b 实锤）：vision 锚点错位
 * 「内容唯一命中重锚」。守四条：
 *   ① 阳性：错锚文案全树唯一命中 ⇒ 重锚到命中节点（对账转绿）；
 *   ② 阴性：文案多命中（重复文案）⇒ 不猜、保持原样；
 *   ③ 阴性：文案零命中 ⇒ 不动；
 *   ④ 幂等：重锚后再跑 relinked=0。
 * 与 R25-a 裁决的关系：否定按序重贴；本函数走内容唯一命中（叶子限定），不猜纪律保留。
 */
import {
  auditContentAnchorConsistency,
  reanchorMisalignedDeclaredTexts,
} from '../vision-content-anchor-consistency.js'

const FIGMA = {
  children: [
    {
      id: '9:1',
      type: 'FRAME',
      children: [
        {
          id: '2:7890',
          type: 'VECTOR',
          children: [{ id: '2:7891', type: 'VECTOR' }],
        },
        { id: '2:7892', type: 'TEXT', characters: '一氧化碳' },
        { id: '2:7897', type: 'TEXT', characters: '能见度' },
        { id: '2:7893', type: 'TEXT', characters: '洞内照明' },
        { id: '2:7894', type: 'TEXT', characters: '洞外光强' },
        // 多命中素材：同一文案出现两处
        { id: '2:7901', type: 'TEXT', characters: '江阴大桥' },
        { id: '2:7902', type: 'TEXT', characters: '江阴大桥' },
      ],
    },
  ],
}

const mkSections = () => [
  {
    id: '89:42',
    children: [
      { id: '2:7890', text: '一氧化碳' }, // 锚到 VECTOR（真值无文本）→ 唯一命中 2:7892
      { id: '2:7891', text: '能见度' }, // → 2:7897
      { id: '2:7901', text: '江阴大桥' }, // 多命中 → 不猜
      { id: '2:7999', text: '不存在的文案' }, // 零命中 → 不动
    ],
  },
]

it('① 阳性：错锚唯一命中 ⇒ 重锚且对账转绿', () => {
  const sections = mkSections()
  const before = auditContentAnchorConsistency({ sections, figmaNodeData: FIGMA })
  expect(before.mismatched).toBeGreaterThan(0)
  const r = reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA })
  expect(r.relinked).toEqual([
    { oldId: '2:7890', newId: '2:7892', text: '一氧化碳' },
    { oldId: '2:7891', newId: '2:7897', text: '能见度' },
  ])
  const after = auditContentAnchorConsistency({ sections, figmaNodeData: FIGMA })
  expect(after.mismatched).toBe(0)
})

it('② 阴性：多命中（重复文案）⇒ 不猜、保持原样', () => {
  const sections = mkSections()
  reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA })
  const dup = sections[0].children.find((c) => c.id === '2:7901')
  expect(dup.id).toBe('2:7901') // 未被重锚到 2:7902
})

it('③ 阴性：零命中文案 ⇒ 不动', () => {
  const sections = mkSections()
  reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA })
  const miss = sections[0].children.find((c) => c.id === '2:7999')
  expect(miss.id).toBe('2:7999')
})

it('④ 幂等：重锚后再跑 relinked=0', () => {
  const sections = mkSections()
  reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA })
  const r2 = reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA })
  expect(r2.relinked).toHaveLength(0)
})

// 🛡️ P0-E 加强（2026-11-09 · a9052d6a 跨 id 段跳变实锤）：同容器（LCA ≤1 容差）校验
describe('P0-E 加强：重锚同容器校验', () => {
  // 树形态：9:1 下有近端 TEXT 2:8001（洞内温度）、VECTOR 容器 2:8002（声明锚素材）、
  // 远端深容器 20:1 > 20:2 > 20:3（TEXT 洞外遥测）。
  // ⚠️ 文案设计约束：互不为子串（uniqueHitFor 是「chars.includes(text)」跨条计数）
  const FIGMA_CROSS = {
    children: [
      {
        id: '9:1',
        type: 'FRAME',
        children: [
          { id: '2:8001', type: 'TEXT', characters: '洞内温度' },
          {
            id: '2:8002',
            type: 'VECTOR',
            children: [{ id: '2:8003', type: 'VECTOR' }],
          },
          {
            id: '20:1', // 远端容器（深层）
            type: 'FRAME',
            children: [
              {
                id: '20:2',
                type: 'FRAME',
                children: [{ id: '20:3', type: 'TEXT', characters: '洞外遥测' }],
              },
            ],
          },
        ],
      },
    ],
  }

  it('⑤ 同容器平移：parentId 相同 ⇒ 重锚（8ebb795b 形态）', () => {
    const sections = [
      {
        id: '89:1',
        children: [
          // 声明挂 2:8002（VECTOR 容器锚），文案命中同父 TEXT 2:8001 ⇒ 同容器平移
          { id: '2:8002', text: '洞内温度' },
        ],
      },
    ]
    const r = reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA_CROSS })
    expect(r.relinked).toEqual([{ oldId: '2:8002', newId: '2:8001', text: '洞内温度' }])
    expect(r.relinkSkipped).toEqual([])
  })

  it('⑥ 跨容器（真跨 id 段）：远端深容器命中 ⇒ relinkSkipped 不猜', () => {
    const sections = [
      {
        id: '89:1',
        children: [
          // 声明挂 2:8002（父 9:1），文案唯一命中远端 20:3（父 20:2，隔两层）
          { id: '2:8002', text: '洞外遥测' },
        ],
      },
    ]
    const r = reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA_CROSS })
    expect(r.relinked).toEqual([])
    expect(r.relinkSkipped).toEqual([
      { oldId: '2:8002', hitId: '20:3', text: '洞外遥测', reason: 'cross-container' },
    ])
    // 原 id 保持不动
    expect(sections[0].children[0].id).toBe('2:8002')
  })

  it('⑦ LCA 容差 1 级：原锚父链一级内含命中父 ⇒ 重锚（容器锚→兄弟文本锚）', () => {
    const sections = [
      {
        id: '89:1',
        children: [
          // 声明挂 2:8003（2:8002 内装饰叶子），文案命中 2:8001（父 9:1）。
          // oldParent=2:8002，hitParent=9:1；withinTolerance：父链 [2:8002, 9:1] 含 9:1 ⇒ 放行
          { id: '2:8003', text: '洞内温度' },
        ],
      },
    ]
    const r = reanchorMisalignedDeclaredTexts({ sections, figmaNodeData: FIGMA_CROSS })
    expect(r.relinked).toEqual([{ oldId: '2:8003', newId: '2:8001', text: '洞内温度' }])
  })
})
