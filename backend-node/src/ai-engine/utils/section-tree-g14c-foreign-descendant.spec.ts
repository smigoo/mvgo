/**
 * 🛡️ G14c（2026-11-12）回归基线：**交集 id 两侧都不是「自身身份」⇒ 争抢的是第三方后代，不是同一区域**。
 *
 * 真机事故 mc-max-1794452025496-3d081117（fileKey 1t7Dmmpsl5i0PC8BJt2QLf / node 2:8417）：
 *   · Figma 真值：`89:37` 是 @antd/tab 容器，下面 `89:39` = 竖向分类导航（真实文本 6 条：
 *     监控/照明/通风/供配电/消防/交通诱导，位于 89:39 子树内的 TEXT 节点 2:8827/2:8832/…），
 *     `2:8437` = 设备指标卡片网格（12 张卡）。
 *   · vision 给 nav 的 `body.children[].id` 是**臆造**：2:8438 / 2:8464…2:8468 经 figma.json
 *     核对**全部位于 2:8437 子树内**（2:8438 是 2:8437 的直接子节点）。
 *   · `subcomponent-planner#collectSourceNodeIds` 是并集累加器 ⇒ nav.sourceNodeIds 混入这些
 *     外来后代 id ⇒ 与 grid 的 sourceNodeIds 在 `2:8438` 上相交。
 *
 * 旧 R1-1 裁决链在该相交上全部落空：
 *   · G14a 父子豁免要求「恰一方身份在交集」——此处**两侧身份（89:39 / 2:8437）都不在交集**；
 *   · C0.3-B 要求「双方锚点集完全相同」——此处只是部分相交；
 *   ⇒ 落到 elementCount 收敛：grid(12) > nav(6) ⇒ **nav 整块被 `shared-anchor-superseded` 丢弃**，
 *     nav 不占槽 ⇒ 产物只剩 StatsMetricsCardGrid.vue，tabs 整块蒸发（A1-v2 命中率 13%、C1b 缺席）。
 *
 * 本判据把「身份交集计数」补全为三分区（互斥且穷尽）：
 *   · 恰一方身份在交集 → G14a（父子嵌套，不是争抢）；
 *   · 双方身份都在交集 → C0.3-B（同锚点集，声明文本互斥则保留）；
 *   · **双方身份都不在交集 → G14c（争抢的是第三方后代节点，不是同一区域）**。
 * G14c 额外两条前提：
 *   · 双方各自声明了**互不重叠**的文本（空壳段照旧走 elementCount 收敛）；
 *   · **双方各自的自身身份都锚在真实 Figma 节点上**（`FIGMA_ID_RE` × `sectionAnchorKey`）。
 *     依据：`subcomponent-planner#collectSourceNodeIds:1156-1160` 对锚点字段与 `\d+:\d+` 形态
 *     `id` 无条件 push ⇒ 真实节点锚定是**可判**的；而自由文本语义 id 段（无锚点声明）所声明的
 *     id 就是它唯一的归属依据，与对方共享即真重复解释 ⇒ 必须维持收敛（见下「边界锁」）。
 */

import {
  dedupeDuplicateSections,
  collectLeafSections,
  assignSectionComponentNames,
} from './section-tree.js'
import {
  haveDisjointDeclaredContent,
  haveDisjointDeclaredText,
} from './figma-coverage-dedupe.js'

// ── 真机形态复刻（3d081117） ─────────────────────────────────────────────
/** nav 的 6 个 tab 子节点 id —— 经 figma.json 核对**全部属于 grid 2:8437 子树**（臆造锚点） */
const NAV_POLLUTED_CHILD_IDS = ['2:8438', '2:8464', '2:8465', '2:8466', '2:8467', '2:8468']
const NAV_SRC = ['89:39', ...NAV_POLLUTED_CHILD_IDS]
const GRID_SRC = ['2:8437', '2:8438', '2:8497', '2:8526', '2:8555', '2:8584']

const navSection = {
  id: '89:39',
  title: '左侧分类导航',
  type: 'nav',
  elementCount: 6,
  responsibility: '竖向导航区（分类/菜单切换）',
  sourceNodeIds: [...NAV_SRC],
  tabStructure: { nav: { present: true, figmaNode: '2:8438' }, panels: [], orientation: 'vertical' },
  body: {
    layout: 'vertical',
    children: [
      { id: '2:8438', name: '监控', role: 'tab', value: '监控' },
      { id: '2:8464', name: '照明', role: 'tab', value: '照明' },
      { id: '2:8465', name: '通风', role: 'tab', value: '通风' },
      { id: '2:8466', name: '供配电', role: 'tab', value: '供配电' },
      { id: '2:8467', name: '消防', role: 'tab', value: '消防' },
      { id: '2:8468', name: '交通诱导', role: 'tab', value: '交通诱导' },
    ],
  },
}

const gridSection = {
  id: '2:8437',
  title: '设备指标卡片网格',
  type: 'stats',
  elementCount: 12,
  responsibility: '数据统计指标区（数字+标签+趋势）',
  sourceNodeIds: [...GRID_SRC],
  items: [
    { figmaNode: '2:8497', label: '摄像机' },
    { figmaNode: '2:8526', label: '风速风向仪' },
    { figmaNode: '2:8555', label: '超高检测器' },
    { figmaNode: '2:8584', label: '烟道机器人' },
  ],
}

/** @antd/tab 容器（真实存在，isLayoutContainer ⇒ 不占 .vue 槽、只递归 children） */
const tabContainer = {
  id: '89:37',
  title: '@antd/tab',
  type: 'container',
  isLayoutContainer: true,
  elementCount: 18,
  sourceNodeIds: ['89:37', '89:39', '2:8437'],
  children: [navSection, gridSection],
}

describe('G14c · 交集 id 两侧都不是自身身份 ⇒ 不同区域，不得收敛', () => {
  it('阳性（真机复刻）：nav 89:39 与 grid 2:8437 仅共享臆造后代 id ⇒ 两条全保留', () => {
    const r = dedupeDuplicateSections([navSection, gridSection])
    expect(r).toHaveLength(2)
    expect(r.map((s) => s.id)).toEqual(['89:39', '2:8437'])
  })

  it('阳性（父容器路径）：容器 89:37 下 nav 不再被 grid 顶替', () => {
    const r = dedupeDuplicateSections([tabContainer])
    expect(r).toHaveLength(1)
    expect(r[0].children.map((c: any) => c.id)).toEqual(['89:39', '2:8437'])
  })

  it('阳性（下游可见）：去重后 nav 仍进叶子池，分块不会漏块', () => {
    const r = dedupeDuplicateSections([tabContainer])
    const leaves = collectLeafSections(r)
    expect(leaves.map((s: any) => s.id)).toEqual(['89:39', '2:8437'])
  })

  it('阳性：幂等 —— 结果再次去重零变化', () => {
    const once = dedupeDuplicateSections([tabContainer])
    const twice = dedupeDuplicateSections(once)
    expect(twice[0].children).toHaveLength(2)
  })

  // ── 阴性对照：作用域必须收窄 ──

  it('阴性①：同样「两侧身份都不在交集」「双方真节点锚定」但声明文本有重叠 → 仍按 elementCount 收敛', () => {
    const a = {
      id: '9:1', title: '', type: 'content', elementCount: 3,
      sourceNodeIds: ['9:1', '9:2'], items: [{ label: '甲' }],
    }
    const b = {
      id: '9:3', title: '', type: 'content', elementCount: 9,
      sourceNodeIds: ['9:3', '9:2'], items: [{ label: '甲' }],
    }
    // 前提成立（双方身份 9:1 / 9:3 均不在交集 9:2 内且都是真节点 id）
    expect(haveDisjointDeclaredText(a, b)).toBe(false)
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('9:3') // 内容更全者胜出
  })

  it('阴性②：空壳段（一方无声明文本）→ 不适用本判据', () => {
    const shell = {
      id: '9:1', type: 'content', elementCount: 3,
      sourceNodeIds: ['9:1', '9:2'],
    }
    const full = {
      id: '9:3', type: 'content', elementCount: 9,
      sourceNodeIds: ['9:3', '9:2'], items: [{ label: '甲' }],
    }
    expect(haveDisjointDeclaredText(shell, full)).toBe(false)
    const r = dedupeDuplicateSections([shell, full])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('9:3')
  })

  // ── 🔒 边界锁：G14c 的「真实节点锚定」前提（保 G14a spec 阴性② 不被越权） ──

  it('边界锁①：零方交集 + 双方身份是**自由文本语义 id**（非节点引用）→ 不豁免，维持收敛', () => {
    // 形态 = G14a spec 阴性②：交集是第三个公共节点，双方身份都不在其中。
    // 但两段 id 均为自由文本语义名 ⇒ collectSourceNodeIds 不 push（语义 id 不进归属图）
    // ⇒ 声明的 id 就是唯一归属依据，共享 ⇒ 真重复解释。
    const a = {
      id: 'section-a', title: '统计区', type: 'content', elementCount: 3,
      sourceNodeIds: ['COMMON:1', 'A:1'],
    }
    const b = {
      id: 'section-b', title: '主内容区', type: 'content', elementCount: 9,
      sourceNodeIds: ['COMMON:1', 'B:1'],
    }
    // 文本互斥（否则无法区分是「前提②不成立」还是「前提③不成立」）
    expect(haveDisjointDeclaredText(a, b)).toBe(true)
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('section-b')
  })

  it('边界锁②：零方交集 + 双方身份是真节点 id → 豁免（前提②成立即豁免）', () => {
    const a = {
      id: '90:1', title: '统计区', type: 'content', elementCount: 3,
      sourceNodeIds: ['90:1', 'COMMON:1'],
    }
    const b = {
      id: '90:2', title: '主内容区', type: 'content', elementCount: 9,
      sourceNodeIds: ['90:2', 'COMMON:1'],
    }
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(2)
  })

  it('边界锁③：一方为自由文本语义 id（另一方真锚定）→ 前提②不成立，维持收敛', () => {
    const a = {
      id: '90:1', title: '统计区', type: 'content', elementCount: 3,
      sourceNodeIds: ['90:1', 'COMMON:1'],
    }
    const b = {
      id: 'semantic-b', title: '主内容区', type: 'content', elementCount: 9,
      sourceNodeIds: ['COMMON:1', 'B:1'],
    }
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('semantic-b')
  })

  it('阴性③：交集恰含一方身份（G14a 父子嵌套）→ 既有豁免优先级不变', () => {
    const parent = {
      id: '36:1642', type: 'content', elementCount: 6,
      sourceNodeIds: ['36:1642', '36:1693'],
      items: [{ label: '甲' }],
    }
    const child = {
      id: '36:1693', type: 'content', elementCount: 30,
      sourceNodeIds: ['36:1693', '36:1700'],
      items: [{ label: '乙' }],
    }
    const stats = { nestedExempt: 0, identityNormalized: 0, evaluated: 0 }
    const r = dedupeDuplicateSections([parent, child], null, '', stats)
    expect(r).toHaveLength(2) // G14a 豁免，父子都留
    expect(stats.nestedExempt).toBe(1)
  })

  it('阴性④：双方身份都在交集（同锚点集）→ 交回 C0.3-B 裁决，不越权', () => {
    const a = { id: '36:1693', title: '设备头部信息', type: 'content', elementCount: 7, sourceNodeIds: ['36:1693', '801:3'], items: [{ label: '设备类型' }] }
    const b = { id: '36:1693', title: '设备属性', type: 'content', elementCount: 12, sourceNodeIds: ['36:1693', '801:3'], items: [{ label: '完好率' }] }
    expect(haveDisjointDeclaredContent(a, b)).toBe(true) // 仍是 C0.3-B 的领地
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(2)
  })

  it('阴性⑤：chart↔chart 由 ⑤ 图表签名单独裁决 → 同签名同文本仍收敛', () => {
    const c1 = {
      id: '42:1', title: '流量趋势', type: 'chart', elementCount: 1, chartType: 'bar',
      sourceNodeIds: ['42:1', '42:2'], items: [{ label: '入口' }],
    }
    const c2 = {
      id: '42:1', title: '流量趋势', type: 'chart', elementCount: 5, chartType: 'bar',
      sourceNodeIds: ['42:1', '42:2'], items: [{ label: '入口' }],
    }
    const r = dedupeDuplicateSections([c1, c2])
    expect(r).toHaveLength(1)
    expect(r[0].elementCount).toBe(5)
  })

  it('阴性⑥：无 sourceNodeIds 交集（无归属冲突）→ 本判据不介入，两条都留', () => {
    const a = { id: 'a:1', type: 'content', elementCount: 3, sourceNodeIds: ['a:1'], items: [{ label: '甲' }] }
    const b = { id: 'b:1', type: 'content', elementCount: 9, sourceNodeIds: ['b:1'], items: [{ label: '乙' }] }
    const r = dedupeDuplicateSections([a, b])
    expect(r).toHaveLength(2)
  })
})

describe('G14c 配套 · nav 段的组件基名（类型表缺项补全）', () => {
  it('真机形态：nav 89:39 → TabsSection（不再因 responsibility 含「切换」被铸成 SwitchSection）', () => {
    const r = dedupeDuplicateSections([tabContainer])
    const names = assignSectionComponentNames(r)
    expect(names.get('89:39')).toBe('TabsSection')
  })

  it('阴性：其它类型分支不受影响（stats 仍 StatsSection、chart 仍 ChartSection）', () => {
    const stats = { id: 's:1', type: 'stats', title: '指标区', elementCount: 3, sourceNodeIds: ['s:1'] }
    const chart = { id: 'c:1', type: 'chart', title: '趋势', elementCount: 3, sourceNodeIds: ['c:1'] }
    const names = assignSectionComponentNames([stats, chart])
    expect(names.get('s:1')).toBe('StatsSection')
    expect(names.get('c:1')).toBe('ChartSection')
  })
})

describe('G14c · haveDisjointDeclaredText 单元级契约', () => {
  it('两侧各有非空且互不重叠的声明文本 → true', () => {
    expect(haveDisjointDeclaredText(navSection, gridSection)).toBe(true)
  })

  it('有重叠 → false', () => {
    const overlap = { ...gridSection, items: [{ label: '监控' }] }
    expect(haveDisjointDeclaredText(navSection, overlap)).toBe(false)
  })

  it('任一侧为空壳 → false', () => {
    expect(haveDisjointDeclaredText(navSection, { id: 'x', sourceNodeIds: [] })).toBe(false)
  })

  it('非对象输入 → false（不抛）', () => {
    expect(haveDisjointDeclaredText(null, gridSection)).toBe(false)
    expect(haveDisjointDeclaredText(gridSection, undefined)).toBe(false)
  })

  it('C0.3-B 保持原语义：锚点集不同即使文本互斥也不适用', () => {
    expect(haveDisjointDeclaredContent(navSection, gridSection)).toBe(false)
    expect(haveDisjointDeclaredText(navSection, gridSection)).toBe(true)
  })
})
