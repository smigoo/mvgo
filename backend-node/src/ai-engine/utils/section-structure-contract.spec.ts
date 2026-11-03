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
