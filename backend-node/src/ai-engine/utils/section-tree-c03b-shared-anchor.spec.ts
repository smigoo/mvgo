/**
 * 🛡️ C0.3-B（2026-11-04）回归基线：**共享锚点 ≠ 同一区域**。
 *
 * 真机事故 mc-max-1793755487753-104f5a31（nodeId 36:1693 / fileKey GTcJm0DKQvcJvcOZTh5n1l）：
 * prompt 的 Figma 结构参考不含任何节点 id，模型把「设备头部信息 / 设备属性 / 产品描述」三个
 * 语义段**全部锚到根 Frame**（`subComponentPlan.effectiveSections` 三段 sourceNodeIds 同集合）。
 * 旧 R1-1 分支只按 `elementCount` 收敛 ⇒ 真实分区被丢；下游又对每个 section 以 id 为真值根
 * （section-tree.js:3011 形态）⇒ 三段各取整树真值，产物结构/样式整体消失。
 *
 * 本判据：双方锚点集**完全相同** ∧ 双方声明文本非空 ∧ 两组文本**互不重叠** ⇒ 不得折叠。
 * 下面用「真机形态复刻 + 三条阴性对照」锁死作用域，避免扩大误伤面。
 */
import { dedupeDuplicateSections } from './section-tree.js'
import { haveDisjointDeclaredContent } from './figma-coverage-dedupe.js'

const ROOT = '36:1693'
const SHARED = [ROOT, '801:3']

/** 真机形态复刻：共享锚点集 + 各自独立声明文本 */
const segHeader = {
  id: ROOT,
  title: '设备头部信息',
  type: 'content',
  elementCount: 7,
  sourceNodeIds: SHARED,
  items: [
    { figmaNode: '801:3', label: '设备类型' },
    { figmaNode: '801:4', value: '28' },
  ],
}
const segAttrs = {
  id: ROOT,
  title: '设备属性',
  type: 'content',
  elementCount: 12,
  sourceNodeIds: [...SHARED],
  items: [
    { figmaNode: '81:7', label: '完好率' },
    { figmaNode: '81:8', value: '98%' },
  ],
}
const segDesc = {
  id: ROOT,
  title: '产品描述',
  type: 'content',
  elementCount: 3,
  sourceNodeIds: [...SHARED],
  items: [
    { figmaNode: '90:1', label: '描述' },
    { figmaNode: '90:2', value: '默认描述' },
  ],
}

describe('C0.3-B · 共享锚点的独立声明段不得折叠', () => {
  it('阳性（真机复刻）：三段同锚 36:1693 且文本互斥 → 三段全保留', () => {
    const input = [segHeader, segAttrs, segDesc]
    const r = dedupeDuplicateSections(input)
    expect(r).toHaveLength(3)
    expect(r.map((s) => s.title)).toEqual(['设备头部信息', '设备属性', '产品描述'])
  })

  it('阳性：锚点集顺序不同视为同一集合（normalize 后比较）', () => {
    const a = { ...segHeader, sourceNodeIds: [ROOT, '801:3'] }
    const b = { ...segAttrs, sourceNodeIds: ['801:3', ROOT] }
    expect(haveDisjointDeclaredContent(a, b)).toBe(true)
    expect(dedupeDuplicateSections([a, b])).toHaveLength(2)
  })

  it('阳性：幂等 —— 结果再次去重零变化', () => {
    const once = dedupeDuplicateSections([segHeader, segAttrs, segDesc])
    const twice = dedupeDuplicateSections(once)
    expect(twice).toHaveLength(3)
  })

  // ── 阴性对照：作用域必须收窄 ──

  it('阴性①：同锚点但声明文本有重叠 → 仍视为同一区域的重复解释，按 elementCount 收敛', () => {
    const dup = {
      ...segHeader,
      elementCount: 14,
      items: [
        { label: '设备类型' }, // 与 segHeader 重叠
        { label: '额外信息' },
      ],
    }
    expect(haveDisjointDeclaredContent(segHeader, dup)).toBe(false)
    const r = dedupeDuplicateSections([segHeader, dup])
    expect(r).toHaveLength(1)
    expect(r[0].elementCount).toBe(14) // 保留内容更全的一份
  })

  it('阴性②：锚点集不同（仅部分交集）→ 不适用本判据，维持原 R1-1 行为', () => {
    const other = { ...segAttrs, sourceNodeIds: [ROOT, '999:9'] }
    expect(haveDisjointDeclaredContent(segHeader, other)).toBe(false)
    const r = dedupeDuplicateSections([segHeader, other])
    expect(r).toHaveLength(1) // 交集 ROOT 触发归属冲突 → elementCount 收敛（12 > 7）
    expect(r[0].elementCount).toBe(12)
  })

  it('阴性③：空壳段（无声明文本）→ 不适用本判据，交由 elementCount / ancestor-shell 处理', () => {
    const shellA = { id: ROOT, title: '', type: 'content', elementCount: 1, sourceNodeIds: [...SHARED] }
    const shellB = { id: ROOT, title: '', type: 'content', elementCount: 4, sourceNodeIds: [...SHARED] }
    expect(haveDisjointDeclaredContent(shellA, shellB)).toBe(false)
    const r = dedupeDuplicateSections([shellA, shellB])
    expect(r).toHaveLength(1)
    expect(r[0].elementCount).toBe(4)
  })

  it('阴性④：缺失 sourceNodeIds（无锚点）→ 判据直接 false，不影响既有措辞/tabs 兜底', () => {
    const a = { id: 'section-a', title: '统计区', type: 'tabs', elementCount: 2 }
    const b = { id: 'section-b', title: '主内容区', type: 'tabs', elementCount: 16, sourceNodeIds: [] }
    expect(haveDisjointDeclaredContent(a, b)).toBe(false)
  })

  it('阴性⑤：chart 签名不同的既有豁免优先级不变（两条 chart 同锚仍全保留）', () => {
    const c1 = {
      id: ROOT, title: '流量趋势', type: 'chart', elementCount: 1, sourceNodeIds: [...SHARED],
      chartType: 'bar', items: [{ label: '入口' }, { label: '出口' }],
    }
    const c2 = {
      id: ROOT, title: '车型分布', type: 'chart', elementCount: 1, sourceNodeIds: [...SHARED],
      chartType: 'pie', items: [{ label: '小客车' }, { label: '货车' }],
    }
    const r = dedupeDuplicateSections([c1, c2])
    expect(r).toHaveLength(2)
  })
})

describe('C0.3-B · haveDisjointDeclaredContent 单元级契约', () => {
  it('非对象/空输入 → false（不抛）', () => {
    expect(haveDisjointDeclaredContent(null, segHeader)).toBe(false)
    expect(haveDisjointDeclaredContent(segHeader, undefined)).toBe(false)
    expect(haveDisjointDeclaredContent({}, segHeader)).toBe(false)
  })

  it('声明文本收集是递归的（items / body 内层同样计入）', () => {
    const a = { sourceNodeIds: SHARED, title: 'A', body: { items: [{ value: '甲' }] } }
    const b = { sourceNodeIds: SHARED, title: 'B', body: { items: [{ value: '乙' }] } }
    expect(haveDisjointDeclaredContent(a, b)).toBe(true)
  })

  it('空白文本不计入声明（trim 后为空不算）', () => {
    const a = { sourceNodeIds: SHARED, title: '   ', items: [{ label: '  ' }] }
    const b = { sourceNodeIds: SHARED, title: '有内容', items: [{ label: '甲' }] }
    expect(haveDisjointDeclaredContent(a, b)).toBe(false)
  })
})
