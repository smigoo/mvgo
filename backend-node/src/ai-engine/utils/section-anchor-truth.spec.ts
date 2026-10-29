/**
 * R22-d（2026-10-21 · c-d79b-66d79bff「合作厂商弹窗」实锤）：视觉 section 锚点的祖先前置判据。
 *
 * 病灶回顾：Vision 的 `section.id` 可以是**存在但语义无关**的 Figma 节点
 * （本例 `38:3258` 在真值树里是普通段下的「鲁邦通」TEXT）。P1-7 的
 * `validateVisionAnchors` 只判「在不在树里」⇒ 这种锚点零报警通过，但它是几何无关节点，
 * `sectionY` 排序 / 同区域判定 / 语义回填全部拿到错坐标。
 *
 * 本 spec 的判据一律「判落位」：既验 issue（报得对），也验**不误伤**（阳性对照），
 * 并硬断言修复**只写新字段** `figmaAnchorId`。
 */
import {
  auditSectionAnchors,
  collectSectionFigmaRefs,
  sectionAnchorCandidates,
  sectionAnchorKey,
  FIGMA_ID_RE,
} from './section-anchor-truth.js'

/** B 批后的 stats 全键形状（🔴 每个计数键都必须存在，便于真机日志按固定 schema 采集） */
function stats(overrides: Record<string, number> = {}) {
  return {
    judged: 0,
    skippedNoRefs: 0,
    skippedSemanticAnchor: 0,
    phantomRefs: 0,
    anchorUnknown: 0,
    notAncestor: 0,
    repaired: 0,
    unrepaired: 0,
    ...overrides,
  }
}

/** 真值树：root 1:1 → page 2:2 → { row 3:3 → {cardA 4:4 → {textA 5:5, valA 6:6}, cardB 7:7}, unrelatedText 8:8 } */
function makeFigma() {
  return {
    document: {
      id: '1:1',
      name: 'root',
      type: 'DOCUMENT',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 600 },
      children: [
        {
          id: '2:2',
          name: 'page',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 600 },
          children: [
            {
              id: '3:3',
              name: 'stats-row',
              type: 'GROUP',
              absoluteBoundingBox: { x: 0, y: 100, width: 400, height: 80 },
              children: [
                {
                  id: '4:4',
                  name: 'cardA',
                  type: 'GROUP',
                  absoluteBoundingBox: { x: 0, y: 100, width: 190, height: 80 },
                  children: [
                    {
                      id: '5:5',
                      name: '33',
                      type: 'TEXT',
                      characters: '33',
                      absoluteBoundingBox: { x: 20, y: 110, width: 40, height: 20 },
                      children: [],
                    },
                    {
                      id: '6:6',
                      name: '合作厂商',
                      type: 'TEXT',
                      characters: '合作厂商',
                      absoluteBoundingBox: { x: 20, y: 140, width: 80, height: 20 },
                      children: [],
                    },
                  ],
                },
                {
                  id: '7:7',
                  name: 'cardB',
                  type: 'GROUP',
                  absoluteBoundingBox: { x: 210, y: 100, width: 190, height: 80 },
                  children: [],
                },
              ],
            },
            {
              id: '8:8',
              name: '鲁邦通',
              type: 'TEXT',
              characters: '鲁邦通',
              absoluteBoundingBox: { x: 0, y: 300, width: 60, height: 20 },
              children: [],
            },
          ],
        },
      ],
    },
  }
}

/** 卡片区统计段（refs = 两张卡）。幻觉锚点 = 8:8（存在但是无关 TEXT） */
function makeStatSection(overrides = {}) {
  return {
    id: '8:8',
    name: '顶部统计区',
    role: '常驻',
    layout: 'horizontal-2-columns',
    body: {
      layout: 'horizontal-2-columns',
      children: [
        { id: '4:4', name: '合作厂商统计卡', role: 'stat-card' },
        { id: '7:7', name: '在线设备统计卡', role: 'stat-card' },
      ],
    },
    ...overrides,
  }
}

describe('R22-d auditSectionAnchors：锚点必须是自身内容的祖先', () => {
  test('幻觉锚点（存在但非祖先）⇒ 报 anchor-not-ancestor，修成 LCA', () => {
    const sections = [makeStatSection()]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0]).toMatchObject({
      sectionId: '8:8',
      anchorId: '8:8',
      kind: 'anchor-not-ancestor',
    })
    expect(report.issues[0].refs.sort()).toEqual(['4:4', '7:7'])
    expect(report.stats).toEqual(stats({ judged: 1, notAncestor: 1, repaired: 1 }))
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('🔴 修复不改写 id / figmaNodeId（下游查找 key）', () => {
    const sections = [makeStatSection()]
    auditSectionAnchors(sections, makeFigma())
    expect(sections[0].id).toBe('8:8')
    expect(sections[0].figmaNodeId).toBeUndefined()
  })

  test('阳性对照：锚点确实是内容祖先 ⇒ 零 issue（判据不是恒真）', () => {
    const sections = [makeStatSection({ id: '3:3' })]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(0)
    expect(report.stats).toEqual(stats({ judged: 1 }))
    expect(sections[0].figmaAnchorId).toBeUndefined()
  })

  test('阳性对照二：锚点就是内容自身（单成员 section）⇒ 零 issue', () => {
    const sections = [
      { id: '4:4', name: '合作厂商统计卡', children: [{ id: '4:4', name: '合作厂商统计卡' }] },
    ]
    const report = auditSectionAnchors(sections, makeFigma())
    expect(report.issues).toHaveLength(0)
  })

  test('锚点不在树中 ⇒ anchor-unknown，同样修成 LCA', () => {
    const sections = [makeStatSection({ id: '999:9' })]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].kind).toBe('anchor-unknown')
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('figmaNodeId 为唯一锚点来源时同样判（id 是语义名不被改写）', () => {
    const sections = [
      makeStatSection({ id: 'section-cards', figmaNodeId: '8:8' }),
    ]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].anchorId).toBe('8:8')
    expect(sections[0].id).toBe('section-cards')
    expect(sections[0].figmaNodeId).toBe('8:8')
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('语义 id（无 Figma 形态、无 figmaNodeId）⇒ 不判、不计入 judged', () => {
    const sections = [makeStatSection({ id: 'section-cards' })]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(0)
    expect(report.stats.judged).toBe(0) // 无锚点声明 ⇒ 未判
    expect(sections[0].figmaAnchorId).toBeUndefined()
  })

  test('无直接子级引用 ⇒ fail-open 不判（无真值不判）', () => {
    const sections = [{ id: '8:8', name: '顶部统计区' }]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(0)
    expect(report.stats.judged).toBe(0)
    expect(sections[0].figmaAnchorId).toBeUndefined()
  })

  test('幂等：第二次运行以 figmaAnchorId 为准 ⇒ 无 issue、无新 fix', () => {
    const sections = [makeStatSection()]
    auditSectionAnchors(sections, makeFigma())
    const second = auditSectionAnchors(sections, makeFigma())

    expect(second.issues).toHaveLength(0)
    expect(second.fixes).toHaveLength(0)
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('跨子树引用（不同分支）⇒ 仍报，LCA 退到共同祖先', () => {
    const sections = [
      { id: '8:8', name: '混合区', children: [{ id: '5:5' }, { id: '7:7' }] },
    ]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(1)
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('figmaNodeData 为裸根（无 document 包装）同样可用', () => {
    const bare = makeFigma().document
    const sections = [makeStatSection()]
    const report = auditSectionAnchors(sections, bare)

    expect(report.issues).toHaveLength(1)
    expect(sections[0].figmaAnchorId).toBe('3:3')
  })

  test('空/非法输入 ⇒ 零副作用', () => {
    expect(auditSectionAnchors(null, makeFigma()).issues).toEqual([])
    expect(auditSectionAnchors([], makeFigma()).stats.judged).toBe(0)
    expect(auditSectionAnchors([makeStatSection()], null).issues).toEqual([])
  })

  // ── B 批加固（2026-10-26 · 58de7d47 真机实锤）─────────────────────────────

  test('B① 真机复刻：幻影 ref 不再制造假阳 issue（36:1693 段）', () => {
    // 真值：root 36:1693 → 801:3 GROUP；vision 声明子级含**不存在**的 36:1696
    const figma = {
      document: {
        id: '36:1693',
        name: 'cp-设备详情',
        type: 'FRAME',
        children: [
          {
            id: '801:3',
            name: 'slot-icon',
            type: 'GROUP',
            children: [{ id: '36:1698', name: '编码', type: 'TEXT', characters: '编码' }],
          },
        ],
      },
    }
    const sections = [
      {
        id: '36:1693',
        name: '设备头部信息',
        body: { children: [{ id: '801:3' }, { id: '36:1696' }] },
      },
    ]
    const report = auditSectionAnchors(sections, figma)

    // 树内 ref（801:3）确实在 36:1693 之下 ⇒ 无 issue；幻影 ref 只计数不报
    expect(report.issues).toHaveLength(0)
    expect(report.stats).toEqual(stats({ judged: 1, phantomRefs: 1 }))
    expect(sections[0].figmaAnchorId).toBeUndefined()
  })

  test('B① 幻影 ref 计入 missingRefs，并补进 issue detail（不另发 issue）', () => {
    const sections = [
      { id: '8:8', name: '混合区', children: [{ id: '4:4' }, { id: '999:9' }] },
    ]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].missingRefs).toEqual(['999:9'])
    expect(report.issues[0].refs.sort()).toEqual(['4:4', '999:9'])
    expect(report.issues[0].detail).toContain('999:9')
    // 「ref 不在树中」不产生独立 issue kind（单一来源 = validateVisionAnchors）
    expect(report.issues.every((i: any) => i.kind !== 'ref-unknown')).toBe(true)
  })

  test('B② 证据不完整（有幻影 ref）⇒ 拒绝自动修复，记 unrepaired=phantom-refs', () => {
    const sections = [
      { id: '8:8', name: '混合区', children: [{ id: '4:4' }, { id: '999:9' }] },
    ]
    const report = auditSectionAnchors(sections, makeFigma())

    expect(sections[0].figmaAnchorId).toBeUndefined()
    expect(report.fixes).toHaveLength(0)
    expect(report.unrepaired).toHaveLength(1)
    expect(report.unrepaired[0]).toMatchObject({
      sectionId: '8:8',
      claimed: '8:8',
      kind: 'anchor-not-ancestor',
      candidateLca: '4:4',
      reason: 'phantom-refs',
    })
    expect(report.stats).toEqual(stats({ judged: 1, notAncestor: 1, phantomRefs: 1, unrepaired: 1 }))
  })

  test('B② 候选 LCA 退到树根 ⇒ 拒绝落地（避免段锚到整页几何），记 unrepaired=lca-is-root', () => {
    const figma = {
      document: {
        id: '1:1',
        name: 'doc',
        type: 'DOCUMENT',
        children: [
          { id: '2:2', name: 'A', type: 'FRAME', children: [{ id: '3:3', name: 'a', type: 'TEXT', characters: 'a' }] },
          { id: '4:4', name: 'B', type: 'FRAME', children: [{ id: '5:5', name: 'b', type: 'TEXT', characters: 'b' }] },
        ],
      },
    }
    // 跨根级两分支引用 ⇒ LCA = 1:1（树根）
    const sections = [{ id: '9:9', name: '跨页区', children: [{ id: '3:3' }, { id: '5:5' }] }]
    const report = auditSectionAnchors(sections, figma)

    expect(sections[0].figmaAnchorId).toBeUndefined()
    expect(report.fixes).toHaveLength(0)
    expect(report.unrepaired[0]).toMatchObject({
      sectionId: '9:9',
      kind: 'anchor-unknown',
      candidateLca: '1:1',
      reason: 'lca-is-root',
    })
    expect(report.stats).toEqual(stats({ judged: 1, anchorUnknown: 1, unrepaired: 1 }))
  })

  test('B③ stats 全键初始化：跳过路径同样给出确定值', () => {
    expect(auditSectionAnchors(null, makeFigma()).stats).toEqual(stats())
    expect(auditSectionAnchors([], makeFigma()).stats).toEqual(stats())
    expect(auditSectionAnchors([makeStatSection()], null).stats).toEqual(stats())
    // 无引用 ⇒ skippedNoRefs；语义 id ⇒ skippedSemanticAnchor
    expect(auditSectionAnchors([{ id: '8:8' }], makeFigma()).stats).toEqual(stats({ skippedNoRefs: 1 }))
    expect(
      auditSectionAnchors([makeStatSection({ id: 'section-cards' })], makeFigma()).stats,
    ).toEqual(stats({ skippedSemanticAnchor: 1 }))
  })

  test('collectSectionFigmaRefs：只收 Figma 形态 id，语义名/资源名不算引用', () => {
    const refs = collectSectionFigmaRefs({
      id: '8:8',
      children: [
        { id: '4:4' },
        { figmaNode: '7:7' },
        { figmaNodeId: '5:5' },
        { id: 'section-child', resourceFile: 'icon-7941.png' },
      ],
    })
    expect([...refs].sort()).toEqual(['4:4', '5:5', '7:7'])
    // section 自身 id 不作引用（它可能就是幻觉锚点）
    expect(refs.has('8:8')).toBe(false)
  })
})

// ── 刀33（2026-10-29 · mc-max-1793266461373-e7290dc5 实锤）────────────────────
// 锚点优先级此前散落三处（本模块 claimed / plan-body-child-id-audit#resolveAnchorId /
// subcomponent-planner 的两处 Map 键），第三处漏读 figmaAnchorId ⇒ vision 聚合段的语义与
// 高度被错挂到「首卡叶子」。下面锁死单一来源的**行为契约**。

describe('刀33 sectionAnchorCandidates / sectionAnchorKey：锚点优先级单一来源', () => {
  test('candidates 恒为三元组且顺序固定（figmaAnchorId → figmaNodeId → id）', () => {
    expect(sectionAnchorCandidates({ figmaAnchorId: '1:1', figmaNodeId: '2:2', id: '3:3' })).toEqual([
      '1:1',
      '2:2',
      '3:3',
    ])
    // 缺字段 ⇒ undefined 占位，顺序不变
    expect(sectionAnchorCandidates({ id: '3:3' })).toEqual([undefined, undefined, '3:3'])
    expect(sectionAnchorCandidates(null)).toEqual([undefined, undefined, undefined])
  })

  test('🔴 阳性：三者齐全 ⇒ key = figmaAnchorId（上游锚点修复优先于 vision 原始声明）', () => {
    // e7290dc5 形态：vision 段锚点 565:3，语义落到首卡 48:5798（id），figmaNodeId 空
    expect(sectionAnchorKey({ figmaAnchorId: '565:3', figmaNodeId: undefined, id: '48:5798' })).toBe('565:3')
  })

  test('逐级回退：figmaAnchorId 空 ⇒ figmaNodeId；两者皆空 ⇒ id', () => {
    expect(sectionAnchorKey({ figmaAnchorId: '', figmaNodeId: '7:7', id: '48:5798' })).toBe('7:7')
    expect(sectionAnchorKey({ figmaAnchorId: null, figmaNodeId: undefined, id: '48:5798' })).toBe('48:5798')
  })

  test('🔴 反向（fail-open 守护）：合成段 id 不被形态校验掉，原样作键', () => {
    // 合成 id 不是 Figma 形态 ⇒ 若在此处做 FIGMA_ID_RE 校验会返回空键 ⇒ 索引全丢
    expect(FIGMA_ID_RE.test('43:4791-list')).toBe(false)
    expect(sectionAnchorKey({ id: '43:4791-list' })).toBe('43:4791-list')
    expect(sectionAnchorKey({ id: '807:2-tail-text' })).toBe('807:2-tail-text')
  })

  test('边界：0 / false 视为非空（与旧 `||` 语义的刻意差异），undefined/null/"" 跳过', () => {
    // 旧写法 `s.figmaNodeId || s.id` 会把 0 / '' 当假值跳过；新实现只跳 null/undefined/空串
    expect(sectionAnchorKey({ figmaAnchorId: 0, id: '5:5' })).toBe('0')
    expect(sectionAnchorKey({ figmaAnchorId: '   ', id: '5:5' })).toBe('   ') // 不 trim（不做整形）
    expect(sectionAnchorKey({})).toBe('')
    expect(sectionAnchorKey({ figmaAnchorId: '', figmaNodeId: '', id: '' })).toBe('')
  })

  test('与 auditSectionAnchors 同源：issue.anchorId = 候选里首个 Figma 形态值', () => {
    const sections = [makeStatSection({ figmaAnchorId: '999:9' })]
    // 🔴 必须在审计**之前**取候选：审计成功后 figmaAnchorId 会被改写成修复落点
    const firstFigmaShape = sectionAnchorCandidates(sections[0]).find(
      (v) => typeof v === 'string' && FIGMA_ID_RE.test(v),
    )
    const report = auditSectionAnchors(sections, makeFigma())
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].anchorId).toBe('999:9')
    expect(report.issues[0].anchorId).toBe(firstFigmaShape)
    expect(sectionAnchorCandidates(sections[0])[0]).toBe('3:3') // 审计后首选候选已换成 LCA
  })

  test('幂等前提：修复后 key 切到 figmaAnchorId，再次审计不产生新 fix', () => {
    const sections = [makeStatSection()]
    auditSectionAnchors(sections, makeFigma())
    expect(sectionAnchorKey(sections[0])).toBe('3:3') // key 已切到修复落点
    expect(auditSectionAnchors(sections, makeFigma()).fixes).toHaveLength(0)
  })
})
