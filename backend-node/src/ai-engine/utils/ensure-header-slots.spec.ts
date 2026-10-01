/**
 * 🎯 E2 / R3(A)（2026-09-16）· ensureHeaderSlots 单测
 *
 * 锁定的确定性契约：
 *   ① headerRelation ∈ {title-itself,panel-title,title-note,sub-header,header-only}
 *      → section 归 header 外壳（记入 headerSectionIds），slotCandidate 确定性进 headerSlots。
 *   ② headerRelation === 'title-same-row' → slotCandidate 进 headerSlots，但 section 不记入剥离集。
 *   ③ 内容区关系（no-header / content-below-title）→ 不产 slot、不归 header。
 *   ④ 增量 union：绝不删既有 slot；同 figmaNodeId/content 去重；rejectedKeys 命中不加。
 *   ⑤ normalizeSlotCandidate：string 视为 slotType；content 缺失回退 section 标题。
 */
import {
  ensureHeaderSlots,
  normalizeSlotCandidate,
  normalizeHeaderRelation,
  inferHeaderSlotsFromInlineRows,
  HEADER_CHROME_RELATIONS,
} from './inline-header-slot-inferrer.js'

const SID_RE = /^[a-z0-9-]+$/

describe('E2/R3(A): ensureHeaderSlots（headerRelation/slotCandidate 事实优先装配）', () => {
  it('sub-header + slotCandidate(string) → 确定性产出 slot 且 section 归 header', () => {
    const sections = [
      { id: 'sub-header-tab', name: '子标题', headerRelation: 'sub-header', slotCandidate: 'header-right' },
    ]
    const r = ensureHeaderSlots(sections, [])
    expect(r.derivedCount).toBe(1)
    expect(r.headerSectionIds).toContain('sub-header-tab')
    expect(r.headerSlots).toHaveLength(1)
    expect(r.headerSlots[0]).toMatchObject({
      slotType: 'header-right',
      elementType: 'statistic',
      content: '子标题',
      sectionId: 'sub-header-tab',
    })
  })

  it('title-same-row + slotCandidate(object) → 产 slot，但 section 不记入 header 剥离集', () => {
    const sections = [
      {
        id: 'title-row',
        title: '实时车流',
        headerRelation: 'title-same-row',
        slotCandidate: { slotType: 'header-tabs', elementType: 'tab', content: '实时/历史', figmaNodeId: 'n-tab-1' },
      },
    ]
    const r = ensureHeaderSlots(sections, [])
    expect(r.derivedCount).toBe(1)
    expect(r.headerSectionIds).toHaveLength(0)
    expect(r.headerSlots[0]).toMatchObject({
      slotType: 'header-tabs',
      elementType: 'tab',
      content: '实时/历史',
      figmaNodeId: 'n-tab-1',
    })
  })

  it('内容区关系（no-header / content-below-title）→ 不产 slot、不归 header', () => {
    const sections = [
      { id: 'chart-a', headerRelation: 'no-header', slotCandidate: { content: '误挂' } },
      { id: 'chart-b', headerRelation: 'content-below-title', slotCandidate: { content: '误挂' } },
    ]
    const r = ensureHeaderSlots(sections, [])
    expect(r.derivedCount).toBe(0)
    expect(r.headerSectionIds).toHaveLength(0)
    expect(r.headerSlots).toHaveLength(0)
  })

  it('增量 union：既有 slot 全保留，同 figmaNodeId 去重（幂等）', () => {
    const existing = [{ slotType: 'header-right', elementType: 'statistic', content: '已有', figmaNodeId: 'n1' }]
    const sections = [
      { id: 's1', headerRelation: 'title-note', slotCandidate: { content: '已有', figmaNodeId: 'n1' } }, // 同 key → 去重
      { id: 's2', headerRelation: 'sub-header', slotCandidate: { content: '新增', figmaNodeId: 'n2' } },
    ]
    const r = ensureHeaderSlots(sections, existing)
    expect(r.derivedCount).toBe(1)
    expect(r.headerSlots).toHaveLength(2)
    expect(r.headerSlots[0]).toEqual(existing[0]) // 既有 slot 原样保留
    expect(r.headerSlots[1]).toMatchObject({ content: '新增', figmaNodeId: 'n2' })
    // 幂等：再跑一次不再新增
    const again = ensureHeaderSlots(sections, r.headerSlots)
    expect(again.derivedCount).toBe(0)
    expect(again.headerSlots).toHaveLength(2)
  })

  it('rejectedKeys 命中的候选不加（Loop 0.A 契约）', () => {
    const sections = [
      { id: 's1', headerRelation: 'sub-header', slotCandidate: { content: '被拒', figmaNodeId: 'n-bad' } },
    ]
    const r = ensureHeaderSlots(sections, [], { rejectedKeys: new Set(['n-bad']) })
    expect(r.derivedCount).toBe(0)
    expect(r.headerSlots).toHaveLength(0)
  })

  it('normalizeSlotCandidate：无候选返回 null；string 视为 slotType；content 回退 section 标题', () => {
    expect(normalizeSlotCandidate(null, {})).toBeNull()
    expect(normalizeSlotCandidate('', {})).toBeNull()
    const s = normalizeSlotCandidate('header-tabs', { id: 'sec-1', title: '车型分布' })
    expect(s).toMatchObject({ slotType: 'header-tabs', content: '车型分布', sectionId: 'sec-1' })
  })

  it('normalizeHeaderRelation：兼容 header.relation / relation 别名并归一化为小写', () => {
    expect(normalizeHeaderRelation({ headerRelation: 'Sub-Header' })).toBe('sub-header')
    expect(normalizeHeaderRelation({ header: { relation: 'title-itself' } })).toBe('title-itself')
    expect(normalizeHeaderRelation({ relation: 'NO-HEADER' })).toBe('no-header')
  })

  it('事实集与 chrome-section-filter 同源（防止两处口径漂移）', () => {
    expect(HEADER_CHROME_RELATIONS.has('title-itself')).toBe(true)
    expect(HEADER_CHROME_RELATIONS.has('panel-title')).toBe(true)
    expect(HEADER_CHROME_RELATIONS.has('title-note')).toBe(true)
    expect(HEADER_CHROME_RELATIONS.has('sub-header')).toBe(true)
    expect(HEADER_CHROME_RELATIONS.has('header-only')).toBe(true)
    expect(SID_RE.test('sub-header-tab')).toBe(true)
  })
})

describe('E2/R3(B): inferHeaderSlotsFromInlineRows 删除行名启发式后的几何契约', () => {
  const root = { absoluteBoundingBox: { height: 400 } }
  const topRow = (name: string, extra: any = {}) => ({
    name,
    absoluteBoundingBox: { y: 20, height: 20, width: 100 },
    ...extra,
  })
  const bottomRow = (name: string, extra: any = {}) => ({
    name,
    absoluteBoundingBox: { y: 300, height: 20, width: 50 },
    ...extra,
  })

  it('松散子串行名（含 header/title 字样但非 header-/title- 前缀）→ 不再产出 slot（子串启发式已删）', () => {
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [bottomRow('my-header-summary'), bottomRow('panel-title-bar')],
      ...root,
    } as any)
    expect(r).toEqual([])
  })

  it('🔴 命名无关：结构性前缀行（header-/title-）不再是事实 ⇒ 无几何事实时 0 slot（按名兜底已删）', () => {
    // 2026-09-30：原「0908 P1-2 受保护兜底」按图层名前缀产出 slot —— 已删。
    // 依据用户契约「文本处理命名无关：是文字就输出文字 + 样式；命名只用于 bg/icon/img 与 @ 技术栈」，
    // 且该分支在真实语料里产出的 content **就是图层名原文 `header-`**（假 UI 文案）。
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        { id: 'row-1', name: 'header-controls', layout: 'horizontal', children: [{ id: 'c1', type: 'stat-item', name: '设备类型 28' }] },
      ],
    } as any)
    expect(r).toEqual([])
  })

  it('靠几何（顶部区）+ 类型化子节点产出 slot，不再依赖 header-/title- 前缀', () => {
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        topRow('tab-x', { children: [{ id: 'c1', type: 'stat-item', name: '设备类型 28' }] }),
      ],
      ...root,
    } as any)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ slotType: 'header-right', elementType: 'statistic', figmaNodeId: 'c1' })
  })

  it('几何顶部（顶部 15%）tab/导航行 → 仍产出 header-tabs slot', () => {
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [topRow('tab-导航')],
      ...root,
    } as any)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ slotType: 'header-tabs', content: 'tab-导航' })
  })

  it('非顶部区 tab 行（内容区 @antd/tab）→ 不得编成 header slot', () => {
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [bottomRow('@antd/tab')],
      ...root,
    } as any)
    expect(r).toEqual([])
  })

  it('顶部 tab 行 + children → 结构化提取 header-tabs（LLM 路径仍生效）', () => {
    const r = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        topRow('tab-实时', { children: [{ type: 'tab-switch', name: '实时' }] }),
      ],
      ...root,
    } as any)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ slotType: 'header-tabs', elementType: 'tab', content: '实时' })
  })
})
