/**
 * A1 / A3 治本单测（2026-11-15 · mc-max-1794706325675-693c8d17）
 *
 * A1：视觉重试择优 `result = retried` 会整体丢弃首轮插槽契约 →
 *     inheritHeaderSlotsOnVisionRetry 重跑纯函数回写 + 继承首轮已验证契约。
 * A3：顶层结构化 tab 契约同步到 figmaNodeId 对应段的 headerSlots[]（幂等、数据 only）。
 */
import {
  inheritHeaderSlotsOnVisionRetry,
  syncTabContractsToSections,
} from './header-slot-contract.js'

const FIRST_LABEL = {
  slotType: 'header-right',
  elementType: 'label',
  content: '江阴靖江长江隧道 江阴大桥',
  figmaNodeId: '2:7954',
  sectionId: '136:120',
}

const TAB_CONTRACT = {
  slotType: 'header-right',
  elementType: 'tab',
  content: '江阴靖江长江隧道 江阴大桥',
  figmaNodeId: '2:7954',
  tabs: [
    { id: '2:7955', text: '江阴靖江长江隧道' },
    { id: '2:7957', text: '江阴大桥' },
  ],
}

const VALIDATION = {
  contractSlots: [TAB_CONTRACT],
  rejectedNodes: [
    {
      slotCandidate: {
        slotType: 'header-right',
        elementType: 'statistic',
        content: '头部区域',
        sectionId: '136:120',
        figmaNodeId: '',
      },
      figmaNodeId: null,
      reason: 'figma-no-same-row',
    },
  ],
}

describe('A1 inheritHeaderSlotsOnVisionRetry（重试择优不再丢插槽）', () => {
  test('真机形态：首轮 1 条 label + 重试空 + Figma tab 推导 ⇒ 得到 1 条结构化 tab 契约', () => {
    const r = inheritHeaderSlotsOnVisionRetry([FIRST_LABEL], [], VALIDATION)
    expect(r.headerSlots).toHaveLength(1)
    expect(r.headerSlots[0]).toMatchObject({
      elementType: 'tab',
      figmaNodeId: '2:7954',
    })
    expect(r.headerSlots[0].tabs).toHaveLength(2)
    expect(r.derivedKept).toBe(1)
    expect(r.inherited).toBe(0) // 同 slotKey(2:7954) 已被 derive 占位，不重复继承
  })

  test('首轮 label 与推导 tab 不同 key ⇒ 两条都保留（不丢首轮已验证成果）', () => {
    const other = { ...FIRST_LABEL, figmaNodeId: '9:999', content: '另一个头部标签' }
    const r = inheritHeaderSlotsOnVisionRetry([other], [], VALIDATION)
    expect(r.headerSlots).toHaveLength(2)
    expect(r.headerSlots.map((s: any) => s.figmaNodeId)).toEqual(['2:7954', '9:999'])
    expect(r.inherited).toBe(1)
  })

  test('tab 类 derive 命中 rejectedKeys ⇒ 历史防线仍生效，不补回', () => {
    const validation = {
      contractSlots: [TAB_CONTRACT],
      rejectedNodes: [{ figmaNodeId: '2:7954', slotCandidate: { content: '内容区tabs' } }],
    }
    const r = inheritHeaderSlotsOnVisionRetry([FIRST_LABEL], [], validation as any)
    // 首轮 label 仍是已验证事实，允许继承；但 derive 的 tab 不得突破 rejected
    expect(r.headerSlots.some((s: any) => s.elementType === 'tab')).toBe(false)
    expect(r.derivedKept).toBe(0)
  })

  test('P4 护栏：derive 有 tab 时 vision 的 tab 契约保留但按 figmaNodeId 去重，不产生双份', () => {
    const visionTab = { slotType: 'header-right', elementType: 'tab', content: '视觉版 tabs', figmaNodeId: '2:7954' }
    const r = inheritHeaderSlotsOnVisionRetry([], [visionTab], VALIDATION)
    expect(r.headerSlots).toHaveLength(1)
    expect(r.visionKept).toBe(1)
    expect(r.derivedKept).toBe(0) // 同 key 已被 vision 占位
  })

  test('重试自带插槽 + 首轮无契约 ⇒ 保留重试结果并叠加 derive', () => {
    const retrySlot = { slotType: 'title-left', elementType: 'icon', content: 'icon', figmaNodeId: 'i:1' }
    const r = inheritHeaderSlotsOnVisionRetry([], [retrySlot], VALIDATION)
    expect(r.headerSlots).toHaveLength(2)
    expect(r.visionKept).toBe(1)
    expect(r.derivedKept).toBe(1)
  })

  test('无 validation / 非数组输入 ⇒ fail-open 不抛', () => {
    expect(() => inheritHeaderSlotsOnVisionRetry(null, undefined, null as any)).not.toThrow()
    const r = inheritHeaderSlotsOnVisionRetry([FIRST_LABEL], 'not-array' as any, {} as any)
    expect(r.headerSlots).toEqual([FIRST_LABEL])
  })

  test('幂等：重复调用结果逐字一致', () => {
    const once = inheritHeaderSlotsOnVisionRetry([FIRST_LABEL], [], VALIDATION)
    const twice = inheritHeaderSlotsOnVisionRetry(once.headerSlots, [], VALIDATION)
    expect(twice.headerSlots).toEqual(once.headerSlots)
    expect(twice.inherited).toBe(0)
  })
})

function makeNestedLayout() {
  const tabSection = {
    id: '2:7954',
    name: 'Tab切换栏',
    slotCandidate: 'header-right',
    headerRelation: 'title-same-row',
    body: {
      children: [
        { id: '2:7955', type: 'tab', text: '江阴靖江长江隧道', active: true },
        { id: '2:7957', type: 'tab', text: '江阴大桥', active: false },
      ],
    },
  }
  return {
    layout: {
      sections: [
        {
          id: '136:120',
          name: 'header',
          children: [tabSection],
          // 真机里 children[] 与 body.children[] 是两份独立投影（非同一对象引用）
          body: { children: [{ ...tabSection, body: { ...tabSection.body } }] },
        },
      ],
    },
  }
}

describe('A3 syncTabContractsToSections（段级 tab 契约同步）', () => {
  test('嵌套段 children[0] 与 body.children[0] 都同步到（真机形态）', () => {
    const layout = makeNestedLayout()
    const r = syncTabContractsToSections(layout, [TAB_CONTRACT])
    expect(r.stats.tabSlots).toBe(1)
    expect(r.stats.sectionsTouched).toBe(2)
    const sec: any = (layout.layout.sections[0] as any).children[0]
    expect(sec.headerSlots).toHaveLength(1)
    expect(sec.headerSlots[0]).toMatchObject({ elementType: 'tab', figmaNodeId: '2:7954' })
  })

  test('幂等：复跑不重复追加', () => {
    const layout = makeNestedLayout()
    syncTabContractsToSections(layout, [TAB_CONTRACT])
    const r = syncTabContractsToSections(layout, [TAB_CONTRACT])
    expect(r.stats.sectionsTouched).toBe(0)
    expect(r.stats.alreadyPresent).toBe(2)
    expect((layout.layout.sections[0] as any).children[0].headerSlots).toHaveLength(1)
  })

  test('非 tab 契约（label）不动结构', () => {
    const layout = makeNestedLayout()
    const r = syncTabContractsToSections(layout, [FIRST_LABEL])
    expect(r.stats.tabSlots).toBe(0)
    expect(r.stats.sectionsTouched).toBe(0)
    expect((layout.layout.sections[0] as any).children[0].headerSlots).toBeUndefined()
  })

  test('无匹配段 ⇒ noTarget，不抛不改', () => {
    const layout = { layout: { sections: [{ id: '999:1', body: { children: [] } }] } }
    const r = syncTabContractsToSections(layout, [TAB_CONTRACT])
    expect(r.stats.noTarget).toBe(1)
    expect(r.stats.sectionsTouched).toBe(0)
  })

  test('顶层 sections 形态也支持；已有 headerSlots 数组时追加不覆盖', () => {
    const layout: any = {
      sections: [
        {
          id: '2:7954',
          headerSlots: [{ slotType: 'title-left', elementType: 'icon', figmaNodeId: 'i:1' }],
          body: { children: [] },
        },
      ],
    }
    const r = syncTabContractsToSections(layout, [TAB_CONTRACT])
    expect(r.stats.sectionsTouched).toBe(1)
    expect(layout.sections[0].headerSlots).toHaveLength(2)
    expect(layout.sections[0].headerSlots[0].elementType).toBe('icon')
  })

  test('null / 空输入 ⇒ 不抛、原样返回、不动结构', () => {
    expect(() => syncTabContractsToSections(null as any, [TAB_CONTRACT])).not.toThrow()
    expect(syncTabContractsToSections(null as any, [TAB_CONTRACT]).stats.tabSlots).toBe(0)
    expect(syncTabContractsToSections({}, null as any).stats.tabSlots).toBe(0)
    expect(syncTabContractsToSections({}, null as any).stats.sectionsTouched).toBe(0)
  })
})
