/**
 * Loop 2.0.D：内容区 @antd/tab 不得被编成 header-right。
 * header-/title- 前缀行仍可抽出业务 controls（0908 P1-2 保持绿）。
 */
import { inferHeaderSlotsFromInlineRows } from './inline-header-slot-inferrer.js'

describe('Loop 2.0.D inferHeaderSlotsFromInlineRows 内容 tab 不进 header', () => {
  test('行名 @antd/tab 且无 header-/title- 前缀 → 0 个 slot', () => {
    const slots = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        { id: '89:37', name: '@antd/tab', layout: 'horizontal', members: ['nav', 'cons'] },
      ],
    })
    expect(slots).toEqual([])
  })

  test('行名含 tab 但不是 title-bar/header → 0 个 slot', () => {
    const slots = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        { id: 'row-tab', name: 'slot-con/@antd/tab/cons', layout: 'horizontal' },
      ],
    })
    expect(slots).toEqual([])
  })

  test('header- 前缀行仍可抽出 stat-item（不误伤标题栏）', () => {
    const slots = inferHeaderSlotsFromInlineRows({
      inlineCompositeRows: [
        {
          id: 'row-1',
          name: 'header-controls',
          layout: 'horizontal',
          children: [{ id: 'c1', type: 'stat-item', name: '设备类型 28' }],
        },
      ],
    })
    expect(slots).toHaveLength(1)
    expect(slots[0].figmaNodeId).toBe('c1')
    expect(slots[0].elementType).toBe('statistic')
  })
})
