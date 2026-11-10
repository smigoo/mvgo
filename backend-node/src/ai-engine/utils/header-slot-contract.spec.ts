/**
 * header-slot-contract 单元测试（Loop 0.A 验收）。
 * 核心：C-1 rejected 的 vision / derived headerSlots 一律不得 merge 回来。
 * 场景「纠错后 0 + derived 全 rejected → 保持 0」（021e3cf7 教训）。
 */

import { applyHeaderSlotContractRewrite, rejectedKeySet } from './header-slot-contract.js'

describe('applyHeaderSlotContractRewrite（Loop 0.A C-1 契约回写）', () => {
  // 🛡️ 2026-11-10 修订（设备 15f40155/5da4ea56 真机实锤）：derive 与 rejected 冲突时
  //   statistic/label 等**非筛选控件** derive 赢（header 多行布局，「不在标题同行」≠「不在
  //   header」）；tab/segmented/switch 保持旧防线（021e3cf7/9c3aff7f：内容区 tabs 误判高危）。
  test('statistic derive 命中 rejectedKeys → derive 赢保留（2026-11-10 翻转）', () => {
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
    expect(result.headerSlots).toHaveLength(2)
    expect(result.derivedKept).toBe(2)
    expect(result.deriveWinsOverRejected).toBe(2)
  })

  test('tab 类 derive 命中 rejectedKeys → rejected 仍赢（021e3cf7/9c3aff7f 防线保留）', () => {
    const rejectedNodes = [{ figmaNodeId: 'tab-x', slotCandidate: { content: '内容区tabs' } }]
    const contractSlots = [
      { slotType: 'header-right', elementType: 'tab', content: '内容区tabs', figmaNodeId: 'tab-x' },
    ]
    const result = applyHeaderSlotContractRewrite({
      headerSlots: [],
      contractSlots,
      rejectedNodes,
    })
    expect(result.headerSlots).toEqual([])
    expect(result.derivedKept).toBe(0)
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
    expect(result.headerSlots.map((s) => s.content).sort()).toEqual(['合法统计', '被拒'])
    expect(result.derivedKept).toBe(2)
  })

  test('vision existing 命中 rejectedKeys 也被剔除（纠错生效，不受修订影响）', () => {
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
