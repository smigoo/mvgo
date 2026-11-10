/**
 * Loop 2.1.C：header vs content 互斥表。
 * 每个 figmaNodeId 只允许落 slots[] 或 blocks[role=content] 之一，避免 header 统计双份。
 * chrome 标题不进 content、也不进 headerSlots；业务 stat/tab 除外（保留在 slots）。
 */
import { resolveNodeExclusivity } from './node-exclusivity.js'

describe('Loop 2.1.C resolveNodeExclusivity', () => {
  // 🛡️ 2026-11-10 修订（设备 15f40155/重点车辆 084e8c19 真机实锤）：header 专属插槽通道
  //   （title-left/title-right/header-right）重叠时 **slot 赢**——旧口径「content 赢」清空
  //   headerSlots ⇒ T09 无数据可兜底 ⇒ 头部统计词全丢 + 胶囊塞内容区。slot 赢时 content 侧
  //   同 node 仍被移除，「防双份渲染」目的不变。
  test('header 专属通道 statistic 重叠 → slot 赢，content 侧同 node 移除（2026-11-10 翻转）', () => {
    const slots = [{ slotType: 'header-right', figmaNodeId: 'stat-1', elementType: 'statistic' }]
    const sections = [
      {
        id: 'sec-header-stats',
        role: 'content',
        body: { children: [{ id: 'c1', figmaNode: 'stat-1' }] },
      },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    expect(out.slots.map((s) => s.figmaNodeId)).toEqual(['stat-1'])
    expect(out.removedContentNodes).toEqual(['stat-1'])
    const contentNodes = out.sections.flatMap((s) =>
      (s.body?.children || []).map((c) => c.figmaNode),
    )
    expect(contentNodes).not.toContain('stat-1')
  })

  test('label 形态（下划线 slotType 归一）重叠同样 slot 赢（重点车辆胶囊实况）', () => {
    const slots = [
      { slot_type: undefined, slotType: 'header_right', figmaNodeId: '2:7954', elementType: 'label' },
    ]
    const sections = [
      { id: 'sec-h', role: 'content', body: { children: [{ id: 'c9', figmaNode: '2:7954' }] } },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    expect(out.slots).toHaveLength(1)
    expect(out.removedContentNodes).toEqual(['2:7954'])
  })

  test('无 slotType 的 slot 重叠保持旧裁决（content 赢，向后兼容）', () => {
    const slots = [{ figmaNodeId: 'm-1', elementType: 'statistic' }]
    const sections = [
      { id: 'sec-m', role: 'content', body: { children: [{ id: 'c5', figmaNode: 'm-1' }] } },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    expect(out.slots).toHaveLength(0)
    expect(out.removedSlots.map((s) => s.figmaNodeId)).toEqual(['m-1'])
  })

  test('仅 slot 出现的 node 保留在 slots', () => {
    const slots = [{ slotType: 'title-right', figmaNodeId: 'icon-9', elementType: 'icon' }]
    const out = resolveNodeExclusivity(slots, [])
    expect(out.slots).toHaveLength(1)
  })

  test('chrome 标题（title-itself）不进 content 也不进 headerSlots', () => {
    const slots = [{ slotType: 'title-right', figmaNodeId: 'title-1', elementType: 'title' }]
    const sections = [
      { id: 'sec-t', role: 'chrome', body: { children: [{ id: 'c2', figmaNode: 'title-1' }] } },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    expect(out.slots).toHaveLength(0)
    const contentNodes = out.sections.flatMap((s) =>
      (s.body?.children || []).map((c) => c.figmaNode),
    )
    expect(contentNodes).not.toContain('title-1')
  })

  test('业务 tab/stat 重叠时保留在 slots（不因 content 重复而误删 header 交互）', () => {
    const slots = [{ slotType: 'header-right', figmaNodeId: 'tab-1', elementType: 'tab' }]
    const sections = [
      { id: 'sec-x', role: 'content', body: { children: [{ id: 'c3', figmaNode: 'tab-1' }] } },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    // 业务交互控件保留 slot；content 侧同 node 被移除，避免双份 DOM
    expect(out.slots.map((s) => s.figmaNodeId)).toContain('tab-1')
    const contentNodes = out.sections.flatMap((s) =>
      (s.body?.children || []).map((c) => c.figmaNode),
    )
    expect(contentNodes).not.toContain('tab-1')
  })
})
