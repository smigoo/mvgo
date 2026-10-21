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
import { auditSectionAnchors, collectSectionFigmaRefs } from './section-anchor-truth.js'

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
    expect(report.stats).toEqual({ judged: 1, repaired: 1 })
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
    expect(report.stats).toEqual({ judged: 1, repaired: 0 })
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
