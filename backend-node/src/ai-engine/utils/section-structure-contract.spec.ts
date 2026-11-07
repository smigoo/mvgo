import { buildSectionStructureContract } from './section-structure-contract.js'

const leaf = (id: string, type = 'content', extra: any = {}) => ({ id, type, ...extra })
const container = (id: string, children: any[]) => ({
  id,
  type: 'container',
  isLayoutContainer: true,
  children,
})

describe('section 装配结构契约', () => {
  test('parent/children 只描述装配树，不混入折叠叶或内容 children', () => {
    const sections = [container('root', [
      leaf('text', 'text', {
        collapsed: true,
        children: [leaf('prototype')],
        body: { children: [{ text: '业务内容' }] },
        internalTree: { children: [{ id: 'internal' }] },
      }),
      container('nested', [leaf('grid', 'grid')]),
    ])]
    const c = buildSectionStructureContract(sections)
    expect(c.byId.get('root')).toMatchObject({ contentType: 'container', parent: null, children: ['text', 'nested'] })
    expect(c.byId.get('text')).toMatchObject({ contentType: 'text', parent: 'root', children: [] })
    expect(c.byId.get('grid')).toMatchObject({ parent: 'nested', placement: 'body' })
    expect(c.byId.has('prototype')).toBe(false)
    expect(c.byId.has('internal')).toBe(false)
  })

  test('headerSlots 节点证据优先，虚假 id 回退安全 type=header', () => {
    const sections = [leaf('h', 'header', { sourceNodeIds: ['real-h'] }), leaf('b')]
    const matched = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'real-h' }],
    })
    expect(matched.headerLeaves.map((s) => s.id)).toEqual(['h'])
    const fallback = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'vision-fake' }],
    })
    expect(fallback.headerLeaves.map((s) => s.id)).toEqual(['h'])
  })

  test('slot.sectionId 与子节点 figmaNodeId 并存时均可匹配，宿主 body 不再重复落 body', () => {
    const sections = [
      leaf('2:7959', 'header', {
        sourceNodeIds: ['2:7959'],
        body: { children: [{ type: 'text', text: '重点车辆监测' }] },
      }),
      leaf('136:122', 'list', { sourceNodeIds: ['136:122'] }),
    ]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{
        slotType: 'header-right',
        figmaNodeId: '2:7954',
        sectionId: '2:7959',
      }],
    })
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['2:7959'])
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['136:122'])
    expect(c.stats).toMatchObject({ headerSlotsEmitted: 1, bodyRoots: 1 })
  })

  test('业务型 header 留 body，纯标题 header 才可回退入槽', () => {
    const c = buildSectionStructureContract([
      leaf('business', 'header', { declaredContent: { items: [{ text: '厂商' }] } }),
      leaf('title', 'header'),
    ])
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['title'])
    expect(c.byId.get('business')?.placement).toBe('body')
  })

  test('多候选唯一化后落选者显式归 body，不消失', () => {
    const c = buildSectionStructureContract([leaf('h1', 'header'), leaf('h2', 'header'), leaf('b')])
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['h1'])
    expect(c.byId.get('h2')?.placement).toBe('body')
    expect(c.bodyRoots.map((s) => s.id)).toEqual(['h2', 'b'])
    expect(c.droppedHeaderLeaves.map((s) => s.id)).toEqual(['h2'])
  })

  test('嵌套入槽叶保留父链，但只有其他 body 后代时祖先才进入 bodyRoots', () => {
    const withBody = buildSectionStructureContract([
      container('root', [leaf('slot', 'tabs', { sourceNodeIds: ['slot-node'] }), leaf('b')]),
    ], { headerSlots: [{ slotType: 'title-right', id: 'slot-node' }] })
    expect(withBody.byId.get('slot')).toMatchObject({ parent: 'root', placement: 'header-right' })
    expect(withBody.bodyRoots.map((s) => s.id)).toEqual(['root'])

    const slotOnly = buildSectionStructureContract([
      container('root', [leaf('slot', 'tabs', { sourceNodeIds: ['slot-node'] })]),
    ], { headerSlots: [{ slotType: 'title-right', id: 'slot-node' }] })
    expect(slotOnly.bodyRoots).toEqual([])
    expect(slotOnly.bodyLeaves).toEqual([])
  })

  test('不修改输入，重复执行结果一致', () => {
    const sections = [container('root', [leaf('h', 'header'), leaf('b')])]
    const snapshot = JSON.stringify(sections)
    const first = buildSectionStructureContract(sections)
    const second = buildSectionStructureContract(sections)
    expect(JSON.stringify(sections)).toBe(snapshot)
    expect(second.stats).toEqual(first.stats)
    expect(second.bodyRoots.map((s) => s.id)).toEqual(first.bodyRoots.map((s) => s.id))
  })
})

/**
 * 🛡️ 2026-11-06（mc-max-1793918742773-f91aa545 实锤「插槽又去了内容部分」）
 *
 * 真机：vision 从未产出 `type==='header'` 的段（标题栏被当 chrome 过滤），headerSlots 的
 * figmaNodeId 又是「设备类型/28…」这类文本/统计节点、不在任何段的 sourceNodeIds 里
 * ⇒ 上面两条候选路径全空 ⇒ `headerSlotsEmitted=0` ⇒ index 无 `#header-right` ⇒
 * 插槽内容（设备类型 28 / 设备总数 68562 / 完好率 98%）退回 body，被渲成 StatsSection。
 *
 * 修法：planner 按「isPanelHeader ∧ 有插槽业务内容」保住宿主并打 `_headerSlotHost`，
 * 本契约认这个**显式事实**兜底（不靠 type 猜、不做几何推断）。
 */
describe('section 装配结构契约 · 插槽宿主显式兜底（f91aa545）', () => {
  test('⭐ 阳性：无 type=header 段时，_headerSlotHost 段成为插槽叶（bodyLeaves 不再重复渲染它）', () => {
    const sections = [
      leaf('89:38', 'content', { _headerSlotHost: true, sourceNodeIds: ['89:38'] }),
      leaf('89:37', 'content', { sourceNodeIds: ['89:37'] }),
      leaf('89:42', 'content', { sourceNodeIds: ['89:42'] }),
    ]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: '89:39' }],
    })
    expect(c.stats.headerSlotsEmitted).toBe(1)
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['89:38'])
    expect(c.bodyLeaves.map((s) => s.id)).toEqual(['89:37', '89:42'])
    expect(c.byId.get('89:38').placement).toBe('header-right')
  })

  test('反向：没有 _headerSlotHost 时行为逐字不变（仍 0 个插槽叶，不凭空造）', () => {
    const sections = [leaf('a', 'content'), leaf('b', 'content')]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'ghost' }],
    })
    expect(c.stats.headerSlotsEmitted).toBe(0)
    expect(c.bodyLeaves.map((s) => s.id)).toEqual(['a', 'b'])
  })

  test('反向：type=header 与 _headerSlotHost 同时存在 ⇒ type 优先（显式兜底不抢戏）', () => {
    const sections = [leaf('h', 'header', { sourceNodeIds: ['real-h'] }), leaf('x', 'content', { _headerSlotHost: true })]
    const c = buildSectionStructureContract(sections, {
      headerSlots: [{ slotType: 'header-right', figmaNodeId: 'real-h' }],
    })
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['h'])
  })
})

/**
 * 🛡️ 2026-11-07（mc-max-1794041862682-9f43a112 实锤）：**尊重插槽资格复核的撤单**。
 *
 * 真机病灶：段 2:8419（设备监测统计栏，146 行组件）被插槽资格复核撤销
 * （`emptyBodyAndItems` ⇒ 段留 body），但其子节点（2:8429/2:8431 统计值）被 derived 成
 * header-right 插槽；结构契约按 `sourceNodeIds ⊇ 插槽节点 id` 匹配 ⇒ **整个父段被拉进
 * 38px 定高的 #header-right** ⇒ 溢出压住 body（两张统计卡被盖、视觉分 0.15）。
 *
 * 修法：visual-parser 撤单时把 `_slotRevoked` 挂到段对象（单一事实源），契约照办。
 */
describe('section 装配结构契约 · 撤单段回落 body（9f43a112）', () => {
  const statsSection = (id: string, extra: any = {}) => ({
    id,
    type: 'stats',
    sourceNodeIds: [id, `${id}-c1`, `${id}-c2`],
    ...extra,
  })
  const SLOTS = [
    { slotType: 'header-right', figmaNodeId: '2:8419-c1' },
    { slotType: 'header-right', figmaNodeId: '2:8419-c2' },
  ]

  it('⭐ 阳性（9f43a112 形态）：段被撤单（_slotRevoked）且插槽 id 命中其子节点 ⇒ 不作 header 叶，回落 body', () => {
    const sections = [
      statsSection('2:8419', { _slotRevoked: 'emptyBodyAndItems' }),
      statsSection('2:8787'),
    ]
    const c = buildSectionStructureContract(sections, { headerSlots: SLOTS })
    expect(c.stats.slotRevokedRespected).toBe(1)
    expect(c.stats.headerSlotsEmitted).toBe(0)
    expect(c.headerLeaves).toHaveLength(0)
    expect(c.bodyLeaves.map((s) => s.id)).toEqual(['2:8419', '2:8787'])
    expect(c.byId.get('2:8419').placement).toBe('body')
  })

  it('零回归：未撤单的段仍按原逻辑匹配进插槽（3e924a69 修复不受影响）', () => {
    const sections = [
      statsSection('2:8419'),
      statsSection('2:8787'),
    ]
    const c = buildSectionStructureContract(sections, { headerSlots: SLOTS })
    expect(c.stats.slotRevokedRespected).toBe(0)
    expect(c.headerLeaves.map((s) => s.id)).toEqual(['2:8419'])
  })

  it('反向：matched 全被撤 ⇒ 不产 header 叶，也不回落 _headerSlotHost 兜底', () => {
    const sections = [
      statsSection('2:8419', { _slotRevoked: 'emptyBodyAndItems', _headerSlotHost: true }),
      statsSection('2:8787'),
    ]
    const c = buildSectionStructureContract(sections, { headerSlots: SLOTS })
    expect(c.headerLeaves).toHaveLength(0)
    expect(c.bodyLeaves).toHaveLength(2)
  })
})
