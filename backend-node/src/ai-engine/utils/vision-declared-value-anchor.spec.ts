/**
 * P0（2026-11-15 · mc-max-1794747724143-89b32111「流量监测」实锤）：
 * 「声明值 ↔ 引用节点子树真值」归属判据 + R2 拒修的阴阳对照。
 *
 * 阴性（真错必须 FAIL）：vision 把 34,620 / 82,379 挂到 5cards 内两个椭圆
 *   （子树 0 个 TEXT/CHARACTER）⇒ 判据报 mismatch 且 blocked，R2 不得重锚。
 * 阳性（不误伤）：正常 stat-card / 纯图段 / text 型条目 / OCR 误读 / 幻影 id /
 *   declaredContent 形态，以及既有 R2 修复能力本身。
 *
 * 判据与验证刻意不同源：本 spec 用独立字面量构造真值树与期望值，不 import 判据的
 *   任何内部正则/归一化函数（改的人 = 验的人同正则 = 假绿）。
 */
import { auditDeclaredValueAnchors } from './vision-content-anchor-consistency.js'
import { auditSectionAnchors, emptyAnchorStats } from './section-anchor-truth.js'

/** 真值：2:3684/2:3682 是 cards 里的数字 TEXT；2:3456/2:3457 是 5cards 里的纯椭圆 */
function makeFigma(extraTexts?: any[]) {
  return {
    id: '0:1',
    name: 'root',
    type: 'FRAME',
    children: [
      { id: '2:3439', name: '4sub-header', type: 'GROUP', children: [] },
      {
        id: '1744:126',
        name: 'cards',
        type: 'FRAME',
        children: [
          {
            id: '2:3684',
            name: '34,620',
            type: 'TEXT',
            characters: '34,620',
            style: { fontSize: 24 },
            absoluteBoundingBox: { x: 10, y: 240, width: 80, height: 24 },
          },
          {
            id: '2:3682',
            name: '82,379',
            type: 'TEXT',
            characters: '82,379',
            style: { fontSize: 24 },
            absoluteBoundingBox: { x: 110, y: 240, width: 80, height: 24 },
          },
          {
            id: '2:3463',
            name: 'd',
            type: 'TEXT',
            characters: '22350',
            absoluteBoundingBox: { x: 210, y: 240, width: 60, height: 24 },
          },
          ...(extraTexts || []),
        ],
      },
      {
        id: '1263:38',
        name: '5cards',
        type: 'FRAME',
        children: [
          {
            id: '2:3456',
            name: 'Ellipse 94',
            type: 'ELLIPSE',
            absoluteBoundingBox: { x: 10, y: 650, width: 20, height: 20 },
          },
          {
            id: '2:3457',
            name: 'Ellipse 4699',
            type: 'ELLIPSE',
            absoluteBoundingBox: { x: 40, y: 650, width: 20, height: 20 },
          },
        ],
      },
    ],
  }
}

function hallucinatedSections() {
  return [
    {
      id: '2:3439',
      name: '当日总流量',
      body: {
        children: [
          { id: '2:3456', role: 'stat-card', value: '34,620' },
          { id: '2:3457', role: 'stat-card', value: '82,379' },
        ],
      },
    },
  ]
}

describe('P0 声明值-锚点归属判据（阴性：结构矛盾必 FAIL）', () => {
  it('椭圆节点声明数字卡 ⇒ mismatch + blockedRefIds', () => {
    const r = auditDeclaredValueAnchors({
      sections: hallucinatedSections(),
      figmaNodeData: makeFigma(),
    })
    expect(r.skipped).toBe(false)
    expect(r.evaluated).toBe(2)
    expect(r.matched).toBe(0)
    expect(r.mismatched).toBe(2)
    expect(r.notInTree).toBe(0)
    expect(r.blockedRefs).toBe(2)
    expect([...r.blockedRefIds].sort()).toEqual(['2:3456', '2:3457'])
    expect(r.issues[0].blocksReanchor).toBe(true)
    expect(r.issues[0].reason).toContain('无任何 TEXT/CHARACTER')
  })

  it('R2 消费 blockedRefIds ⇒ 拒绝 LCA 重锚，figmaAnchorId 不写', () => {
    const sections = hallucinatedSections()
    const r = auditDeclaredValueAnchors({ sections, figmaNodeData: makeFigma() })
    const audit = auditSectionAnchors(sections, makeFigma(), {
      blockedRefIds: r.blockedRefIds,
    })
    expect(audit.stats.blockedReanchors).toBe(1)
    expect(audit.stats.repaired).toBe(0)
    expect(audit.fixes).toHaveLength(0)
    expect(audit.unrepaired[0].reason).toBe('ref-text-mismatch')
    expect((audit.unrepaired[0] as any).blockedRefs.sort()).toEqual(['2:3456', '2:3457'])
    expect((sections[0] as any).figmaAnchorId).toBeUndefined()
  })

  it('配方按文本串唯一定位真值节点，指空段不给 id', () => {
    const r = auditDeclaredValueAnchors({
      sections: hallucinatedSections(),
      figmaNodeData: makeFigma(),
    })
    expect(r.recipes).toHaveLength(2)
    expect(r.recipes[0]).toMatchObject({
      declared: '34,620',
      from: '2:3456',
      status: 'unique',
      truthNodeId: '2:3684',
      parentId: '1744:126',
      y: 240,
    })
    expect(r.recipes[1]).toMatchObject({
      declared: '82,379',
      status: 'unique',
      truthNodeId: '2:3682',
    })
  })

  it('真值多命中 ⇒ 配方 ambiguous，不给空段', () => {
    const dup = {
      id: '2:3999',
      name: '34,620',
      type: 'TEXT',
      characters: '34,620',
      absoluteBoundingBox: { x: 300, y: 300, width: 80, height: 24 },
    }
    const r = auditDeclaredValueAnchors({
      sections: hallucinatedSections(),
      figmaNodeData: makeFigma([dup]),
    })
    expect(r.recipes[0].status).toBe('ambiguous')
    expect((r.recipes[0] as any).truthNodeId).toBeUndefined()
  })
})

describe('P0 声明值-锚点归属判据（阳性：逐类不误伤）', () => {
  it('正常 stat-card：ref 子树含真值文本 ⇒ matched，不 blocked', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '1744:126', body: { children: [{ id: '2:3684', value: '34,620' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.evaluated).toBe(1)
    expect(r.matched).toBe(1)
    expect(r.mismatched).toBe(0)
    expect(r.blockedRefs).toBe(0)
    expect(r.blockedRefIds).toEqual([])
  })

  it('text 型条目（既有轨道）不进新判据', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '2:3439', body: { children: [{ id: '2:3456', text: '34,620' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.skipped).toBe(true)
    expect(r.skippedReason).toBe('no-declared-values')
    expect(r.blockedRefIds).toEqual([])
  })

  it('纯图 / 图表段（无 value）不进新判据', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '1263:38', body: { children: [{ id: '2:3456', role: 'icon' }] } },
        { id: '2:3604', body: { children: [{ id: '1744:129', role: 'chart' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.skipped).toBe(true)
    expect(r.blockedRefIds).toEqual([])
  })

  it('OCR 误读但 ref 子树有文本 ⇒ 只记 issue，不拒绝正当重锚', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '1744:126', body: { children: [{ id: '2:3684', value: '34,621' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.mismatched).toBe(1)
    expect(r.blockedRefs).toBe(0)
    expect(r.issues[0].blocksReanchor).toBe(false)
  })

  it('幻影 id ⇒ 只计 notInTree，归属既有单一来源判据', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '2:3439', body: { children: [{ id: '9:999', value: '34,620' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.notInTree).toBe(1)
    expect(r.mismatched).toBe(0)
    expect(r.blockedRefs).toBe(0)
  })

  it('declaredContent.items 形态与 collectSectionFigmaRefs 同源', () => {
    const r = auditDeclaredValueAnchors({
      sections: [
        { id: '2:3439', declaredContent: { items: [{ id: '2:3456', value: '34,620' }] } },
      ],
      figmaNodeData: makeFigma(),
    })
    expect(r.evaluated).toBe(1)
    expect(r.blockedRefs).toBe(1)
  })

  it('不带 blockedRefIds 时既有 R2 修复能力不受影响', () => {
    const sections: any[] = [
      { id: '2:3439', body: { children: [{ id: '2:3456' }, { id: '2:3457' }] } },
    ]
    const audit = auditSectionAnchors(sections, makeFigma())
    expect(audit.stats.repaired).toBe(1)
    expect(audit.stats.blockedReanchors).toBe(0)
    expect(sections[0].figmaAnchorId).toBe('1263:38')
  })

  it('无 sections / 无真值树 ⇒ 明确 skipped（0 也有确定值）', () => {
    expect(auditDeclaredValueAnchors({ sections: [], figmaNodeData: makeFigma() }).skippedReason).toBe(
      'no-sections',
    )
    expect(
      auditDeclaredValueAnchors({ sections: hallucinatedSections(), figmaNodeData: null }).skippedReason,
    ).toBe('no-figma-tree')
  })

  it('单字符数字真值文本不污染配方（双向包含假绿回归）', () => {
    const noise = ['2', '4', '6', '20'].map((v, i) => ({
      id: `9:00${i}`,
      name: v,
      type: 'TEXT',
      characters: v,
      absoluteBoundingBox: { x: i * 10, y: 700, width: 10, height: 10 },
    }))
    const r = auditDeclaredValueAnchors({
      sections: hallucinatedSections(),
      figmaNodeData: makeFigma(noise),
    })
    expect(r.recipes[0]).toMatchObject({ status: 'unique', truthNodeId: '2:3684' })
    expect(r.recipes[1]).toMatchObject({ status: 'unique', truthNodeId: '2:3682' })
  })

  it('千分位格式差异不算错配', () => {
    const r = auditDeclaredValueAnchors({
      sections: [{ id: '2:3683', body: { children: [{ id: '2:3684', value: '34620' }] } }],
      figmaNodeData: makeFigma(),
    })
    expect(r.matched).toBe(1)
    expect(r.mismatched).toBe(0)
    expect(r.blockedRefs).toBe(0)
  })

  it('短声明值不得靠双向包含假绿命中', () => {
    const r = auditDeclaredValueAnchors({
      sections: [{ id: '2:3459', body: { children: [{ id: '2:3463', value: '2' }] } }],
      figmaNodeData: makeFigma(),
    })
    expect(r.matched).toBe(0)
    expect(r.mismatched).toBe(1)
    expect(r.blockedRefs).toBe(0)
  })

  it('emptyAnchorStats 含新键（计数行 schema 不丢键）', () => {
    expect(emptyAnchorStats()).toHaveProperty('blockedReanchors', 0)
  })
})
