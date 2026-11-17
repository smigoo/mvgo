/**
 * V-5 段粒度过粗局部展开单测（2026-11-08 · mc-1794128973091-c3fe924f 实锤）。
 *
 * 真机形态：`89:40`（407×380 根槽容器）下是 `89:38`（396×65 switch，铺满）
 * 与 `89:37`（46×317 左竖 tab 条，**只有 46 宽**且与上一块重叠 2px）——
 * 两个都必须算进堆叠序列，否则过粗漏判（真机两次踩坑：面积阈值、1px 重叠）。
 */
import { isOverCoarseAnchor, expandOverCoarseSections } from './over-coarse-section-expander.js'
import { buildNodeLayoutFacts } from './figma-node-layout-facts.js'

function node(id, name, x, y, w, h, children, type = 'FRAME') {
  return {
    id,
    name,
    type,
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: children || [],
  }
}

function textNode(id, value, x, y, w, h) {
  return { id, name: 't', type: 'TEXT', characters: value, absoluteBoundingBox: { x, y, width: w, height: h } }
}

/** 真机 89:40 形态：switch 条 + 左竖 tab（窄、与上块重叠 2px） */
function slotCon() {
  return node('89:40', 'slot-con', 0, 0, 407, 380, [
    node('89:38', 'switch', 10, 0, 396, 65, [textNode('t1', '设备类型28', 20, 20, 80, 20)]),
    node('89:37', '@antd/tab', 0, 63, 46, 317, [
      node('2:8437', 'cons', 43, 75, 367, 295, [
        textNode('t2', '摄像机', 60, 100, 60, 20),
        textNode('t3', '风速风向仪', 60, 180, 60, 20),
      ]),
    ]),
  ])
}

describe('isOverCoarseAnchor', () => {
  it('阳性：switch 条 + 左竖 tab 垂直堆叠、覆盖满高 ⇒ 判过粗', () => {
    const v = isOverCoarseAnchor(slotCon())
    expect(v.over).toBe(true)
    expect(v.reason).toBe('coarse-container')
    expect(v.childIds).toEqual(['89:38', '89:37'])
    expect(v.covered).toBeGreaterThanOrEqual(0.99)
  })

  it('阴性①：子容器左右并排（y 相同）⇒ 不是垂直堆叠', () => {
    const n = node('9:1', 'row', 0, 0, 400, 100, [
      node('9:2', 'a', 0, 0, 195, 100, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'b', 205, 0, 195, 100, [textNode('tb', 'B', 210, 10, 30, 20)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性②：垂直堆叠但合计只占容器高度一半 ⇒ 不展开', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 100, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'b', 0, 110, 400, 100, [textNode('tb', 'B', 10, 110, 30, 20)]),
    ])
    const v = isOverCoarseAnchor(n)
    expect(v.over).toBe(false)
    expect(v.reason).toContain('vertical-cover')
  })

  it('阴性③：只有 1 个实质子 ⇒ 不展开', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 400, [textNode('ta', 'A', 10, 10, 30, 20)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性④：子无实质内容（空壳 FRAME）⇒ 不算候选', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 200),
      node('9:3', 'b', 0, 200, 400, 200),
    ])
    const v = isOverCoarseAnchor(n)
    expect(v.over).toBe(false)
    expect(v.reason).toContain('substantial-children')
  })

  it('阴性⑤：子高度 <10%（横向细条）⇒ 不算候选', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 400, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'thin', 0, 396, 400, 4, [textNode('tb', 'B', 10, 396, 30, 4)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性⑥：无节点 ⇒ 不判', () => {
    expect(isOverCoarseAnchor(null).over).toBe(false)
  })

  // ── 根因 D（2026-11-11 · docs/2026-11-11-组件生成根因治理改动清单.md §1.4） ──
  // 上面六条判据对**最普通的业务段结构**（段标题条 + 段内容）恒真：142px 段被抹成
  // 两个零 flex 兄弟、面板标题槽被业务小标题占位（mc-max-1794360981835-f596dd2d 实锤）。

  it('豁免①：段标题条（细条）+ 内容体 ⇒ 已是最小业务段，不拆', () => {
    // 真机 2:3438 形态：387×142 = sub-header 24.34 + 内容体 114（垂直覆盖 100%）
    const n = node('7:1', 'slot-车型分布', 0, 0, 400, 300, [
      node('7:2', 'sub-header', 0, 0, 86, 36, [textNode('7t1', '车型分布', 2, 8, 80, 20)]),
      node('7:3', 'con', 0, 36, 400, 264, [textNode('7t2', '小客车', 10, 60, 60, 20)]),
    ])
    const v = isOverCoarseAnchor(n)
    expect(v.over).toBe(false)
    expect(v.reason).toBe('section-header-body-pattern')
  })

  it('豁免①不退化：细条是数字主导的 KPI 条（非标题）⇒ 仍判过粗', () => {
    const n = node('7:1', 'slot-kpi', 0, 0, 400, 300, [
      node('7:2', 'num', 0, 0, 86, 36, [textNode('7t1', '22350', 2, 8, 80, 20)]),
      node('7:3', 'con', 0, 36, 400, 264, [textNode('7t2', '小客车', 10, 60, 60, 20)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(true)
  })

  it('豁免②：段已显式声明内部语义（headerRelation）⇒ 不重推', () => {
    const n = node('8:1', 'slot-x', 0, 0, 400, 400, [
      node('8:2', 'a', 0, 0, 400, 195, [textNode('8t1', '区块一', 10, 10, 60, 20)]),
      node('8:3', 'b', 0, 195, 400, 195, [textNode('8t2', '区块二', 10, 205, 60, 20)]),
    ])
    // 同样的树，无声明 ⇒ 判过粗（对照组，证明豁免来自声明而非几何）
    expect(isOverCoarseAnchor(n).over).toBe(true)
    const v = isOverCoarseAnchor(n, { id: '8:1', headerRelation: 'title-above-body' })
    expect(v.over).toBe(false)
    expect(v.reason).toBe('section-has-declared-semantics')
    expect(v.declared).toBe('header-relation')
  })
})

describe('expandOverCoarseSections', () => {
  it('无 Figma 真值 ⇒ fail-open 原样返回同一引用', () => {
    const sections = [{ id: '89:40' }]
    const res = expandOverCoarseSections(sections, null)
    expect(res.sections).toBe(sections)
    expect(res.stats.skippedReason).toBe('no-figma-data')
  })

  it('片段不满 2 个实质子 ⇒ 不改动并留痕拒绝原因', () => {
    const figma = { document: node('root', 'root', 0, 0, 400, 400, [slotCon()]) }
    const sections = [{ id: '89:38', figmaAnchorId: '89:38' }]
    const res = expandOverCoarseSections(sections, figma)
    expect(res.sections).toBe(sections)
    expect(res.stats.expanded).toBe(0)
    expect(res.stats.skippedReason).toContain('89:38')
  })

  it('过粗段命中但 E1 推导不出 ≥2 子段 ⇒ 保留原段（fail-open）', () => {
    // 只给锚点自身，不给可推导的子树结构
    const figma = { document: slotCon() }
    const sections = [{ id: '89:40', figmaAnchorId: '89:40' }]
    const res = expandOverCoarseSections(sections, figma)
    expect(() => expandOverCoarseSections(sections, figma)).not.toThrow()
    if (res.stats.expanded > 0) {
      // 展开成功：每个子段都带来源留痕
      expect(res.sections.every((s) => s._expandedFrom === '89:40')).toBe(true)
      expect(res.sections.length).toBeGreaterThanOrEqual(2)
    } else {
      // 推导失败：必须原样保留同一引用，且拒绝原因可观测
      expect(res.sections).toBe(sections)
      expect(res.stats.skippedReason).toContain('89:40')
    }
  })

  // ── 根因 D 后半段（§1.4 ③④）：真展开回填 layoutMetadata + 展开后自检回滚 ──

  it('真展开：每个子段都补齐 layoutMetadata（下游 applyFigmaHeightGrow 的唯一入口）', () => {
    const n = node('5:1', 'slot-x', 0, 0, 400, 400, [
      node('5:2', 'con-1', 0, 0, 400, 195, [textNode('5t1', '区块一', 10, 10, 60, 20)]),
      node('5:3', 'con-2', 0, 195, 400, 195, [textNode('5t2', '区块二', 10, 205, 60, 20)]),
    ])
    const sections = [{ id: '5:1', figmaAnchorId: '5:1' }]
    const res = expandOverCoarseSections(sections, { document: n })
    expect(res.stats.expanded).toBe(1)
    expect(res.sections).toHaveLength(2)
    for (const s of res.sections) {
      // 缺 layoutMetadata ⇒ applyFigmaHeightGrow 的 `if (!meta) continue` 直接跳过该段
      //   ⇒ 该段参与均值却写不回比例（flexGrow 恒 0）、高度/间距/方向三通道全空转。
      expect(s.layoutMetadata).toBeTruthy()
      expect(s.layoutMetadata).toHaveProperty('height')
      expect(s.layoutMetadata).toHaveProperty('gap')
      expect(s.layoutMetadata).toHaveProperty('direction')
      expect(s.layoutMetadata.height).toBe(195)
      expect(s._expandedFrom).toBe('5:1')
    }
  })

  it('自检回滚：推导把候选层否认的细标题条提成段 ⇒ 保留原段，不拆成 3 兄弟', () => {
    // 36px 标题条高度 <10% 锚点高 ⇒ 进不了候选层（判过粗时看不到它）；
    // 但 section-tree 顶层循环对根的直接子**无条件**成段 ⇒ 推导出 [36, 180, 180] 三段。
    // 原 ④ 复用 ① 的「恰好 2 段」判据 ⇒ 恒不可达（实测拆成 3 段、自检零拦截）。
    const n = node('9:1', 'slot-流量预测', 0, 0, 400, 400, [
      node('9:2', 'sub-header', 0, 0, 400, 36, [textNode('9t1', '流量预测', 4, 8, 90, 20)]),
      node('9:3', 'con-a', 0, 36, 400, 180, [textNode('9t2', '上行', 10, 60, 60, 20)]),
      node('9:4', 'con-b', 0, 216, 400, 180, [textNode('9t3', '下行', 10, 240, 60, 20)]),
    ])
    const sections = [{ id: '9:1', figmaAnchorId: '9:1' }]
    const res = expandOverCoarseSections(sections, { document: n })
    expect(res.stats.expanded).toBe(0)
    expect(res.sections).toBe(sections)
    expect(res.stats.exempted).toBe(1)
    expect(res.stats.exemptReasons).toContain('9:1:expanded-header-band')
    expect(res.sections.some((s) => s.id === '9:2')).toBe(false)
  })

  it('自检不误伤：三个等高区块（非标题条）⇒ 照常展开', () => {
    const n = node('4:1', 'slot-cards', 0, 0, 400, 400, [
      node('4:2', 'a', 0, 0, 400, 130, [textNode('4t1', '区块一', 10, 10, 60, 20)]),
      node('4:3', 'b', 0, 130, 400, 130, [textNode('4t2', '区块二', 10, 140, 60, 20)]),
      node('4:4', 'c', 0, 260, 400, 130, [textNode('4t3', '区块三', 10, 270, 60, 20)]),
    ])
    const res = expandOverCoarseSections([{ id: '4:1', figmaAnchorId: '4:1' }], { document: n })
    expect(res.stats.expanded).toBe(1)
    expect(res.stats.exempted).toBe(0)
    expect(res.sections.map((s) => s.id)).toEqual(['4:2', '4:3', '4:4'])
  })
})

// ── 2026-11-17：局部 E1 展开必须注入 layoutFacts（`73:3` list 行 icon 错位根治） ──
// 病灶：`deriveSectionsFromFigmaTree` 的「方向感知兄弟排序」与「行内图元豁免」均依赖 A 类布局
//   事实；本模块局部展开处曾漏传 ⇒ `isRowParent` 恒 false ⇒ 行内小图标（无文本·垂直居中略低于
//   文本）被提升为独立叶子，并按 y 主序排到文本之后（真机 `1:377`：icon 28×28 y=221 vs 文本 y=214）。
// 对照：传 facts ⇒ icon 保留在行内、且排在文本之前；空 facts ⇒ 逐字复现旧 y 主序行为。
describe('expandOverCoarseSections · layoutFacts 注入（行内图元不脱离行）', () => {
  /** 真机 1:376 形态：两个垂直堆叠的行；行内 = 小图标（无文本·垂直居中略低）+ 文本 */
  function rowFixture(): any {
    const row1 = {
      id: '2:1',
      name: 'row',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 195 },
      children: [
        {
          id: '2:2',
          name: 'icon-1',
          type: 'FRAME',
          absoluteBoundingBox: { x: 10, y: 87, width: 28, height: 28 },
          children: [
            { id: '2:3', name: 'vec', type: 'VECTOR', absoluteBoundingBox: { x: 12, y: 89, width: 24, height: 24 }, children: [] },
          ],
        },
        { id: '2:4', name: 't', type: 'TEXT', characters: '环境温度', absoluteBoundingBox: { x: 60, y: 80, width: 100, height: 24 } },
      ],
    }
    const row2 = {
      id: '2:5',
      name: 'row2',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 195, width: 400, height: 195 },
      children: [
        { id: '2:6', name: 't', type: 'TEXT', characters: '预警内容', absoluteBoundingBox: { x: 10, y: 260, width: 120, height: 24 } },
      ],
    }
    return {
      document: {
        id: '2:0',
        name: 'slot',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
        children: [row1, row2],
      },
    }
  }
  const anchorSection = [{ id: '2:0', figmaAnchorId: '2:0' }]

  it('阳性：行内小图标不脱离行、且排在文本之前（facts 自算注入）', () => {
    const res: any = expandOverCoarseSections(anchorSection, rowFixture())
    expect(res.stats.expanded).toBe(1)
    expect(res.stats.layoutFactsSource).toBe('computed')
    expect(res.stats.layoutFacts).toBeGreaterThan(0)
    const row = res.sections.find((s: any) => s.id === '2:1')
    expect(row).toBeTruthy()
    // icon(2:2) 在文本(2:4) 之前 —— 真机 1:377 期望形态
    expect(row.children.map((c: any) => c.id)).toEqual(['2:2', '2:4'])
    // icon 未被提升为脱离行的独立顶层段
    expect(res.sections.some((s: any) => s.id === '2:2')).toBe(false)
  })

  it('阴性对照：facts 存在但不覆盖该行 ⇒ 方向判据降级、回退 y 主序（文本在图标前）', () => {
    // 非空但与该行无关的 facts：证明判据是「按 node id 注入」而非全局魔法
    const stray = { '9:99': { display: 'flex', flexDirection: 'row', source: 'geometric-inference', confidence: 'high' } }
    const res: any = expandOverCoarseSections(anchorSection, rowFixture(), { layoutFacts: stray })
    expect(res.stats.layoutFactsSource).toBe('injected')
    expect(res.stats.layoutFacts).toBe(1)
    const row = res.sections.find((s: any) => s.id === '2:1')
    expect(row.children.map((c: any) => c.id)).toEqual(['2:4', '2:2'])
  })

  it('防御：注入空 facts 表 ⇒ 视为未提供、自算（不得静默退回 y 主序）', () => {
    const res: any = expandOverCoarseSections(anchorSection, rowFixture(), { layoutFacts: {} })
    expect(res.stats.layoutFactsSource).toBe('computed')
    expect(res.stats.layoutFacts).toBeGreaterThan(0)
    const row = res.sections.find((s: any) => s.id === '2:1')
    expect(row.children.map((c: any) => c.id)).toEqual(['2:2', '2:4'])
  })

  it('判据同源：注入外部 facts 与自算 facts 结果逐项一致', () => {
    const figma = rowFixture()
    const injected: any = expandOverCoarseSections(anchorSection, figma, { layoutFacts: buildNodeLayoutFacts(figma.document) })
    expect(injected.stats.layoutFactsSource).toBe('injected')
    const computed: any = expandOverCoarseSections(anchorSection, figma)
    const shape = (r: any) => r.sections.map((s: any) => [s.id, (s.children || []).map((c: any) => c.id)])
    expect(shape(injected)).toEqual(shape(computed))
  })
})
