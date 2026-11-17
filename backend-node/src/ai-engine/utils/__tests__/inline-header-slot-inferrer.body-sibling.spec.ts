/**
 * 刀65-B 第三支（2026-11-15 · mc-max-1794717024986-bb0c260b 实锤）：
 * 「流式容器共居」插槽资格复核 spec。
 *
 * 病灶：vision 把 `88:32 '0sub-header'`（当日总流量标题行，380×30.4，含 24 小时筛选控件）
 * 判成 `slotCandidate=header-right` + `headerRelation=title-same-row`，
 * 前两支判据都漏（锚点 380px ≫ 24px；body 非空、header.controls 非空）
 * ⇒ 整段 `ContentDailyTotalFlow` 被装进 base-panel 的 #header-right，
 * 与主题开关挤在 38px 面板头里重叠。
 *
 * Figma 真值几何（同一份 figma-node-data.json）：
 *   面板根 2:9778   x=10   y=109   w=425.8 h=807
 *   真面板头 2:3550  x=35.8 y=119.1 w=380   h=32.5   父=根
 *   body 容器 1744:125 x=10 y=158.7 w=425.8 h=745.3  父=根
 *   88:32          x=35.8 y=158.7 w=380   h=30.4   父=1744:125（与 5 个 section 同父）
 *
 * 判据：段锚点与 ≥2 个**其它 preview section** 同父 ∧ 父高 ≥ 段高×2 ⇒ 撤销。
 */
import {
  revokeUnqualifiedHeaderSlotCandidates,
  evaluateSlotFlowCoResidency,
  collectSectionIdSet,
  SLOT_SIBLING_SECTION_MIN,
  SLOT_PARENT_HEIGHT_RATIO_MIN,
} from '../inline-header-slot-inferrer.js'

const bb = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

/** 真机裁剪版：只保留与判据相关的节点，几何逐字取自 figma-node-data.json。 */
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
        {
          id: '88:32',
          type: 'FRAME',
          name: '0sub-header',
          absoluteBoundingBox: bb(35.8, 158.7, 380, 30.4),
          children: [],
        },
        {
          id: '2:3660',
          type: 'FRAME',
          name: '1统计',
          absoluteBoundingBox: bb(10, 196, 425.8, 91.4),
          children: [],
        },
        {
          id: '1744:127',
          type: 'FRAME',
          name: '2charts',
          absoluteBoundingBox: bb(33.8, 287, 379, 131),
          children: [],
        },
        {
          id: '1744:128',
          type: 'FRAME',
          name: '3charts',
          absoluteBoundingBox: bb(33.8, 428, 379, 131),
          children: [],
        },
        {
          id: '2:3439',
          type: 'GROUP',
          name: '4sub-header',
          absoluteBoundingBox: bb(36.8, 573, 86, 24.3),
          children: [],
        },
        {
          id: '1263:38',
          type: 'FRAME',
          name: '5cards',
          absoluteBoundingBox: bb(32.8, 601, 387, 114),
          children: [],
        },
      ],
    },
  ],
}

/** 真机 7 段（顺序与 vision layout.sections 一致）。 */
const panelSections = () => [
  {
    id: '88:32',
    name: '当日总流量标题行',
    slotCandidate: { slotType: 'header-right', content: '当日总流量标题行' },
    headerRelation: 'title-same-row',
    header: { title: '当日总流量', controls: [{ name: '时间范围选择' }] },
    body: { children: [] },
  },
  { id: '2:3660', name: '当日总流量统计', slotCandidate: null, headerRelation: 'content-below-title' },
  { id: '1744:127', name: '小时流量图', slotCandidate: null, headerRelation: 'content-below-title' },
  { id: '1744:128', name: '大桥小时流量图', slotCandidate: null, headerRelation: 'content-below-title' },
  { id: '2:3439', name: '车型分布标题', slotCandidate: null, headerRelation: 'content-below-title' },
  { id: '1263:38', name: '车型分布卡片', slotCandidate: null, headerRelation: 'content-below-title' },
  { id: '2:3571', name: '流量预测标题', slotCandidate: null, headerRelation: 'content-below-title' },
]

describe('刀65-B ③ · 流式容器共居判据', () => {
  test('阳性 A（真机 88:32）：与 5 个 section 同父于 slot-con ⇒ 撤销 header-right', () => {
    const sections = panelSections()
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, PANEL_TREE)
    expect(r.evaluated).toBe(1)
    expect(r.revoked).toBe(1)
    expect(r.revokedIds).toEqual(['88:32'])
    expect(r.reasons['88:32']).toContain(`bodySiblingSections=5>=${SLOT_SIBLING_SECTION_MIN}`)
    expect(sections[0].slotCandidate).toBeNull()
  })

  test('阳性 B：撤销时 header.slotCandidate 同步置 null（ensureHeaderSlots 第二读取口）', () => {
    const sections = [
      {
        id: '88:32',
        slotCandidate: null,
        header: {
          slotCandidate: { slotType: 'header-right' },
          controls: [{ name: '时间范围选择' }],
        },
        body: { children: [] },
      },
      ...panelSections().slice(1),
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, PANEL_TREE)
    expect(r.revoked).toBe(1)
    expect((sections[0] as any).header.slotCandidate).toBeNull()
  })

  test('阴性 A（真机 2:3550 真面板头）：父为面板根 ⇒ 即便兄弟含 section 也不撤', () => {
    const sections = [
      {
        id: '2:3550',
        name: '面板头',
        slotCandidate: { slotType: 'header-right' },
        body: { children: [{ id: 'x', type: 'text' }] },
      },
      ...panelSections(),
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, PANEL_TREE)
    // 2:3550 的父 = 面板根 2:9778 ⇒ 第三支不判；88:32 仍应被撤
    expect(r.revokedIds).not.toContain('2:3550')
    expect(r.revokedIds).toContain('88:32')
    expect((sections[0] as any).slotCandidate).not.toBeNull()
  })

  test('阴性 B：同父只有 1 个其它 section ⇒ 不达阈值（≥2）不撤', () => {
    const tree = {
      id: 'root',
      absoluteBoundingBox: bb(0, 0, 400, 800),
      children: [
        {
          id: 'box',
          absoluteBoundingBox: bb(0, 100, 400, 700),
          children: [
            { id: 'S', absoluteBoundingBox: bb(0, 100, 400, 30) },
            { id: 'T', absoluteBoundingBox: bb(0, 200, 400, 400) },
          ],
        },
      ],
    }
    const sections = [
      { id: 'S', slotCandidate: 'header-right', body: { children: [{ id: 'a' }] } },
      { id: 'T', slotCandidate: null },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, tree)
    expect(r.revoked).toBe(0)
    expect((sections[0] as any).slotCandidate).toBe('header-right')
  })

  test('阴性 C：父高不足段高×2（父紧包该段）⇒ 不撤', () => {
    const tree = {
      id: 'root',
      absoluteBoundingBox: bb(0, 0, 400, 800),
      children: [
        {
          id: 'box',
          absoluteBoundingBox: bb(0, 0, 400, 40), // 父只比段高 10px
          children: [
            { id: 'S', absoluteBoundingBox: bb(0, 0, 400, 30) },
            { id: 'T', absoluteBoundingBox: bb(0, 30, 400, 10) },
            { id: 'U', absoluteBoundingBox: bb(0, 30, 400, 10) },
          ],
        },
      ],
    }
    const sections = [
      { id: 'S', slotCandidate: 'header-right', body: { children: [{ id: 'a' }] } },
      { id: 'T', slotCandidate: null },
      { id: 'U', slotCandidate: null },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, tree)
    expect(r.revoked).toBe(0)
  })

  test('fail-open：锚点在 Figma 树中查不到 ⇒ 第三支不判', () => {
    const sections = [
      { id: '99:99', slotCandidate: 'header-right', body: { children: [{ id: 'a' }] } },
      ...panelSections(),
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, PANEL_TREE)
    expect(r.revokedIds).not.toContain('99:99')
  })

  test('fail-open：figmaNodeData=null ⇒ 第三支完全跳过（仅 ①② 生效）', () => {
    const sections = panelSections()
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, null)
    expect(r.revoked).toBe(0)
    expect((sections[0] as any).slotCandidate).not.toBeNull()
  })

  test('嵌套 children 的 section id 也计入兄弟集合（不丢层级）', () => {
    const sections = [
      { id: '88:32', slotCandidate: 'header-right', body: { children: [{ id: 'a' }] } },
      {
        id: 'wrap',
        children: [
          { id: '1744:127', slotCandidate: null },
          { id: '1744:128', slotCandidate: null },
        ],
      },
    ]
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, PANEL_TREE)
    expect(r.revokedIds).toEqual(['88:32'])
  })

  test('阈值常量可辩驳：兄弟≥2、父高≥2倍', () => {
    expect(SLOT_SIBLING_SECTION_MIN).toBe(2)
    expect(SLOT_PARENT_HEIGHT_RATIO_MIN).toBe(2)
  })
})

/**
 * 🔴 2026-11-17 治本（mc-max-1794911885243-30260c7a 实锤）：父=面板根的短路移除。
 * 真机：Tab 栏 2:9020（statistic 带 slotCandidate=header-right）与列表 2:8869、
 * 分割线 2:9047 同为面板根 3 个平级 section；旧逻辑 `parentId===rootId ⇒ keep`
 * 使其绕过共居判据塞进 #header-right。真面板头父亦为根，但兄弟 section<2，
 * 走同一判据自动 keep。下面阴阳对照锁死「根父不再无条件放行」。
 */
describe('刀65-B ③ 补强 · 父=面板根也走共居判据（2026-11-17）', () => {
  const ROOT = '2:9778'
  // 面板根下 3 个平级 section：Tab(h=38) / 列表(h=242) / 分割线(h=2)
  const rootTree = () => ({
    id: ROOT,
    absoluteBoundingBox: bb(10, 109, 420, 336),
    children: [
      { id: '2:9020', absoluteBoundingBox: bb(20, 119, 380, 38), children: [] }, // Tab 栏
      { id: '2:8869', absoluteBoundingBox: bb(20, 160, 380, 242), children: [] }, // 列表
      { id: '2:9047', absoluteBoundingBox: bb(20, 405, 380, 2), children: [] }, // 分割线
    ],
  })

  test('阳性（真机 2:9020）：父=面板根 + 兄弟2段 + 父高336≥38×2 ⇒ reject', () => {
    const tree = rootTree()
    const sections = [
      { id: '2:9020', slotCandidate: 'header-right', body: { children: [{ id: 'tab' }] } },
      { id: '2:8869', slotCandidate: null },
      { id: '2:9047', slotCandidate: null },
    ]
    const ids = collectSectionIdSet(sections)
    const v = evaluateSlotFlowCoResidency('2:9020', ids, tree)
    expect(v.verdict).toBe('reject')
    expect(v.reason).toContain('bodySiblingSections=2>=2')
    // 端到端：第三支撤销，header-right 资格移除
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, tree)
    expect(r.revokedIds).toEqual(['2:9020'])
    expect((sections[0] as any).slotCandidate).toBeNull()
  })

  test('阴性（真面板头）：父=面板根但兄弟 section<2 ⇒ keep（不误伤 header 行）', () => {
    const tree = {
      id: ROOT,
      absoluteBoundingBox: bb(0, 0, 420, 336),
      children: [
        { id: '2:3550', absoluteBoundingBox: bb(20, 119, 380, 32), children: [] },
        { id: '1744:125', absoluteBoundingBox: bb(0, 158, 420, 170), children: [] }, // body 容器非 section
      ],
    }
    const sections = [
      { id: '2:3550', slotCandidate: 'header-right', body: { children: [{ id: 't' }] } },
      { id: '2:8869', slotCandidate: null }, // 在 body 容器内，非根直接子
    ]
    const ids = collectSectionIdSet(sections)
    const v = evaluateSlotFlowCoResidency('2:3550', ids, tree)
    expect(v.verdict).toBe('keep')
    expect(v.reason).toContain('bodySiblingSections=0<2')
    const r = revokeUnqualifiedHeaderSlotCandidates(sections, tree)
    expect(r.revokedIds).not.toContain('2:3550')
  })

  test('阴性（根父+兄弟2段但父高不足×2）⇒ keep：判据对根父同样要求父高', () => {
    const tree = {
      id: ROOT,
      absoluteBoundingBox: bb(0, 0, 420, 60), // 父高仅 60 < 38×2
      children: [
        { id: '2:9020', absoluteBoundingBox: bb(20, 0, 380, 38), children: [] },
        { id: '2:8869', absoluteBoundingBox: bb(20, 38, 380, 20), children: [] },
        { id: '2:9047', absoluteBoundingBox: bb(20, 46, 380, 2), children: [] }, // 兄弟补足到 2
      ],
    }
    const sections = [
      { id: '2:9020', slotCandidate: 'header-right' },
      { id: '2:8869', slotCandidate: null },
      { id: '2:9047', slotCandidate: null },
    ]
    const v = evaluateSlotFlowCoResidency('2:9020', collectSectionIdSet(sections), tree)
    expect(v.verdict).toBe('keep')
    expect(v.reason).toContain('parentH=60<segH=38x2')
  })
})
