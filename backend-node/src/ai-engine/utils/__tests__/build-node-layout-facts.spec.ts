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

  it('标准 Auto-Layout：layoutMode=HORIZONTAL 且几何同为一行 → flex-row high（两源一致，逐字保持既有输出）', () => {
    // 🛡️ R3-2（2026-11-16）：原夹具子项写成 (0,0)/(0,200)（**纵向**摆放却声明 HORIZONTAL），
    //   物理上不可能（Figma 会按 AL 强制排布），属合成的「不可能态」，且恰好把「声明压几何」
    //   这条错误策略固化了。改为与声明一致的几何；「声明与几何冲突」的阳性对照见
    //   layout-al-reconcile.spec.ts。
    const node = {
      id: '3:10',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      children: [child('3:11', 0, 0, 50, 50), child('3:12', 50, 0, 50, 50)],
    }
    const facts = buildNodeLayoutFacts(node)
    expect(facts['3:10']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'figma-layoutMode',
      confidence: 'high',
    })
  })

  it('标准 Auto-Layout：layoutMode=VERTICAL 且几何同为纵向 → flex-column high', () => {
    const node = {
      id: '3:20',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [child('3:21', 0, 0, 50, 50), child('3:22', 0, 50, 50, 50)],
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
    // 🛡️ R3-2：补上容器 bbox —— 声明要与几何对账才可能判 high（无 bbox 时只能 al-only，
    //   见 layout-al-reconcile.spec.ts ⑤）。此处几何与声明一致，保留原断言不变。
    const root = {
      id: '7:0',
      layoutMode: 'VERTICAL',
      children: [
        {
          id: '7:1',
          layoutMode: 'NONE',
          absoluteBoundingBox: box(0, 0, 200, 30),
          children: [child('7:2', 0, 0, 80, 30), child('7:3', 90, 0, 80, 30)],
        },
        {
          id: '7:4',
          layoutMode: 'NONE',
          absoluteBoundingBox: box(0, 60, 200, 30),
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
    // 🛡️ P0（2026-11-16）：断言由 `flex` 改为 `stack` —— **本 spec 的核心意图（不丢事实）不变**，
    //   变的是「1 背景层 + 1 内嵌内容」的正确形态：既是层叠，就不存在主轴排列，给 flex 方向
    //   必然错（真机 `2:7941` icon：RECT 24×24 铺底 + FRAME 18×18 内嵌 ⇒ 旧行为 flex/column
    //   ⇒ 注入器硬写 flex-direction ⇒ 图标被推到背景下方）。T0 实测 29 语料同形态 232 个容器。
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
    expect(facts['11:1']).toMatchObject({
      display: 'stack',
      source: 'geometric-stack-inference',
      confidence: 'high',
    })
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

describe('同 bbox 叠层（刀 6 · 2026-10-27 · 8bbcf027 `36:1726` 实锤）', () => {
  it('⭐ 全部子项 bbox 完全相同（Mask group 3 矩形 98×98 同坐标）→ display:stack，无 flexDirection', () => {
    // 真值链：36:1725(img) → 36:1726(Mask group) → 36:1727/1728/1729 三个 RECTANGLE，
    // 三者与父 bbox 全等 (24745,51499) 98×98 —— 实为层叠（底 + 封面 + 图），
    // 旧判据给 flex/column/high（549 个容器全中此假事实），注入后叠层被拉成纵流。
    const mask = {
      id: '36:1726',
      type: 'GROUP',
      absoluteBoundingBox: box(24745, 51499, 98, 98),
      children: [
        child('36:1727', 24745, 51499, 98, 98),
        child('36:1728', 24745, 51499, 98, 98),
        child('36:1729', 24745, 51499, 98, 98),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [mask] } })
    expect(facts['36:1726']).toEqual({
      display: 'stack',
      source: 'geometric-stack-inference',
      confidence: 'high',
    })
  })

  it('⭐ icon 包装典型形态：2 个同 bbox 子项（VECTOR + mask RECTANGLE）→ stack', () => {
    // 全语料 549 个命中的主流形态（icon GROUP，2 子项全等 bbox 40×40）。
    const icon = {
      id: '48:5808',
      type: 'GROUP',
      absoluteBoundingBox: box(20851, 51623, 40, 40),
      children: [
        child('48:5809', 20851, 51623, 40, 40),
        child('48:5810', 20851, 51623, 40, 40),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [icon] } })
    expect(facts['48:5808']).toEqual({
      display: 'stack',
      source: 'geometric-stack-inference',
      confidence: 'high',
    })
  })

  it('反向：同 bbox 子项之外还有偏移子项 ⇒ 不是 stack（回几何判定）', () => {
    const node = {
      id: '50:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 98, 98),
      children: [
        child('50:2', 0, 0, 98, 98),
        child('50:3', 0, 0, 98, 98),
        child('50:4', 10, 10, 48, 48),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['50:1'].display).not.toBe('stack')
  })

  it('反向：子项 bbox 仅 1px 差 ⇒ 不是 stack（不引入近似阈值，只认完全相等）', () => {
    const node = {
      id: '51:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 98, 98),
      children: [
        child('51:2', 0, 0, 98, 98),
        child('51:3', 0, 1, 98, 98),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['51:1'].display).not.toBe('stack')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ 2026-11-17 装饰性位图铺底剔除（`73:3`「监测预警」实锤）
//    事故：自由摆放行里有一层「低透明度位图铺底」（设计稿阴影/氛围图，`opacity:0.3` + `IMAGE`），
//      它不铺满父容器（还可能出血越界）⇒ 逃过 `excludeBackgroundLayers` 的 90% 面积判据，却与行内
//      每个内容子项大范围重叠 ⇒ 两两 `areBoxesSideBySide` 恒否 ⇒ ratio 被拉低到 low
//      ⇒ 注入器 T2 闸（`geometric-inference` + low **整段跳过**）⇒ 真值 row 的行拿不到 flex-direction。
//    判据（见 `excludeDecorativeImageBackdrops`）：`opacity<1` ∧ 含 `IMAGE` fill ∧ 非 TEXT
//      ∧ 与同容器 ≥2 个兄弟重叠 ≥ 0.5·min(面积)。
//    全语料量化（29 语料 / 1693 个「≥2 可比子项」容器，逐容器对账）：
//      翻转 9 个 —— **low→high 9、方向改变 0**；命中全部落在 `73:3` 的 `1:377`/`1:388`/`1:400`。
//    承重性：`IMAGE` 放宽成「任意 fills」→ 2 个方向改变；去掉 `IMAGE` → 16 个方向改变（两条件都不可省）。
// ─────────────────────────────────────────────────────────────────────────────
describe('buildNodeLayoutFacts — 装饰性位图铺底剔除（2026-11-17 · 73:3 实锤）', () => {
  it('⭐ 真机 1:377：低透明度位图铺底（出血越界）被剔 ⇒ 自由摆放行从 low 抬到 row/high', () => {
    // 父 386×50；真值 row（icon 左 / 两段文字右）。铺底 `1:378` 140×44 @x=1750 ——
    // 父 x=1773，**左出血 23px** ⇒ 面积占父 0.32 < 0.9 ⇒ `excludeBackgroundLayers` 抓不到它。
    const row = {
      id: '1:377',
      type: 'FRAME',
      absoluteBoundingBox: box(1773, 210, 386, 50),
      children: [
        {
          id: '1:378',
          type: 'RECTANGLE',
          name: 'bg-img',
          opacity: 0.3,
          fills: [{ type: 'IMAGE', visible: true }],
          absoluteBoundingBox: box(1750, 216, 140, 44),
        },
        child('1:379', 1773, 210, 386, 50, { name: 'bg-1', type: 'GROUP' }), // 整块背景层（100% 父面积）
        { id: '1:384', type: 'TEXT', absoluteBoundingBox: box(1818.41, 214, 58.83, 43) },
        child('1:385', 1781, 221, 28, 28, { name: 'icon-1' }),
        { id: '1:387', type: 'TEXT', absoluteBoundingBox: box(1896.85, 214, 253.89, 43) },
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [row] } })
    // 含铺底：4 项内容 6 组 pair 仅 4 组 side-by-side ⇒ ratio 0.667 = low（注入器 T2 跳过，行拿不到 flex）
    // 剔铺底：剩 3 项 3 组 pair 全 side-by-side ⇒ ratio 1 = high ⇒ 注入器写出 display:flex/flex-direction:row
    expect(facts['1:377']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })

  it('阴性①：铺底只与 1 个兄弟重叠（不足 ≥2 闸）⇒ 不剔，仍 low', () => {
    // 若被误剔 ⇒ 只剩 [A1,A2] 完全并排 ⇒ ratio 1 = high；故 confidence='low' 即「未剔」的判据。
    const node = {
      id: '60:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 200, 50),
      children: [
        {
          id: '60:bg',
          type: 'RECTANGLE',
          opacity: 0.5,
          fills: [{ type: 'IMAGE' }],
          absoluteBoundingBox: box(0, 0, 40, 40),
        },
        child('60:a1', 10, 10, 30, 30),
        child('60:a2', 100, 10, 30, 30),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['60:1']).toMatchObject({
      display: 'flex',
      source: 'geometric-inference',
      confidence: 'low',
    })
  })

  it('阴性②：opacity<1 但**无 IMAGE fill**（纯色半透明遮罩）⇒ 不剔，仍 low', () => {
    const node = {
      id: '61:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 200, 50),
      children: [
        {
          id: '61:bg',
          type: 'RECTANGLE',
          opacity: 0.5,
          fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
          absoluteBoundingBox: box(0, 0, 40, 40),
        },
        child('61:a1', 10, 10, 30, 30),
        child('61:a2', 100, 10, 30, 30),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['61:1']).toMatchObject({ source: 'geometric-inference', confidence: 'low' })
  })

  it('阴性③：含 IMAGE fill 但**无 opacity<1**（不透明位图）⇒ 不剔，仍 low', () => {
    const node = {
      id: '62:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 200, 50),
      children: [
        { id: '62:img', type: 'RECTANGLE', fills: [{ type: 'IMAGE' }], absoluteBoundingBox: box(0, 0, 40, 40) },
        child('62:a1', 10, 10, 30, 30),
        child('62:a2', 100, 10, 30, 30),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['62:1']).toMatchObject({ source: 'geometric-inference', confidence: 'low' })
  })

  it('阴性④：TEXT 即便 opacity<1 + IMAGE 也**豁免**（与 excludeBackgroundLayers 的 TEXT 豁免同源）', () => {
    const node = {
      id: '63:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 200, 50),
      children: [
        {
          id: '63:t',
          type: 'TEXT',
          opacity: 0.5,
          fills: [{ type: 'IMAGE' }],
          absoluteBoundingBox: box(0, 0, 40, 40),
        },
        child('63:a1', 10, 10, 30, 30),
        child('63:a2', 100, 10, 30, 30),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['63:1']).toMatchObject({ source: 'geometric-inference', confidence: 'low' })
  })

  it('兜底：全部铺底被剔后不足 2 个 ⇒ 回退全集，事实不丢（display 仍为 flex）', () => {
    // 三层互相重叠（B1/B2 均满足 ≥2 闸）⇒ 剔后只剩 A1；按兜底纪律必须回退全集，不得 return null。
    const node = {
      id: '64:1',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 200, 50),
      children: [
        { id: '64:b1', type: 'RECTANGLE', opacity: 0.5, fills: [{ type: 'IMAGE' }], absoluteBoundingBox: box(0, 0, 60, 40) },
        { id: '64:b2', type: 'RECTANGLE', opacity: 0.5, fills: [{ type: 'IMAGE' }], absoluteBoundingBox: box(20, 0, 60, 40) },
        child('64:a1', 10, 0, 60, 40),
      ],
    }
    const facts = buildNodeLayoutFacts({ document: { id: '0:0', children: [node] } })
    expect(facts['64:1']).toBeDefined()
    expect(facts['64:1'].display).toBe('flex')
  })
})
