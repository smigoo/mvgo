/**
 * buildNodeLayoutFacts 单测（B' 事实层，2026-09-18）
 * 覆盖：标准 Auto-Layout（layoutMode 确定性）、不标准文件几何推断（env-monitor tab 横排根治）、
 * 堆叠、模糊方向默认 row、递归、<2 子节点、{document} 包裹。
 * 注：本仓库 .ts spec 走 babel-jest（不剥类型），故此处不写 TS 类型注解，与 flex-direction-inferrer.spec.ts 同口径。
 */
import { buildNodeLayoutFacts } from '../figma-node-layout-facts.js'

function box(x, y, w, h) {
  return { x, y, width: w, height: h }
}
function child(id, x, y, w, h, extra) {
  return { id, type: 'FRAME', absoluteBoundingBox: box(x, y, w, h), ...(extra || {}) }
}

describe('buildNodeLayoutFacts — B\' 事实层', () => {
  it('⭐ 不标准文件：tab 列表 4 子项 side-by-side（env-monitor 根因）→ 几何推断 flex-row high', () => {
    // c-env-monitor-tabs-list 在 Figma 里 4 个 tab 横向并排、layoutMode 缺失（绝对定位）
    const tabsList = {
      id: '2:7889',
      layoutMode: 'NONE',
      children: [
        child('89:42', 0, 0, 120, 40),
        child('89:43', 120, 0, 120, 40),
        child('89:44', 240, 0, 120, 40),
        child('89:45', 360, 0, 120, 40),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [tabsList] } })
    expect(facts['2:7889']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })

  it('标准 Auto-Layout：layoutMode=HORIZONTAL → flex-row high（不依赖几何）', () => {
    const node = {
      id: '3:10',
      layoutMode: 'HORIZONTAL',
      children: [child('3:11', 0, 0, 50, 50), child('3:12', 0, 200, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['3:10']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
  })

  it('标准 Auto-Layout：layoutMode=VERTICAL → flex-column high', () => {
    const node = {
      id: '3:20',
      layoutMode: 'VERTICAL',
      children: [child('3:21', 0, 0, 50, 50), child('3:22', 200, 0, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['3:20']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
  })

  it('不标准文件：子节点纵向堆叠 → 几何推断 flex-column high', () => {
    const node = {
      id: '4:1',
      children: [
        child('4:2', 0, 0, 100, 40),
        child('4:3', 0, 40, 100, 40),
        child('4:4', 0, 80, 100, 40),
        child('4:5', 0, 120, 100, 40),
      ],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['4:1']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })

  it('方向模糊（部分横排+部分堆叠）→ 默认 flex-row + confidence=low', () => {
    // 3 子节点：2 横排 + 1 堆叠 → side-by-side 比例 1/3 ≈ 0.33（介于 0.25~0.75）→ low → 默认 row
    const node = {
      id: '5:1',
      children: [
        child('5:2', 0, 0, 100, 40),
        child('5:3', 110, 0, 100, 40),
        child('5:4', 0, 50, 100, 40),
      ],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['5:1']).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'low',
    })
  })

  it('单子节点容器 → 默认 column（2026-09-19 扩大覆盖：防 LLM 漏写 flex-direction 默认 row）', () => {
    const node = {
      id: '6:1',
      children: [child('6:2', 0, 0, 100, 40)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['6:1']).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      source: 'single-child-default',
      confidence: 'low',
    })
  })

  it('🛡️ 均匀网格 3×4 → display:grid gridColumns:3（mc-1790058609462 一片蓝实锤：side-by-side 比例误判 column）', () => {
    // 12 卡 3 列：x=0/130/260 三列，每列 4 行 → 均匀网格
    const cons = {
      id: '2:8437',
      layoutMode: 'NONE',
      children: [
        child('c1', 0, 0, 120, 60), child('c2', 130, 0, 120, 60), child('c3', 260, 0, 120, 60),
        child('c4', 0, 70, 120, 60), child('c5', 130, 70, 120, 60), child('c6', 260, 70, 120, 60),
        child('c7', 0, 140, 120, 60), child('c8', 130, 140, 120, 60), child('c9', 260, 140, 120, 60),
        child('c10', 0, 210, 120, 60), child('c11', 130, 210, 120, 60), child('c12', 260, 210, 120, 60),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [cons] } })
    expect(facts['2:8437']).toEqual({
      display: 'grid',
      gridColumns: 3,
      source: 'geometric-grid-inference',
      confidence: 'high',
    })
  })

  it('单列竖排 4 卡（x 全同）→ 不误判 grid，仍 column', () => {
    const stack = {
      id: '2:9000',
      layoutMode: 'NONE',
      children: [
        child('s1', 0, 0, 100, 60),
        child('s2', 0, 70, 100, 60),
        child('s3', 0, 140, 100, 60),
        child('s4', 0, 210, 100, 60),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [stack] } })
    expect(facts['2:9000'].display).toBe('flex')
    expect(facts['2:9000'].flexDirection).toBe('column')
  })

  it('递归遍历：嵌套节点各自产出事实', () => {
    const root = {
      id: '7:0',
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '7:1',
          layoutMode: 'NONE',
          children: [child('7:2', 0, 0, 80, 30), child('7:3', 90, 0, 80, 30)],
        },
        {
          id: '7:4',
          layoutMode: 'NONE',
          children: [child('7:5', 0, 60, 80, 30), child('7:6', 90, 60, 80, 30)],
        },
      ],
    }
    const facts = buildNodeLayoutFacts(root)
    expect(facts['7:0']).toEqual({
      display: 'flex',
      flexDirection: 'column',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
    expect(facts['7:1']).toMatchObject({ display: 'flex', flexDirection: 'row', source: 'geometric-inference' })
    expect(facts['7:4']).toMatchObject({ display: 'flex', flexDirection: 'row', source: 'geometric-inference' })
  })

  it('空 / 非对象输入 → 返回空对象（fail-open，不抛错）', () => {
    expect(buildNodeLayoutFacts(null)).toEqual({})
    expect(buildNodeLayoutFacts(undefined)).toEqual({})
    expect(buildNodeLayoutFacts('not-a-tree')).toEqual({})
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 🛡️ 2026-09-29 背景层剔除（mc-max-1790667854851-5f5bce3a 实锤）
  //    事故：列表项「icon 左 / 文字右」被判成 grid-2 ⇒ LLM 写不出 flex ⇒ 竖排堆叠、数值被裁。
  //    根因：整块背景层 `bg`(面积占父 100%) 与 icon 按 x 差 4px 归进同一列 ⇒ 凑出「2 列 × 2 项」假网格。
  //    全语料审计：753 产物 / 59279 节点 / 判定变化 188 条，**全部为 `grid-2 → flex-row`**，
  //    被剔节点 188/188 均为「面积 100% 的 FRAME:bg」⇒ TP 100%、零 FP、零事实丢失。
  // ─────────────────────────────────────────────────────────────────────────
  it('⭐ 背景层不得凑假网格：bg + icon + 文字组 + 数值组 → flex-row（真实 136:129 结构）', () => {
    const item = {
      id: '136:129',
      name: '1',
      layoutMode: 'NONE',
      absoluteBoundingBox: box(37, 984, 140, 74),
      children: [
        child('136:129-bg', 37, 984, 140, 74, { name: 'bg' }), // 整块背景层：100% 父面积
        child('136:129-icon', 41, 995, 48, 48, { name: 'icon' }),
        child('136:129-label', 89, 1000, 55, 18, { name: 'Group 2136638345' }),
        child('136:129-value', 90, 1022, 39, 23, { name: 'Group 2136638342' }),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [item] } })
    // 旧行为：bg(x=37,140 宽) 与 icon(x=41) 同列、文字组(x=89) 与数值组(x=90) 同列 ⇒ grid-2 ❌
    // 剔 bg 后 3 个：icon↔label、icon↔value 为 side-by-side（2/3 ⇒ ratio 0.667 → 档位 low），
    // label↔value 水平重叠 39px > 0.15×23 ⇒ 非 side-by-side。方向 row（low 档按定调默认 row）。
    // confidence 仅作元信息透传（全仓无按 confidence 过滤/降权的判据），row 即为正确下发值。
    expect(facts['136:129']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'low',
    })
  })

  it('🛡️ TEXT 永不视为背景层（内容 TEXT 占 94.5% 父面积不得被剔 ⇒ 仍参与方向判定）', () => {
    // 父 100×60。TEXT 96×58 = 92.8% ≥ 0.9，若按面积无脑剔则只剩 2 个 FRAME（ratio=1 ⇒ high row）。
    // TEXT 保留 ⇒ 与两个 FRAME 均水平大量重叠（非 side-by-side）⇒ ratio=1/3 ⇒ confidence='low'。
    // 故 confidence 是「TEXT 是否被误剔」的可观测判据。
    const node = {
      id: '10:1',
      layoutMode: 'NONE',
      absoluteBoundingBox: box(0, 0, 100, 60),
      children: [
        { id: '10:1-t', type: 'TEXT', name: '危化品车', absoluteBoundingBox: box(2, 1, 96, 58) },
        child('10:1-a', 10, 20, 20, 20),
        child('10:1-b', 60, 20, 20, 20),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['10:1']).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'low', // ← 若 TEXT 被当背景层剔掉，此处会是 'high'（2 个 FRAME 完全并排）
    })
  })

  it('🛡️ 过滤后不足 2 个 ⇒ 回退全集（不返回 null）：1 背景层 + 1 内容 仍有事实', () => {
    // 「无事实 ⇒ LLM 只能猜 ⇒ 竖排堆叠」是本仓最坏结果，故宁可带背景层判定也不丢事实。
    const node = {
      id: '11:1',
      layoutMode: 'NONE',
      absoluteBoundingBox: box(0, 0, 100, 100),
      children: [
        child('11:1-bg', 0, 0, 100, 100, { name: 'bg' }), // 100% ⇒ 会被剔除
        child('11:1-c', 10, 10, 30, 30), // 剔完只剩 1 个 ⇒ 触发回退
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['11:1']).toBeDefined()
    expect(facts['11:1']).toMatchObject({ display: 'flex', source: 'geometric-inference' })
  })

  it('🛡️ 真 2×2 网格不被误伤：带背景层的 4 卡网格 → 仍 grid-2（且比旧行为更准）', () => {
    // 旧行为：bg(x=0) 与 A/C(x=0) 同列 ⇒ 5 个挤成 1 列 ⇒ 非网格 ⇒ 误判 flex。
    // 新行为：剔 bg ⇒ A,B,C,D 成 2×2 ⇒ 正确 grid-2。
    const grid = {
      id: '12:1',
      layoutMode: 'NONE',
      absoluteBoundingBox: box(0, 0, 100, 100),
      children: [
        child('12:1-bg', 0, 0, 100, 100, { name: 'bg' }),
        child('12:1-a', 0, 0, 40, 40),
        child('12:1-b', 50, 0, 40, 40),
        child('12:1-c', 0, 50, 40, 40),
        child('12:1-d', 50, 50, 40, 40),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [grid] } })
    expect(facts['12:1']).toEqual({
      display: 'grid',
      gridColumns: 2,
      source: 'geometric-grid-inference',
      confidence: 'high',
    })
  })
})
