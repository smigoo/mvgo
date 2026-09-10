/**
 * header-slot-contract 单元测试（Loop 0.A 验收）。
 * 核心：C-1 rejected 的 vision / derived headerSlots 一律不得 merge 回来。
 * 场景「纠错后 0 + derived 全 rejected → 保持 0」（021e3cf7 教训）。
 */

import { applyHeaderSlotContractRewrite, rejectedKeySet } from './header-slot-contract.js'

describe('applyHeaderSlotContractRewrite（Loop 0.A C-1 契约回写）', () => {
  test('vision 纠错后 0 且 derived 全在 rejectedKeys → headerSlots 保持 0', () => {
    const rejectedNodes = [
      { figmaNodeId: 'node-1', slotCandidate: { content: 'header-统计' } },
      { figmaNodeId: 'node-2', slotCandidate: { content: 'header-流量' } },
    ]
    const contractSlots = [
      { slotType: 'header-right', elementType: 'statistic', content: 'header-统计', figmaNodeId: 'node-1' },
      { slotType: 'header-right', elementType: 'statistic', content: 'header-流量', figmaNodeId: 'node-2' },
    ]
    const result = applyHeaderSlotContractRewrite({
      headerSlots: [],
      contractSlots,
      rejectedNodes,
    })
    expect(result.headerSlots).toEqual([])
    expect(result.derivedKept).toBe(0)
    expect(result.visionKept).toBe(0)
  })

  test('derived 未被 rejected 的 slot 正常并入', () => {
    const rejectedNodes = [{ figmaNodeId: 'node-1' }]
    const contractSlots = [
      { elementType: 'statistic', content: '合法统计', figmaNodeId: 'node-9' },
      { elementType: 'statistic', content: '被拒', figmaNodeId: 'node-1' },
    ]
    const result = applyHeaderSlotContractRewrite({
      headerSlots: [],
      contractSlots,
      rejectedNodes,
    })
    expect(result.headerSlots.map((s) => s.content)).toEqual(['合法统计'])
    expect(result.derivedKept).toBe(1)
  })

  test('vision existing 命中 rejectedKeys 也被剔除（纠错生效）', () => {
    const rejectedNodes = [{ figmaNodeId: 'vision-x' }]
    const result = applyHeaderSlotContractRewrite({
      headerSlots: [{ elementType: 'statistic', content: '错绑统计', figmaNodeId: 'vision-x' }],
      contractSlots: [],
      rejectedNodes,
    })
    expect(result.headerSlots).toEqual([])
    expect(result.visionKept).toBe(0)
  })

  test('rejectedKeySet 提取 figmaNodeId / slotCandidate.content', () => {
    const keys = rejectedKeySet([
      { figmaNodeId: 'n1' },
      { slotCandidate: { figmaNodeId: 'n2' } },
      { slotCandidate: { content: 'txt' } },
      {},
    ])
    expect([...keys].sort()).toEqual(['n1', 'n2', 'txt'])
  })
})
