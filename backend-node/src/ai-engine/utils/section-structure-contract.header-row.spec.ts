import { buildSectionStructureContract } from './section-structure-contract.js'

/**
 * header 行整体收口（2026-11-15 · mc-max-1794714133703-3e2bc817 实锤）。
 *
 * 病灶：planner 把面板头部拆成「容器 + 叶(tabs / 小标题)」，契约只把 tabs 一个叶提升进
 * `#header-right`，兄弟 `type:'header'` 叶回落 body ⇒ 容器因「还有 body 后代」被保留 ⇒
 * 整条 header 行作为 bodyRoot 参与顶层 flex，白吃 17.5% 内容区高度（壳里标题已被
 * base-panel 接管，只剩 8×8 图标）。
 *
 * 约定：面板头部由微码 base-panel 头部面板 + `#header-right` 插槽承担，**不占内容区高度**。
 */

const leaf = (id: string, type = 'content', extra: any = {}) => ({ id, type, ...extra })
const container = (id: string, children: any[]) => ({
  id,
  type: 'container',
  isLayoutContainer: true,
  children,
})

const textEl = (id: string) => ({ id, type: 'text', text: 't' })
const iconEl = (id: string) => ({ id, type: 'icon', width: 8, height: 8 })
const tabEl = (id: string) => ({ id, type: 'tab', text: 'tab' })

/** 3e2bc817 的真实形态：header 容器 → [tabs, 小标题(type=header)] */
const headerRowFixture = () => {
  const tabs = leaf('2:7954', 'tabs', { body: { children: [tabEl('2:7955'), tabEl('2:7957')] } })
  const subtitle = leaf('2:7959', 'header', {
    body: { children: [iconEl('2:7961'), textEl('2:7966'), textEl('2:7967')] },
  })
  const content = leaf('136:122', undefined, { body: { children: [textEl('2:8069')] } })
  const cards = container('2:8023', [
    leaf('136:129', 'card'),
    leaf('136:128', 'card'),
    leaf('136:127', 'card'),
  ])
  return {
    sections: [container('136:120', [tabs, subtitle]), content, cards],
    slots: [{ slotType: 'header-right', figmaNodeId: '2:7954' }],
  }
}

describe('header 行整体收口 · 3e2bc817', () => {
  test('⭐ 阳性：header 容器不再进 bodyRoots，小标题叶 drop 而非回落 body', () => {
    const { sections, slots } = headerRowFixture()
    const c = buildSectionStructureContract(sections, { headerSlots: slots })

    // 1) 容器不参与顶层 flex（这是「header 比例出现在内容区」的直接病因）
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['136:122', '2:8023'])
    expect(c.byId.get('136:120')?.placement).toBe('header-row') // 容器级归属，不再靠递归推断
    // 2) 插槽叶仍是 tabs，且被 drop 的小标题既不进 body 也不重复渲染
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['2:7954'])
    expect(c.droppedHeaderChrome.map((s) => s.id)).toEqual(['2:7959'])
    expect(c.bodyLeaves.map((s) => s.id)).not.toContain('2:7959')
    // 3) 被 drop 的叶不再由 body 渲染
    expect(c.byId.get('2:7959')?.placement).toBe('header-chrome')
    expect(c.stats).toMatchObject({
      headerRowCollapsed: 1,
      droppedHeaderChrome: 1,
      headerRowContainers: 1,
      bodyRoots: 2,
    })
  })

  test('阳性：无 headerSlots 契约时，tabs 叶自动补进插槽（插槽内容不丢）', () => {
    const { sections } = headerRowFixture()
    const c = buildSectionStructureContract(sections)
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['2:7954'])
    expect(c.droppedHeaderChrome.map((s) => s.id)).toEqual(['2:7959'])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['136:122', '2:8023'])
  })

  test('反向：容器内含业务段（图表）⇒ 不收口，容器仍在 bodyRoots', () => {
    const sections = [
      container('136:120', [
        leaf('2:7954', 'tabs', { body: { children: [tabEl('2:7955')] } }),
        leaf('2:8000', 'chart', { body: { children: [{ id: 'c1', type: 'chart' }] } }),
      ]),
    ]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: '2:7954' }],
    })
    expect(c.stats.headerRowCollapsed).toBe(0)
    expect(c.droppedHeaderChrome).toEqual([])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['136:120'])
    expect(c.bodyLeaves.map((s) => s.id)).toContain('2:8000')
  })

  test('反向：type=header 但 body 里含图片/列表元素 ⇒ 不算 chrome，回落 body', () => {
    const sections = [
      container('row', [
        leaf('tabs', 'tabs', { body: { children: [tabEl('t1'), tabEl('t2')] } }),
        leaf('hdr', 'header', {
          body: { children: [iconEl('i1'), { id: 'img', type: 'image' }] },
        }),
      ]),
    ]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'tabs' }],
    })
    expect(c.stats.headerRowCollapsed).toBe(0)
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['row'])
    expect(c.bodyLeaves.map((s) => s.id)).toContain('hdr')
  })

  test('反向：type=header 带 items ⇒ 有业务正文，不收口', () => {
    const sections = [
      container('row', [
        leaf('tabs', 'tabs', { body: { children: [tabEl('t1')] } }),
        leaf('hdr', 'header', { body: { children: [iconEl('i1')] }, items: [{ id: 'x' }] }),
      ]),
    ]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'tabs' }],
    })
    expect(c.stats.headerRowCollapsed).toBe(0)
    expect(c.bodyLeaves.map((s) => s.id)).toContain('hdr')
  })

  test('零回归：无 chrome 容器时 stats 逐字不变（0/0），不凭空 drop', () => {
    const sections = [leaf('a', 'content'), leaf('b', 'chart')]
    const c = buildSectionStructureContract(sections)
    expect(c.stats).toMatchObject({ headerRowCollapsed: 0, droppedHeaderChrome: 0 })
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['a', 'b'])
    expect(c.droppedHeaderChrome).toEqual([])
  })

  test('幂等：重复执行结果一致，且不修改输入', () => {
    const { sections, slots } = headerRowFixture()
    const snapshot = JSON.stringify(sections)
    const a = buildSectionStructureContract(sections, { headerSlots: slots })
    const b = buildSectionStructureContract(sections, { headerSlots: slots })
    expect(JSON.stringify(sections)).toBe(snapshot)
    expect(a.stats).toEqual(b.stats)
    expect(a.bodyRoots.map((s) => s.id)).toEqual(b.bodyRoots.map((s) => s.id))
  })
})

/**
 * 几何通道（根治项）：vision 不给 type 标签时，靠「同视觉行 + 高度不超锚行」判定，
 * 不再依赖 type ∈ {header, tabs, …} 枚举。
 */
describe('header 行收口 · 几何通道', () => {
  const geoLeaf = (id: string, type: any, geo: any[], extra: any = {}) => ({
    ...(type ? { type } : {}),
    id,
    internalGeometry: geo,
    ...extra,
  })

  test('⭐ type 为 null 的头部段（几何同 y 行）也被收口', () => {
    const row = {
      id: '136:120',
      type: 'container',
      isLayoutContainer: true,
      absoluteBoundingBox: { x: 36, y: 932, width: 380, height: 28.1 },
      children: [
        geoLeaf('2:7954', 'tabs', [{ x: 199, y: 932, w: 204, h: 19 }], {
          body: { children: [tabEl('2:7955')] },
        }),
        // vision 没给 type，但有文字+图标 ⇒ 宽松 chrome 判据仍认
        geoLeaf('2:7959', null, [{ x: 36, y: 929, w: 380, h: 31 }], {
          body: { children: [iconEl('2:7961'), textEl('2:7966')] },
        }),
      ],
    }
    const content = geoLeaf('136:122', undefined, [{ x: 36, y: 963, w: 86, h: 24 }], {
      body: { children: [textEl('2:8069')] },
    })
    const c = buildSectionStructureContract([row, content], {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: '2:7954' }],
    })
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['2:7954'])
    expect(c.droppedHeaderChrome.map((s) => s.id)).toEqual(['2:7959'])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['136:122'])
    expect(c.byId.get('136:120')?.placement).toBe('header-row')
  })

  test('⭐ 头部行根级平铺（没有容器壳）也能收口', () => {
    const tabs = geoLeaf('tabs', 'tabs', [{ x: 199, y: 932, w: 204, h: 19 }], {
      body: { children: [tabEl('t1'), tabEl('t2')] },
    })
    const subtitle = geoLeaf('sub', null, [{ x: 36, y: 929, w: 96, h: 28 }], {
      body: { children: [textEl('s1')] },
    })
    const chart = geoLeaf('chart', undefined, [{ x: 36, y: 985, w: 380, h: 60 }], {
      body: { children: [{ id: 'c1', type: 'chart' }] },
    })
    const c = buildSectionStructureContract([tabs, subtitle, chart], {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'tabs' }],
    })
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['tabs'])
    expect(c.droppedHeaderChrome.map((s) => s.id)).toEqual(['sub'])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['chart'])
    expect(c.stats.headerRowContainers).toBe(0) // 无容器，容器级收口计数为 0
  })

  test('几何反向：同 y 但高度显著超出锚行 ⇒ 视为独立内容块，不收口', () => {
    const tabs = geoLeaf('tabs', 'tabs', [{ x: 199, y: 932, w: 204, h: 19 }], {
      body: { children: [tabEl('t1')] },
    })
    const tallBlock = geoLeaf('big', null, [{ x: 36, y: 932, w: 380, h: 80 }], {
      body: { children: [textEl('b1')] },
    })
    const c = buildSectionStructureContract([tabs, tallBlock], {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'tabs' }],
    })
    expect(c.droppedHeaderChrome).toEqual([])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['big'])
  })

  test('几何反向：y 不同（正文在下方）⇒ 不收口', () => {
    const tabs = geoLeaf('tabs', 'tabs', [{ x: 199, y: 932, w: 204, h: 19 }], {
      body: { children: [tabEl('t1')] },
    })
    const below = geoLeaf('below', null, [{ x: 36, y: 1000, w: 380, h: 20 }], {
      body: { children: [textEl('x1')] },
    })
    const c = buildSectionStructureContract([tabs, below], {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'tabs' }],
    })
    expect(c.droppedHeaderChrome).toEqual([])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['below'])
  })
})
