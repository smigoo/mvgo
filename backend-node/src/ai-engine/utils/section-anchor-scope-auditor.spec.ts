/**
 * V-4 顶层段锚点范围几何审计单测（2026-11-08 · mc-1794122457556-be2af6c7 实锤）。
 *
 * 病灶：vision 把「一张卡」及其「该卡背景」报成两个顶层业务段，真实网格容器是其祖先。
 * 判据：「重复集合中的某个成员，不可能是整个业务段」⇒ 锚点上提到集合容器并按目标合并。
 * 铁律：单轴水平列表保守不动、无真值 fail-open、绝不原地改数组。
 */
import { auditSectionAnchorScope } from './section-anchor-scope-auditor.js'

function node(id, name, x, y, w, h, children) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: children || [],
  }
}

/** 3 列 × 4 行的 12 卡网格（每卡 117×64），容器 367×295 —— 与真机同构 */
function gridCards(base, cols, rows, cardW = 117, cardH = 64, startX = 0, startY = 550) {
  const out = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const n = base + r * cols + c
      const x = startX + c * (cardW + 4)
      const y = startY + r * (cardH + 8)
      out.push(
        node(`2:${n}`, `card-${r}-${c}`, x, y, cardW, cardH, [
          node(`2:${n + 500}`, 'bg', x, y, cardW, cardH),
        ]),
      )
    }
  }
  return out
}

function buildDeviceMonitorFigma() {
  const cards = gridCards(8500, 3, 4)
  // 首卡与首卡背景改用真机 id（真值：2:8438 单卡 / 2:8439 其 bg）
  cards[0].id = '2:8438'
  cards[0].children[0].id = '2:8439'
  const cons = node('2:8437', 'cons', 0, 550, 367, 295, cards)
  return node('2:8417', 'cp', 0, 400, 420, 425, [
    node('2:8419', 'header', 0, 401, 388, 30.1),
    node('89:40', 'slot-con', 0, 475, 420, 350, [
      node('89:38', 'switch', 0, 475, 396.4, 64.8, [
        node('2:8787', 'active', 0, 475, 193.4, 64.8),
        node('2:8806', 'default', 200, 475, 193.4, 64.8),
      ]),
      node('89:37', '@antd/tab', 0, 538, 46, 317),
      cons,
    ]),
  ])
}

describe('auditSectionAnchorScope', () => {
  it('阳性：单卡 + 单卡背景被报成顶层段 ⇒ 上提到网格容器并合并为一段', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419', type: null, title: '头部区域' },
      { id: '89:38', type: 'container', title: 'switch' },
      { id: '2:8438', type: 'tabs', title: '左侧功能标签栏' },
      { id: '2:8439', type: 'grid', title: '设备状态卡片网格' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(2)
    expect(res.stats.merged).toBe(1)
    expect(res.sections).toHaveLength(3)
    expect(res.sections.map((s) => s.id)).toEqual(['2:8419', '89:38', '2:8437'])
    // 段高必须改为集合容器真值（64 → 295），否则下游 flexGrow 继续按单卡算
    const grid = res.sections[2]
    expect(grid.layoutMetadata.height).toBe(295)
    expect(grid.styles.figmaHeightPx).toBe(295)
    // 保留数组序靠前者的 type/title，并留痕来源
    expect(grid.type).toBe('tabs')
    expect(grid._scopePromotedFrom.id).toBe('2:8438')
  })

  it('阳性：合并只并集事实，不重复计入同一 kid', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419' },
      { id: '89:38' },
      {
        id: '2:8438',
        internalSubcomponents: [{ id: '2:8439-group1', elementNames: ['摄像机'] }],
      },
      { id: '2:8439', internalSubcomponents: [{ id: '2:8439-group2', elementNames: ['风速风向仪'] }] },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    const grid = res.sections[2]
    expect(grid.internalSubcomponents.map((g) => g.id)).toEqual([
      '2:8439-group1',
      '2:8439-group2',
    ])
    // 同 id 的 fact 不得重复计入
    expect(grid.internalSubcomponents).toHaveLength(2)
  })

  it('阳性②：两卡并排只报其中一个 ⇒ 上提到整条容器（真机 cbcac19a 实锤）', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419', title: '头部区域' },
      { id: '2:8787', title: '顶部统计卡片' }, // 漏了同构兄弟 2:8806
      { id: '89:37', type: 'container', title: '@antd/tab' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(1)
    expect(res.stats.promotions[0]).toMatchObject({
      from: '2:8787',
      to: '89:38',
      reason: 'horizontal-row',
      uncovered: 1,
    })
    expect(res.sections.map((s) => s.id)).toEqual(['2:8419', '89:38', '89:37'])
    // 段高改成整条容器真值（两卡同高 64.8，值不变但范围变成整条）
    expect(res.sections[1].layoutMetadata.height).toBeCloseTo(64.8, 1)
  })

  it('阴性①：正常三段（header / 已覆盖两卡的 switch / tab 容器）⇒ 完全不动', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419', title: '头部区域' },
      { id: '89:38', type: 'container', title: 'switch' }, // 锚点=容器本身，两卡都在其子树内
      { id: '89:37', type: 'container', title: '@antd/tab' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.stats.skippedReason).toBe('no-narrow-anchor')
    expect(res.sections).toBe(sections) // 同一引用，未新建
  })

  it('阴性①-b：两卡各自是独立段（vision 已按语义分区）⇒ 不上提，避免误合并', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419' },
      { id: '2:8787', title: '江阴大桥' },
      { id: '2:8806', title: '隧道' },
      { id: '89:37' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.sections).toBe(sections)
  })

  it('阴性②：单轴水平并排三段（并列语义区块）⇒ 保守不动', () => {
    const cols = ['a', 'b', 'c'].map((k, i) =>
      node(`3:${i}`, `col-${k}`, i * 140, 0, 130, 200),
    )
    const figma = node('0:1', 'root', 0, 0, 420, 200, [node('3:9', 'row', 0, 0, 420, 200, cols)])
    const sections = cols.map((c) => ({ id: c.id }))
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.sections).toBe(sections)
  })

  it('阴性③：画布只有一张卡（无同构兄弟）⇒ 不动', () => {
    const figma = node('0:1', 'root', 0, 0, 420, 425, [
      node('4:1', 'only-card', 10, 10, 400, 300),
    ])
    const res = auditSectionAnchorScope([{ id: '4:1' }, { id: '4:1' }], figma)
    expect(res.stats.promoted).toBe(0)
  })

  it('阴性④：无 Figma 真值 ⇒ fail-open', () => {
    const sections = [{ id: '2:8439' }, { id: '2:8438' }]
    const res = auditSectionAnchorScope(sections, null)
    expect(res.stats.skippedReason).toBe('no-figma-data')
    expect(res.sections).toBe(sections)
  })

  it('阴性⑤：锚点无法解析 ⇒ 不猜，原样返回', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [{ id: '2:8439' }, { id: 'phantom:1' }]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.skippedReason).toBe('unanchored-sections')
    expect(res.sections).toBe(sections)
  })

  it('阴性⑥：段数不足 2 ⇒ 不评估', () => {
    const res = auditSectionAnchorScope([{ id: '2:8439' }], buildDeviceMonitorFigma())
    expect(res.stats.skippedReason).toBe('insufficient-sections')
  })

  it('阴性⑦：段已声明 headers/items（表格首行 id 作锚点）⇒ 不得上提', () => {
    // 既有 spec dfe50968 形态：43:4788 是表格首行，整表 388 高，父下有 3 个同构行
    const root = node('807:2', 'root', 0, 0, 483, 515, [
      node('43:4784', 'table', 0, 91, 470, 388, [
        node('43:4785', 'col-left', 0, 91, 179, 388, [
          node('43:4786', 'row-h', 0, 91, 179, 44),
          node('43:4788', 'row-1', 0, 134, 179, 44),
          node('43:4791', 'row-2', 0, 177, 179, 44),
        ]),
        node('43:4812', 'col-right', 178, 91, 292, 388),
      ]),
      node('43:4869', 'legend', 0, 501, 53, 14),
    ])
    const sections = [
      {
        id: '43:4788',
        role: 'table',
        layout: 'table',
        headers: ['设备名称', '电量'],
        items: [{ id: '43:4788' }, { id: '43:4791' }],
      },
      { id: '43:4869', role: 'footer' },
    ]
    const res = auditSectionAnchorScope(sections, root)
    expect(res.stats.promoted).toBe(0)
    expect(res.sections).toBe(sections) // 逐字不动
  })

  it('阴性⑧：items 声明在 body 内同样否决上提', () => {
    const root = node('807:2', 'root', 0, 0, 483, 515, [
      node('43:4785', 'col', 0, 91, 179, 388, [
        node('43:4786', 'r0', 0, 91, 179, 44),
        node('43:4788', 'r1', 0, 134, 179, 44),
        node('43:4791', 'r2', 0, 177, 179, 44),
      ]),
      node('43:4869', 'legend', 0, 501, 53, 14),
    ])
    const sections = [
      { id: '43:4788', body: { layout: 'table', items: [{ id: 'a' }] } },
      { id: '43:4869' },
    ]
    const res = auditSectionAnchorScope(sections, root)
    expect(res.stats.promoted).toBe(0)
    expect(res.sections).toBe(sections)
  })

  it('边界：{ document } 包裹形态可解包（figmaNodeData 常见形态）', () => {
    const figma = buildDeviceMonitorFigma()
    const res = auditSectionAnchorScope(
      [{ id: '2:8419' }, { id: '2:8438' }, { id: '2:8439' }],
      { document: figma },
    )
    expect(res.stats.promoted).toBe(2)
    expect(res.sections.map((s) => s.id)).toEqual(['2:8419', '2:8437'])
  })

  // ───────────────────────────────────────────────────────────────────────────
  // R3（2026-11-11 · mc-max-1794359124563-05945a47「合作厂商弹窗」实锤）
  // 真值 38:3134 660×868：段0 统计卡片区 38:3260 首卡 265×76（真值 8.8% 高），
  // 父 796:3 下另有同构兄弟 38:3282；796:3 内还含段1/2/3 的锚点。
  // 病灶：旧判据把 38:3260 上提成 796:3（604×787 整内容槽）⇒ 段高 76 → 787 ⇒
  // 产物首段 flex 0.552（独占 55.2% 高度），三个列表被压到 11.3/14.9/18.6%。
  // ───────────────────────────────────────────────────────────────────────────

  /** 与真机同构：796:3 内含 3 个分组段锚点 + 2 张 265×76 并排统计卡 */
  function buildStatsPopupFigma() {
    const cards = [
      node('38:3260', 'Group 2136638431', 0, 51483, 265, 76),
      node('38:3282', 'Group 2136638435', 339, 51483, 265, 76),
    ]
    const slot = node('796:3', 'slot-icon', 0, 51483, 604, 787, [
      node('38:3137', 'Group 2136638432', 0, 51592, 604, 161),
      node('38:3162', 'Group 2136638433', 0, 51773, 604, 212),
      node('38:3206', 'Group 2136638434', 0, 52005, 604, 265),
      ...cards,
    ])
    return node('38:3134', 'cp-合作厂商弹窗', 0, 0, 660, 868, [slot])
  }

  it('R3①：段已在 body.children 声明两张卡 ⇒ 兄弟卡不算「漏网成员」，不上提（保持 76 高）', () => {
    const figma = buildStatsPopupFigma()
    const sections = [
      {
        id: '38:3260',
        role: 'stats',
        // vision 用「首卡 id」当整段锚点，并在 body.children 里声明了两张卡（真机形态）
        body: {
          layout: 'horizontal',
          children: [
            { id: '38:3260', role: 'stat-card', content: { elements: [{ figmaNode: '38:3263' }] } },
            { id: '38:3282', role: 'stat-card', content: { elements: [{ figmaNode: '38:3285' }] } },
          ],
        },
        styles: { flexGrow: 0.426, figmaHeightPx: 76 },
      },
      { id: '38:3137', styles: { figmaHeightPx: 161 } },
      { id: '38:3162', styles: { figmaHeightPx: 212 } },
      { id: '38:3206', styles: { figmaHeightPx: 265 } },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.stats.skippedReason).toBe('no-narrow-anchor')
    expect(res.sections).toBe(sections) // 同一引用，逐字不动
    // 段高必须仍是首卡真值 76（若被上提成 796:3 会变成 787）
    expect(res.sections[0].styles.figmaHeightPx).toBe(76)
  })

  it('R3②：目标容器吞并其他业务段 ⇒ 撤销上提（对齐 R2 lca-covers-sibling-sections）', () => {
    const figma = buildStatsPopupFigma()
    // 段0 不声明任何内容（隔离根因①，单测根因②）：父 796:3 下 38:3260/38:3282 同构、
    // 铺满 604 宽 ⇒ 旧判据必然 horizontal-row 上提；但 796:3 子树含段1/2/3 锚点 ⇒ 必撤。
    const sections = [
      { id: '38:3260', styles: { figmaHeightPx: 76 } },
      { id: '38:3137', styles: { figmaHeightPx: 161 } },
      { id: '38:3162', styles: { figmaHeightPx: 212 } },
      { id: '38:3206', styles: { figmaHeightPx: 265 } },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.stats.vetoed).toBe(1)
    expect(res.stats.skippedReason).toBe('vetoed-covers-sibling')
    expect(res.stats.vetoes[0]).toMatchObject({
      sectionId: '38:3260',
      from: '38:3260',
      to: '796:3',
      reason: 'covers-sibling-sections',
    })
    expect(res.stats.vetoes[0].coveredAnchors.sort()).toEqual([
      '38:3137',
      '38:3162',
      '38:3206',
    ])
    expect(res.sections).toBe(sections)
    expect(res.sections[0].id).toBe('38:3260') // 锚点未被改写
  })

  it('R3③：其他段并入同一目标属正当合并 ⇒ 守卫不误撤（阳性①不回归）', () => {
    const figma = buildDeviceMonitorFigma()
    const sections = [
      { id: '2:8419', title: '头部区域' },
      { id: '89:38', title: 'switch' },
      { id: '2:8438', title: '左侧功能标签栏' },
      { id: '2:8439', title: '设备状态卡片网格' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    // 2:8439 是 2:8437 的子树锚点，但它与 2:8438 并入**同一目标** ⇒ 不得触发 veto
    expect(res.stats.vetoed).toBe(0)
    expect(res.stats.promoted).toBe(2)
    expect(res.stats.merged).toBe(1)
    expect(res.sections.map((s) => s.id)).toEqual(['2:8419', '89:38', '2:8437'])
  })

  it('R3④：段声明的 items 也计入「已覆盖」（防误判漏网兄弟）', () => {
    const figma = buildStatsPopupFigma()
    // 不写 body.children，改在 body.items 声明两张卡 ⇒ 同样不得上提
    const sections = [
      { id: '38:3260', body: { layout: 'grid', items: [{ id: '38:3260' }, { id: '38:3282' }] } },
      { id: '38:3137' },
      { id: '38:3162' },
      { id: '38:3206' },
    ]
    const res = auditSectionAnchorScope(sections, figma)
    expect(res.stats.promoted).toBe(0)
    expect(res.sections).toBe(sections)
  })
})
