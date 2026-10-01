/**
 * Loop 2.0.D：内容区 @antd/tab 不得被编成 header-right。
 * 🔴 2026-09-30（用户契约「文本处理命名无关」）：`header-` / `title-` 图层名前缀兜底**已删** ——
 *   它属于「按图层名判归属并把行名当 UI 文案输出」，且在真实语料里产出的 content 就是 `header-` 原文。
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

  test('🔴 header- 前缀行不再是事实 → 0 个 slot（按名兜底已删，不以行名作文案）', () => {
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
    expect(slots).toEqual([])
  })
})
