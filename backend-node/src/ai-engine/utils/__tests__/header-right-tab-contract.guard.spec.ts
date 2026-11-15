/**
 * P0-2（2026-11-15 · mc-max-1794717024986-bb0c260b 实锤）：顶层 headerSlots 兜底搬运的
 * 插槽资格复核 spec。
 *
 * 病灶链：vision 把 body 首段 `88:32 '0sub-header'`（当日总流量标题行，380×30.4，
 * 含 24 小时筛选控件）标成 `slotCandidate=header-right`；
 *   - visual-parser 装配前刀65-B 复核**已撤销** `sections[0].slotCandidate`；
 *   - 但 `layoutStructure.headerSlots` 是**另一份独立数据**，仍留着同一条；
 *   - `recoverHeaderSlotContract` 末尾兜底分支无条件搬入 ⇒ 撤销失效
 *     ⇒ 整段 ContentDailyTotalFlow 装进 38px 面板头，与主题开关重叠。
 *
 * 治本：兜底搬运必须过**同一**资格判据
 * （inline-header-slot-inferrer.js#evaluateSlotFlowCoResidency），判据单一来源。
 */
import { recoverHeaderSlotContract } from '../header-right-tab-contract.js'

const bb = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

/** 真机几何（figma-node-data.json 逐字）：面板根 / 真面板头 / body 容器 / body 首段。 */
const PANEL_TREE = {
  id: '2:9778',
  type: 'FRAME',
  name: 'cp-流量监测',
  absoluteBoundingBox: bb(10, 109, 425.8, 807),
  children: [
    {
      id: '2:3550',
      type: 'GROUP',
      name: 'header-',
      absoluteBoundingBox: bb(35.8, 119.1, 380, 32.5),
      children: [],
    },
    {
      id: '1744:125',
      type: 'FRAME',
      name: 'slot-con',
      absoluteBoundingBox: bb(10, 158.7, 425.8, 745.3),
      children: [
        { id: '88:32', absoluteBoundingBox: bb(35.8, 158.7, 380, 30.4), children: [] },
        { id: '2:3660', absoluteBoundingBox: bb(10, 196, 425.8, 91.4), children: [] },
        { id: '1744:127', absoluteBoundingBox: bb(33.8, 287, 379, 131), children: [] },
        { id: '1744:128', absoluteBoundingBox: bb(33.8, 428, 379, 131), children: [] },
        { id: '2:3439', absoluteBoundingBox: bb(36.8, 573, 86, 24.3), children: [] },
        { id: '1263:38', absoluteBoundingBox: bb(32.8, 601, 387, 114), children: [] },
      ],
    },
  ],
}

const layoutStructureWith = (sections: any[], headerSlots: any[]) => ({
  layout: { sections },
  headerSlots,
})

describe('P0-2 · 顶层 headerSlots 兜底搬运的资格复核', () => {
  test('阳性（真机 88:32）：body 首段被标 header-right ⇒ 兜底拒绝搬运', () => {
    const sections = [
      { id: '88:32', name: '当日总流量标题行', slotCandidate: null },
      { id: '2:3660', name: '当日总流量统计' },
      { id: '1744:127', name: '小时流量图' },
      { id: '1744:128', name: '大桥小时流量图' },
      { id: '2:3439', name: '车型分布标题' },
      { id: '1263:38', name: '车型分布卡片' },
    ]
    const layoutStructure = layoutStructureWith(sections, [
      {
        slotType: 'header-right',
        elementType: 'statistic',
        content: '当日总流量标题行',
        sectionId: '88:32',
        figmaNodeId: '',
      },
    ])
    const r = recoverHeaderSlotContract({ headerSlots: [], layoutStructure, figmaNodeData: PANEL_TREE })
    expect(r.stats.guardRejected).toBe(1)
    expect(r.stats.recovered).toBe(0)
    expect(r.headerSlots).toHaveLength(0)
  })

  test('阴性（真机 2:3550 真面板头）：父为面板根 ⇒ 允许搬运', () => {
    const sections = [
      { id: '2:3550', name: '面板头' },
      { id: '88:32', name: '当日总流量标题行' },
      { id: '1744:127', name: '小时流量图' },
      { id: '1744:128', name: '大桥小时流量图' },
    ]
    const layoutStructure = layoutStructureWith(sections, [
      { slotType: 'header-right', elementType: 'label', content: '主题', sectionId: '2:3550' },
    ])
    const r = recoverHeaderSlotContract({ headerSlots: [], layoutStructure, figmaNodeData: PANEL_TREE })
    expect(r.stats.guardRejected).toBe(0)
    expect(r.stats.recovered).toBe(1)
    expect(r.headerSlots).toHaveLength(1)
    expect(r.headerSlots[0].sectionId).toBe('2:3550')
  })

  test('fail-open：无 figmaNodeData ⇒ 证据不足，按原行为搬运', () => {
    const layoutStructure = layoutStructureWith(
      [{ id: '88:32' }, { id: '1744:127' }, { id: '1744:128' }],
      [{ slotType: 'header-right', sectionId: '88:32', content: 'x' }],
    )
    const r = recoverHeaderSlotContract({ headerSlots: [], layoutStructure })
    expect(r.stats.guardRejected).toBe(0)
    expect(r.stats.recovered).toBe(1)
  })

  test('fail-open：锚点不在 Figma 树中 ⇒ 不拦', () => {
    const layoutStructure = layoutStructureWith(
      [{ id: 'unknown:1' }],
      [{ slotType: 'header-right', sectionId: 'unknown:1', content: 'x' }],
    )
    const r = recoverHeaderSlotContract({
      headerSlots: [],
      layoutStructure,
      figmaNodeData: PANEL_TREE,
    })
    expect(r.stats.guardRejected).toBe(0)
    expect(r.stats.recovered).toBe(1)
  })

  test('幂等：已有 header-right 契约 ⇒ 不进兜底分支（guardRejected 恒 0）', () => {
    const existing = [{ slotType: 'header-right', sectionId: '2:3550', content: '主题' }]
    const layoutStructure = layoutStructureWith(
      [{ id: '88:32' }, { id: '1744:127' }, { id: '1744:128' }],
      [{ slotType: 'header-right', sectionId: '88:32', content: '当日总流量' }],
    )
    const r = recoverHeaderSlotContract({
      headerSlots: existing,
      layoutStructure,
      figmaNodeData: PANEL_TREE,
    })
    expect(r.stats.guardRejected).toBe(0)
    expect(r.headerSlots).toHaveLength(1)
    expect(r.headerSlots[0].sectionId).toBe('2:3550')
  })

  test('stats 恒含 guardRejected（可观测，便于真机对账）', () => {
    const r = recoverHeaderSlotContract({ headerSlots: [], layoutStructure: {} })
    expect(r.stats).toHaveProperty('guardRejected')
    expect(r.stats.guardRejected).toBe(0)
  })
})
