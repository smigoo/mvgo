/**
 * Loop 2.1.C：header vs content 互斥表。
 * 每个 figmaNodeId 只允许落 slots[] 或 blocks[role=content] 之一，避免 header 统计双份。
 * chrome 标题不进 content、也不进 headerSlots；业务 stat/tab 除外（保留在 slots）。
 */
import { resolveNodeExclusivity } from './node-exclusivity.js'

describe('Loop 2.1.C resolveNodeExclusivity', () => {
  test('同一 figmaNodeId 同时出现在 slot 和 section → section(content) 赢，slot 被剔除', () => {
    const slots = [{ slotType: 'header-right', figmaNodeId: 'stat-1', elementType: 'statistic' }]
    const sections = [
      {
        id: 'sec-header-stats',
        role: 'content',
        body: { children: [{ id: 'c1', figmaNode: 'stat-1' }] },
      },
    ]
    const out = resolveNodeExclusivity(slots, sections)
    expect(out.slots).toHaveLength(0)
    expect(out.sections).toHaveLength(1)
    expect(out.removedSlots.map((s) => s.figmaNodeId)).toEqual(['stat-1'])
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
