/**
 * 🛡️ G14a（2026-11-05）回归基线：**父子嵌套不是归属冲突**。
 *
 * 裂缝：`dedupeDuplicateSections` 的 R1-1 用「sourceNodeIds 有交集」判「同一节点被两段争抢」，
 *   而 `subcomponent-planner#collectSourceNodeIds:1227-1235` 是**并集累加器**——把段自身锚点
 *   + 全部子节点 id 一起收进来 ⇒ 父段的 id 集天然是后代段的超集。父段与子段一相遇必然
 *   「有交集」⇒ 被判成争抢 ⇒ 按 elementCount 收敛，丢掉父段整块内容。
 *
 * 判据（`section-tree.js` 冲突分支内，footer 之后）：交集 id **恰好命中其中一方**的自身声明
 *   身份（`sectionAnchorKey` 单一来源）⇒ 是父子关系而非争抢，双方都保留。
 *   双方身份都命中（同一节点被两个语义段争抢）= C0.3-B 阴性② 形态 ⇒ **不豁免**。
 *
 * 真机依据：`data/tasks.json` 110 条留档重放，现状 8 段被丢，其中 3 段是真丢内容
 *   （声明文本零重叠）。下面用这三处的真机形态复刻 + 阴性对照锁死作用域。
 */
import { dedupeDuplicateSections } from './section-tree.js'

// ── 真机形态复刻①：8e733a22 / $[0] —— 父段「设备标题信息」被卡片网格顶替 ──
//   父段 ids 里含子段锚点 81:8；子段 ids 是 81:8 起的一整片后代。
const deviceTitleSection = {
  id: '36:1642',
  title: '设备标题信息',
  type: 'content',
  elementCount: 6,
  sourceNodeIds: ['36:1642', '81:8'],
  items: [
    { figmaNode: '36:1643', label: '产品名称' },
    { figmaNode: '36:1644', value: 'GD-Robot-04' },
  ],
}
const deviceAttrSection = {
  id: '81:8',
  title: '设备属性详情',
  type: 'content',
  elementCount: 36,
  sourceNodeIds: ['81:8', '81:9', '81:10', '81:11', '81:12'],
  items: [
    { figmaNode: '81:9', label: '编码' },
    { figmaNode: '81:10', value: 'ROB004' },
  ],
}

// ── 真机形态复刻②：104f5a31 / $[36] —— 父段「设备头部信息」被「设备属性」顶替 ──
//   父段以 36:1693 为身份；子段把 36:1693 当众多后代之一，自身身份是 2:3550。
const deviceHeaderSection = {
  id: '36:1693',
  title: '设备头部信息',
  type: 'content',
  elementCount: 7,
  sourceNodeIds: ['36:1693', '801:3'],
  items: [
    { figmaNode: '801:3', label: '设备类型' },
    { figmaNode: '801:4', value: '28' },
  ],
}
const deviceAttrsSection = {
  id: '2:3550',
  title: '设备属性',
  type: 'content',
  elementCount: 12,
  sourceNodeIds: ['36:1693'],
  items: [
    { figmaNode: '36:1694', label: '爆闪灯' },
    { figmaNode: '36:1695', value: '开启' },
  ],
}

// ── 真机形态复刻③：e34cf391 / $[63] —— stats 行被卡片网格顶替 ──
const deviceStatsSection = {
  id: '2:8419',
  title: '设备监测',
  type: 'stats',
  elementCount: 6,
  sourceNodeIds: ['2:8419', '2:8420', '2:8421', '2:8438'],
  items: [
    { figmaNode: '2:8420', label: '设备总数' },
    { figmaNode: '2:8421', value: '完好率 98%' },
  ],
}
const deviceGridSection = {
  id: '2:8438',
  title: '卡片网格',
  type: 'grid',
  elementCount: 12,
  sourceNodeIds: ['2:8438', '2:8439', '2:8440'],
  items: [
    { figmaNode: '2:8439', label: '卡片一' },
    { figmaNode: '2:8440', label: '卡片二' },
  ],
}

describe('G14a · 父子嵌套锚点不得按 elementCount 收敛', () => {
  it('阳性①（8e733a22 真机复刻）：父段含子段锚点 → 双方都保留', () => {
    const stats = { nestedExempt: 0 }
    const r = dedupeDuplicateSections([deviceTitleSection, deviceAttrSection], null, '', stats)
    expect(r).toHaveLength(2)
    expect(r.map((s) => s.title)).toEqual(['设备标题信息', '设备属性详情'])
    expect(stats.nestedExempt).toBe(1)
  })

  it('阳性②（104f5a31 真机复刻）：子段把父段身份当后代之一 → 双方都保留', () => {
    const r = dedupeDuplicateSections([deviceHeaderSection, deviceAttrsSection])
    expect(r).toHaveLength(2)
    expect(r.map((s) => s.title)).toEqual(['设备头部信息', '设备属性'])
  })

  it('阳性③（e34cf391 真机复刻）：stats 行与卡片网格零重叠 → 双方都保留', () => {
    const r = dedupeDuplicateSections([deviceStatsSection, deviceGridSection])
    expect(r).toHaveLength(2)
    expect(r.map((s) => s.title)).toEqual(['设备监测', '卡片网格'])
  })

  it('阳性④：与数组顺序无关（子段在前、父段在后同样豁免）', () => {
    const r = dedupeDuplicateSections([deviceAttrSection, deviceTitleSection])
    expect(r).toHaveLength(2)
  })

  it('阳性⑤：identity 走 figmaAnchorId 优先 —— `id` 是语义名同样成立', () => {
    const parent = {
      ...deviceHeaderSection,
      id: 'section-device-head', // vision 的自由文本 id（真机常见形态）
      figmaAnchorId: '36:1693',
    }
    const child = {
      ...deviceAttrsSection,
      id: 'section-devic-attr',
      figmaAnchorId: '2:3550',
    }
    const r = dedupeDuplicateSections([parent, child])
    expect(r).toHaveLength(2)
  })

  it('阳性⑥：stats 计数穿透递归（layout 容器 children 内命中同样计数）', () => {
    const container = {
      id: 'container-root',
      isLayoutContainer: true,
      children: [deviceTitleSection, deviceAttrSection],
    }
    const stats = { nestedExempt: 0 }
    const r = dedupeDuplicateSections([container], null, '', stats)
    expect(r).toHaveLength(1)
    expect(r[0].children).toHaveLength(2)
    expect(stats.nestedExempt).toBe(1)
  })

  it('阳性⑦：结果幂等（二次去重段数与标题不变）', () => {
    const once = dedupeDuplicateSections([deviceTitleSection, deviceAttrSection])
    const twice = dedupeDuplicateSections(once)
    expect(twice).toHaveLength(2)
    expect(twice.map((s) => s.title)).toEqual(['设备标题信息', '设备属性详情'])
  })

  it('E1 阳性：只归一带留痕的派生身份，原始 sourceNodeIds 交集不变并由既有 R1-1 收敛', () => {
    const stats = { nestedExempt: 0, identityNormalized: 0, evaluated: 0 }
    const removed: any[] = []
    const original = {
      id: '2:8437', type: 'tabs', elementCount: 6,
      sourceNodeIds: ['2:8437'],
    }
    const derived = {
      id: '2:8437-2', _derivedFromId: '2:8437', type: 'stats', elementCount: 12,
      sourceNodeIds: ['2:8437'],
    }
    const originalIds = [...original.sourceNodeIds]
    const r = dedupeDuplicateSections([original, derived], removed, '', stats)
    expect(r).toHaveLength(1)
    expect(r[0].type).toBe('stats')
    expect(removed).toHaveLength(1)
    expect(removed[0].reason).toBe('shared-anchor-superseded')
    expect(stats).toEqual({ nestedExempt: 0, identityNormalized: 1, evaluated: 1 })
    expect(original.sourceNodeIds).toEqual(originalIds)
    expect(derived.sourceNodeIds).toEqual(['2:8437'])
  })

  it('阴性⑥：未带本管线改名留痕的原生 -N 身份不得归一', () => {
    const stats = { nestedExempt: 0, identityNormalized: 0, evaluated: 0 }
    const original = { id: '2:100', type: 'content', elementCount: 2, sourceNodeIds: ['2:100', '2:101'] }
    const nativeDerivedShape = { id: '2:100-2', type: 'content', elementCount: 5, sourceNodeIds: ['2:100'] }
    const r = dedupeDuplicateSections([original, nativeDerivedShape], null, '', stats)
    expect(r).toHaveLength(2)
    expect(stats).toEqual({ nestedExempt: 1, identityNormalized: 0, evaluated: 1 })
  })

  it('阴性⑦：更高优先级 figmaAnchorId 存在时不得被 id 留痕覆盖', () => {
    const stats = { nestedExempt: 0, identityNormalized: 0, evaluated: 0 }
    const parent = {
      id: '2:200', _derivedFromId: '2:100', figmaAnchorId: '2:200',
      type: 'content', elementCount: 2, sourceNodeIds: ['2:100'],
    }
    const derived = {
      id: '2:100-2', _derivedFromId: '2:100', type: 'content', elementCount: 5,
      sourceNodeIds: ['2:100'],
    }
    const r = dedupeDuplicateSections([parent, derived], null, '', stats)
    expect(r).toHaveLength(2)
    expect(stats).toEqual({ nestedExempt: 1, identityNormalized: 1, evaluated: 1 })
  })

  // ── 阴性对照：作用域必须收窄 ──

  it('阴性①：双方身份命中同一个交集 id（同锚争抢）→ 不豁免，仍按 elementCount 收敛', () => {
    // C0.3-B spec 阴性② 的形态：两段 id 同为 36:1693，锚点集仅部分交集
    const a = { ...deviceHeaderSection, sourceNodeIds: ['36:1693', '801:3'] }
    const b = { ...deviceAttrsSection, id: '36:1693', sourceNodeIds: ['36:1693', '999:9'] }
    const stats = { nestedExempt: 0 }
    const r = dedupeDuplicateSections([a, b], null, '', stats)
    expect(r).toHaveLength(1)
    expect(r[0].elementCount).toBe(12) // 保留内容更全的一份
    expect(stats.nestedExempt).toBe(0)
  })

  it('阴性②：交集是第三个公共节点，双方身份都不在其中 → 不豁免', () => {
    const a = {
      id: 'section-a', title: '统计区', type: 'content', elementCount: 3,
      sourceNodeIds: ['COMMON:1', 'A:1'],
    }
    const b = {
      id: 'section-b', title: '主内容区', type: 'content', elementCount: 9,
      sourceNodeIds: ['COMMON:1', 'B:1'],
    }
    const stats = { nestedExempt: 0 }
    const r = dedupeDuplicateSections([a, b], null, '', stats)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('section-b')
    expect(stats.nestedExempt).toBe(0)
  })

  it('阴性③：无 sourceNodeIds（不构成归属冲突）→ 不进入本判据，段全保留', () => {
    const a = { id: 'section-x', title: '甲', type: 'content', elementCount: 2 }
    const b = { id: 'section-y', title: '乙', type: 'content', elementCount: 5 }
    const stats = { nestedExempt: 0 }
    expect(dedupeDuplicateSections([a, b], null, '', stats)).toHaveLength(2)
    expect(stats.nestedExempt).toBe(0)
  })

  it('阴性④：chart↔chart 不介入本判据 —— 归属仍由 ⑤（图表签名）单独裁决', () => {
    // 签名完全相同（chartType + title + series 条数一致）+ 一方身份在交集里：
    // 若 G14a 介入则会保留两条；这里断言仍是 1 条，锁死「chart 不进 G14a」的边界。
    const c1 = {
      id: 'chart-a', title: '流量趋势', type: 'chart', elementCount: 1,
      sourceNodeIds: ['36:1693'], chartType: 'bar', items: [{ label: '入口' }],
    }
    const c2 = {
      id: '36:1693', title: '流量趋势', type: 'chart', elementCount: 1,
      sourceNodeIds: ['36:1693'], chartType: 'bar', items: [{ label: '入口' }],
    }
    const stats = { nestedExempt: 0 }
    expect(dedupeDuplicateSections([c1, c2], null, '', stats)).toHaveLength(1)
    expect(stats.nestedExempt).toBe(0)
  })

  it('阴性⑤：不传 stats 出参 → 不抛错，判据行为不变', () => {
    expect(() => dedupeDuplicateSections([deviceTitleSection, deviceAttrSection])).not.toThrow()
    expect(dedupeDuplicateSections([deviceTitleSection, deviceAttrSection])).toHaveLength(2)
  })
})
