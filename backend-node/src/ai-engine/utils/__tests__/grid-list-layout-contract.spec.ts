/**
 * 刀 41（2026-10-21 · mc-1792578497809-3a5bb639 实锤）— 折叠网格「布局契约」判据 + 自愈。
 *
 * 事故：合作厂商弹窗三段真值完全同构（4 列 × 126×30、列距 20、行距 20），产物却是三套
 * 实现；两轮真机跑出来的**方向正好互换**（优质 row✅/普通 column❌ → 下一轮反过来）
 * ⇒ 不是「错」，而是**没人管**。既有三道判据的判据域都不覆盖：
 *   · LAYOUT-001：grid 段只比「是不是 grid / 列数」，不管卡宽与间距；
 *   · T3 方向守卫：`truth.isGrid` 直接 continue（网格段零覆盖）；
 *   · 刀 22-grid：只抓子项 `width: calc(N% …)`，本例写的是 `flex: 1 1 calc(25% - 20px)`。
 *
 * 本 spec 守五条：
 *   ① 真值推导：真机 12/15 项几何 ⇒ 4 列 × 126×30、列距/行距 20、lastRowFull 正确；
 *   ② 几何兜底：段自身无 items（战略 38:3140）⇒ 借用「恰好一整行」的子 -list 几何；
 *   ③ 阴性：单列 / x 不等距 / items<2 ⇒ **不判**（真纵向列表不归本刀管）；
 *   ④ 判据：真机三份原始块 ⇒ 违约码逐条吻合；合法形态（含 1fr 且行满）⇒ 零 issue；
 *   ⑤ 自愈：改后逐条断言（含 `&:hover`/`border-radius` 不被破坏、幂等、只动 `<style>`）。
 */

import {
  buildGridContract,
  detectGridListLayoutIssues,
  healGridListLayout,
  judgeGridContract,
  parseDeclMap,
  resolveElementDecls,
} from '../grid-list-layout-contract.js'
import { extractStyleBlocksDeep } from '../flex-sibling-guard.js'

// ── 真机几何（38:3167-list / 38:3211-list，x 步长 146=126+20，y 步长 50=30+20）──
function mkBoxes(count, cols) {
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({
      absoluteBoundingBox: {
        x: 26914 + (i % cols) * 146,
        y: 51830 + Math.floor(i / cols) * 50,
        width: 126,
        height: 30,
      },
    })
  }
  return out
}

const SEC_12 = {
  id: '38:3167-list',
  type: 'grid',
  layout: 'grid',
  gridColumns: 4,
  collapsed: true,
  itemCount: 12,
  items: mkBoxes(12, 4),
}

const SEC_15 = {
  id: '38:3211-list',
  type: 'grid',
  layout: 'grid',
  gridColumns: 4,
  collapsed: true,
  itemCount: 15,
  items: mkBoxes(15, 4),
}

// ── 真机原样样式（common.less，逐字照抄）──
const REAL_LESS = `
// ------------------------------------------------------------------
// 战略合作厂商网格
// ------------------------------------------------------------------

.c-component-vendor-grid--strategic {  display: flex;
  flex-direction: column;

  width: 100%;
}

.c-component-vendor-grid {height: 100%;

  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 20px;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.c-component-vendor-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  background: #fffdf1;
  border-radius: 4px;
  box-sizing: border-box;
}

.c-component-card-grid-list {height: 100%;

  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 20px;
  flex: 1 1 0;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
}

.c-component-card-grid-item {
  flex: 1 1 calc(25% - 20px);
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 8px;
  box-sizing: border-box;
  background: #f6fff7;
  border-radius: 4px;
  height: 30px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(216, 255, 233, 0.6);
  }
}

.c-component-card-grid-list2 {height: 100%;

  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 10px;
  flex: 1 1 0;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
}

.c-component-card-grid-list2-item {
  min-width: 0;
  background: #f6fff7;
  border-radius: 4px;
}
`

const VUE_12 = `<template>
  <div data-section-id="38:3167-list" class="c-component-card-grid-list" v-bind="$attrs">
    <div
      v-for="(item, index) in listData"
      :key="index"
      class="c-component-card-grid-item"
    >
      <span class="c-component-card-grid-label">{{ item.label }}</span>
      <span class="c-component-card-grid-value">{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup>
const listData = []
</script>

<style lang="less" scoped>
.c-component-card-grid-item {
  color: #333333;
}
</style>
`

// 子项 class 被「别的元素」复用（ContentSection6 的容器）⇒ 不可安全改写
const VUE_SHARED = `<template>
  <div data-section-id="38:3211-list" class="c-component-card-grid-list2" v-bind="$attrs">
    <div
      v-for="(item, index) in cardList"
      class="c-component-frame-2136639905 c-component-card-grid-list2-item"
    >
      <span class="c-component-card-grid-list2-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<template>
  <div class="c-component-frame-2136639905"><span>别的区块</span></div>
</template>
`

function filesOf(less, extra = []) {
  return [{ path: 'resources/styles/common.less', content: less }, ...extra]
}

describe('刀 41 · 折叠网格布局契约', () => {
  describe('① 真值推导 buildGridContract', () => {
    it('12 项 4×3 ⇒ 4 列 / 126×30 / 列距 20 / 行距 20 / lastRowFull', () => {
      const c = buildGridContract(SEC_12)
      expect(c).not.toBeNull()
      expect(c.cols).toBe(4)
      expect(c.cardW).toBe(126)
      expect(c.cardH).toBe(30)
      expect(c.colGap).toBe(20)
      expect(c.rowGap).toBe(20)
      expect(c.rows).toBe(3)
      expect(c.itemCount).toBe(12)
      expect(c.lastRowFull).toBe(true)
      expect(c.geometryFrom).toBe('self')
    })

    it('15 项 4×4（末行 3）⇒ lastRowFull=false', () => {
      const c = buildGridContract(SEC_15)
      expect(c.rows).toBe(4)
      expect(c.itemCount).toBe(15)
      expect(c.lastRowFull).toBe(false)
    })

    it('② 段自身无 items + 子 -list 恰好一整行 ⇒ 借用其几何（战略 38:3140）', () => {
      const c = buildGridContract({
        id: '38:3140',
        layout: 'grid',
        gridColumns: 4,
        items: [],
        children: [
          { id: '38:3141-list', type: 'list', items: mkBoxes(4, 4) },
        ],
      })
      expect(c).not.toBeNull()
      expect(c.geometryFrom).toBe('38:3141-list')
      expect(c.cols).toBe(4)
      expect(c.rows).toBe(1)
      expect(c.rowGap).toBeNull() // 单行不判行距
    })

    // 🔴 2026-10-22 真机实锤（mc-1792653212647）：section 树里**有** 38:3140 / 38:3153，
    //   但 plan 节点既没有 items 也没有 gridColumns/子 -list ⇒ 旧实现 `skippedNoTruth`，
    //   战略段两行“从来没被看过”却表现为“没问题”。真值本就在 Figma 树里。
    it('②b 段无 items 且无 gridColumns ⇒ 按 id 反查 Figma 子项（真值兜底）', () => {
      const figmaIndex = new Map([
        [
          '38:3140',
          {
            id: '38:3140',
            bbox: { x: 26914, y: 51649, width: 564, height: 30 },
            rawNode: {
              id: '38:3140',
              children: [
                { id: '38:3141', absoluteBoundingBox: { x: 26914, y: 51649, width: 126, height: 30 } },
                { id: '38:3144', absoluteBoundingBox: { x: 27060, y: 51649, width: 126, height: 30 } },
                { id: '38:3147', absoluteBoundingBox: { x: 27206, y: 51649, width: 126, height: 30 } },
                { id: '38:3150', absoluteBoundingBox: { x: 27352, y: 51649, width: 126, height: 30 } },
              ],
            },
          },
        ],
      ]);
      const c = buildGridContract({ id: '38:3140' }, { figmaIndex });
      expect(c).not.toBeNull();
      expect(c.geometryFrom).toBe('figma:38:3140');
      expect([c.cols, c.cardW, c.cardH, c.colGap, c.rows, c.itemCount]).toEqual([4, 126, 30, 20, 1, 4]);
    });

    it('②c 阴性：Figma 里同样不自洽（只有 1 个子项）⇒ 仍 null（fail-open 不猜）', () => {
      const figmaIndex = new Map([
        [
          'only-one',
          {
            id: 'only-one',
            rawNode: {
              id: 'only-one',
              children: [{ id: 'k', absoluteBoundingBox: { x: 0, y: 0, width: 126, height: 30 } }],
            },
          },
        ],
      ]);
      expect(buildGridContract({ id: 'only-one' }, { figmaIndex })).toBeNull();
    });

    it('②d 阴性：不给 figmaIndex ⇒ 回落到 null（行为与旧版一致）', () => {
      expect(buildGridContract({ id: '38:3140' }, {})).toBeNull();
    });
  })

  describe('③ 阴性：判不了就不判（fail-open）', () => {
    it('只有一个 x 坐标（真纵向列表）⇒ null', () => {
      const sec = {
        id: 'x-list',
        items: mkBoxes(6, 1), // cols=1 ⇒ 全部同 x，y 递增
      }
      expect(buildGridContract(sec)).toBeNull()
    })

    it('x 间距不等（乱排）⇒ null', () => {
      const sec = {
        id: 'y-list',
        items: [
          { absoluteBoundingBox: { x: 0, y: 0, width: 126, height: 30 } },
          { absoluteBoundingBox: { x: 146, y: 0, width: 126, height: 30 } },
          { absoluteBoundingBox: { x: 400, y: 0, width: 126, height: 30 } },
        ],
      }
      expect(buildGridContract(sec)).toBeNull()
    })

    it('items<2 且无可用子段 ⇒ null', () => {
      expect(buildGridContract({ id: 'z', items: mkBoxes(1, 4) })).toBeNull()
    })

    it('无 items / null 节点 ⇒ null', () => {
      expect(buildGridContract(null)).toBeNull()
      expect(buildGridContract({ id: 'n', layout: 'horizontal' })).toBeNull()
    })
  })

  describe('④ 判据 judgeGridContract / detect', () => {
    const contract12 = buildGridContract(SEC_12)
    const sources = [{ path: 'common.less', content: REAL_LESS }]

    it('优质段真机块（flex row wrap, gap 20, flex:1 1 calc%）⇒ 仅 item-basis', () => {
      const wrap = resolveElementDecls(sources, ['c-component-card-grid-list'])
      const item = resolveElementDecls(sources, ['c-component-card-grid-item'])
      const codes = judgeGridContract(contract12, wrap, item).map((v) => v.code)
      expect(codes).toEqual(['item-basis'])
    })

    it('普通段真机块（flex column, gap 10, item 无高）⇒ display/col-gap/row-gap/item-basis/item-height', () => {
      const contract15 = buildGridContract(SEC_15)
      const wrap = resolveElementDecls(sources, ['c-component-card-grid-list2'])
      const item = resolveElementDecls(sources, ['c-component-card-grid-list2-item'])
      const codes = judgeGridContract(contract15, wrap, item).map((v) => v.code)
      expect(codes).toContain('display')
      expect(codes).toContain('col-gap')
      expect(codes).toContain('row-gap')
      expect(codes).toContain('item-basis')
      expect(codes).toContain('item-height')
    })

    it('战略段真机块（flex column, gap 20, flex:0 0 auto）⇒ display + item-basis', () => {
      const c = buildGridContract({
        id: '38:3140',
        layout: 'grid',
        gridColumns: 4,
        items: [],
        children: [{ id: '38:3141-list', items: mkBoxes(4, 4) }],
      })
      const wrap = resolveElementDecls(sources, [
        'c-component-vendor-grid',
        'c-component-vendor-grid--strategic',
      ])
      const item = resolveElementDecls(sources, ['c-component-vendor-cell'])
      const codes = judgeGridContract(c, wrap, item).map((v) => v.code)
      expect(codes).toEqual(['display', 'item-basis'])
    })

    it('阴性：契约形态（grid repeat(4,126px) + 两轴 20 + 高 30）⇒ 零 issue', () => {
      const good = `display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; column-gap: 20px; row-gap: 20px; align-content: start;`
      const item = parseDeclMap('height: 30px; min-width: 0;')
      expect(judgeGridContract(contract12, parseDeclMap(good), item)).toEqual([])
    })

    it('阴性：flex 契约形态（row + wrap + gap 20 + flex:0 0 126px）⇒ 零 issue', () => {
      const good = parseDeclMap('display: flex; flex-direction: row; flex-wrap: wrap; gap: 20px;')
      const item = parseDeclMap('flex: 0 0 126px; height: 30px;')
      expect(judgeGridContract(contract12, good, item)).toEqual([])
    })

    it('阴性：grid 下 `flex: 1 1 0` / `width: 100%` 属惰性或等价 ⇒ 不判', () => {
      const wrap = parseDeclMap('display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px;')
      const item = parseDeclMap('flex: 1 1 0; width: 100%; height: 30px;')
      expect(judgeGridContract(contract12, wrap, item)).toEqual([])
    })

    it('grid 下百分比宽度（width: 50% / calc）⇒ item-stretch', () => {
      const wrap = parseDeclMap('display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px;')
      const half = parseDeclMap('width: 50%; height: 30px;')
      expect(judgeGridContract(contract12, wrap, half).map((v) => v.code)).toEqual(['item-stretch'])
      const calc = parseDeclMap('width: calc(25% - 20px); height: 30px;')
      expect(judgeGridContract(contract12, wrap, calc).map((v) => v.code)).toEqual(['item-stretch'])
    })

    // 🔴 2026-10-22 真机实锤（mc-1792653212647 · 38:3167-list）：
    //   容器已改成 `display:grid` 之后，子项残留的 `flex: 0 0 calc(25% - 5px)` 是**惰性**的
    //   （flex 只作用于 flex 容器的子项）⇒ 旧判据报 item-stretch，而该 class 是**共享 class**，
    //   自愈物理上改不了 ⇒ 产生永远消不掉的残留（复检 residual=2、门禁永久转红）。
    it('grid 下 flex 系列惰性：`flex: 0 0 calc(25% - 5px)` ⇒ 零 issue（真机残留真因）', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px;',
      )
      const item = parseDeclMap('display: flex; flex-direction: row; flex: 0 0 calc(25% - 5px); background: #f6fff7;')
      expect(judgeGridContract(contract12, wrap, item)).toEqual([])
    })

    it('阳性对照：同样的 flex-calc 落在 **flex 实现** 下 ⇒ item-basis（不是惰性）', () => {
      const wrap = parseDeclMap('display: flex; flex-direction: row; flex-wrap: wrap; gap: 20px;')
      const item = parseDeclMap('flex: 0 0 calc(25% - 5px); height: 30px;')
      const codes = judgeGridContract(contract12, wrap, item).map((v) => v.code)
      expect(codes).toContain('item-basis')
    })

    it('grid 缺 `grid-auto-rows` ⇒ grid-auto-rows 违约（单行网格会出巨型卡）', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 126px); column-gap: 20px; row-gap: 20px;',
      )
      const item = parseDeclMap('height: 30px;')
      const codes = judgeGridContract(contract12, wrap, item).map((v) => v.code)
      expect(codes).toEqual(['grid-auto-rows'])
    })

    it('grid 有 `grid-auto-rows: 30px` ⇒ 子项无需声明 height（共享 class 也能对齐卡高）', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px;',
      )
      const item = parseDeclMap('height: 100%; width: 100%;') // 真机共享 class 原样
      expect(judgeGridContract(contract12, wrap, item)).toEqual([])
    })

    // 🔴 2026-10-22 真机实测（mc-1792653940949 · 38:3153）：`grid-auto-rows` 只钉**轨道**高，
    //   容器残留 `align-items: center`（原 flex 布局）会关掉子项拉伸 ⇒ 卡高坍缩成内容高
    //   （实测 13.8px vs 真值 30px）。这一维必须与 grid-auto-rows 并列判。
    it('阳性：grid 容器 `align-items: center` ⇒ grid-align-items（卡高会坍缩）', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px; align-items: center;',
      )
      const item = parseDeclMap('height: 100%;')
      expect(judgeGridContract(contract12, wrap, item).map((v) => v.code)).toEqual(['grid-align-items'])
    })

    it('阴性：grid 容器 `align-items: stretch` ⇒ 不判', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 126px); grid-auto-rows: 30px; gap: 20px; align-items: stretch;',
      )
      expect(judgeGridContract(contract12, wrap, parseDeclMap('height: 100%;'))).toEqual([])
    })

    it('1fr 轨道：行满（12 项）⇒ 不判；末行不满（15 项）⇒ grid-track-fluid', () => {
      const wrap = parseDeclMap(
        'display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 30px; gap: 20px;',
      )
      const item = parseDeclMap('height: 30px;')
      expect(judgeGridContract(contract12, wrap, item).map((v) => v.code)).not.toContain(
        'grid-track-fluid',
      )
      const codes15 = judgeGridContract(buildGridContract(SEC_15), wrap, item).map((v) => v.code)
      expect(codes15).toEqual(['grid-track-fluid'])
    })

    it('detect：真机 12 项 + 真模板 ⇒ 1 条 GRID-CONTRACT-001', () => {
      const { issues, stats } = detectGridListLayoutIssues(filesOf(REAL_LESS, [{ path: 'package/components/CardGridList.vue', content: VUE_12 }]), {
        sections: [SEC_12],
      })
      expect(stats.judged).toBe(1)
      expect(issues).toHaveLength(1)
      expect(issues[0].id).toBe('GRID-CONTRACT-001')
      expect(issues[0].sectionId).toBe('38:3167-list')
      expect(issues[0].violations.map((v) => v.code)).toEqual(['item-basis'])
      expect(issues[0].message).toContain('4 列 × 126×30')
    })

    it('detect：无 sections / 无 v-for ⇒ 零 issue（不猜）', () => {
      const r1 = detectGridListLayoutIssues(filesOf(REAL_LESS), { sections: [] })
      expect(r1.issues).toEqual([])
      const r2 = detectGridListLayoutIssues(
        filesOf(REAL_LESS, [{ path: 'a.vue', content: '<template><div class="x"/></template>' }]),
        { sections: [SEC_12] },
      )
      expect(r2.issues).toEqual([])
    })

    // 🔴 2026-10-22 真机实锤（mc-1792653212647 · ContentSection8）：产物是**两层 LESS 嵌套**
    //   `.父 { display:flex … .子 { width:126px … .标签 { … } } }`。正则版提取器只认一层嵌套，
    //   解析出的 selector 变成声明串 ⇒ 判据读不到任何声明（`display:(未声明)`），
    //   而且**自愈把 display:grid 写进去之后复检依旧读不到** ⇒ residual 永不收敛。
    const NESTED_LESS = `
.c-component-nested-parent {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  width: 100%;

  .c-component-nested-item {
    display: flex;
    flex-direction: row;
    width: 126px;
    height: 30px;

    .c-component-nested-label {
      font-size: 14px;
    }
  }
}
`
    const NESTED_VUE = `<template>
  <div data-section-id="38:3153" class="c-component-nested-parent">
    <div v-for="(item, i) in rows" :key="i" class="c-component-nested-item">{{ item.label }}</div>
  </div>
</template>
<script setup>
const rows = []
</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';
${NESTED_LESS}
</style>
`

    it('阳性：两层 LESS 嵌套 ⇒ 判据能读到父块声明（只差 display:grid）', () => {
      const { issues } = detectGridListLayoutIssues(
        [{ path: 'package/components/Nested.vue', content: NESTED_VUE }],
        { sections: [{ id: '38:3153', items: [0, 1].map((i) => ({ absoluteBoundingBox: { x: 26914 + i * 146, y: 51699, width: 126, height: 30 } })) }] },
      )
      expect(issues).toHaveLength(1)
      expect(issues[0].violations.map((v) => v.code)).toEqual(['display'])
    })

    it('深度解析器：两层嵌套下 declText 只含本块声明（子块声明的 height/width 不污染父块）', () => {
      const blocks = extractStyleBlocksDeep(NESTED_LESS)
      const parent = blocks.find((b) => b.selector === '.c-component-nested-parent')
      expect(parent).toBeTruthy()
      expect(parent.declText).toContain('display: flex')
      expect(parent.declText).not.toContain('126px') // 子块 width 不得混入
      const item = blocks.find((b) => b.selector === '.c-component-nested-item')
      expect(item).toBeTruthy()
      expect(item.declText).toContain('width: 126px')
      expect(item.declText).not.toContain('font-size') // 孙块声明不得混入
    })
  })

  describe('⑤ 自愈 healGridListLayout', () => {
    const contract12 = buildGridContract(SEC_12)
    const issue12 = {
      sectionId: '38:3167-list',
      wrapperClasses: ['c-component-card-grid-list'],
      itemClasses: ['c-component-card-grid-item'],
      contract: contract12,
      violations: [{ code: 'item-basis' }],
    }

    it('改写为 grid 固定列宽，且保留 &:hover / border-radius / align-items', () => {
      const r = healGridListLayout(filesOf(REAL_LESS), [issue12])
      expect(r.healed).toHaveLength(1)
      const less = r.files[0].content
      const block = /\.c-component-card-grid-list\s*\{([\s\S]*?)\n\}/.exec(less)[1]
      expect(block).toContain('display: grid')
      expect(block).toContain('grid-template-columns: repeat(4, 126px)')
      expect(block).toContain('grid-auto-rows: 30px')
      expect(block).toContain('column-gap: 20px')
      expect(block).toContain('row-gap: 20px')
      expect(block).toContain('align-content: start')
      expect(block).not.toContain('flex-direction')
      expect(block).not.toContain('flex-wrap')
      expect(block).not.toMatch(/(^|[\s;])gap\s*:/) // 旧 gap 简写必须删除，改两轴
      expect(block).toContain('flex: 1 1 0') // 无关声明一字不动

      const item = /\.c-component-card-grid-item\s*\{([\s\S]*?)\n\}/.exec(less)[1]
      expect(item).not.toContain('calc(25% - 20px)')
      expect(item).toContain('height: 30px')
      expect(item).toContain('&:hover')
      expect(item).toContain('background: #f6fff7')
      expect(item).toContain('border-radius: 4px')
      expect(item).toContain('align-items: center')
    })

    it('幂等：同一 issue 再跑一次 ⇒ 内容不变、归入 unchanged', () => {
      const first = healGridListLayout(filesOf(REAL_LESS), [issue12])
      const second = healGridListLayout(first.files, [issue12])
      expect(second.files[0].content).toBe(first.files[0].content)
      expect(second.healed).toHaveLength(0)
      expect(second.unchanged).toHaveLength(1)
      expect(second.failed).toHaveLength(0)
    })

    it('改写后判据转绿（同一实现自证）', () => {
      const r = healGridListLayout(filesOf(REAL_LESS), [issue12])
      const sources = [{ path: 'common.less', content: r.files[0].content }]
      const wrap = resolveElementDecls(sources, ['c-component-card-grid-list'])
      const item = resolveElementDecls(sources, ['c-component-card-grid-item'])
      expect(judgeGridContract(contract12, wrap, item)).toEqual([])
    })

    it('被复用的 class 不参与改写（frame-2136639905 属 ContentSection6）', () => {
      const contract15 = buildGridContract(SEC_15)
      const issue = {
        sectionId: '38:3211-list',
        wrapperClasses: ['c-component-card-grid-list2'],
        itemClasses: ['c-component-card-grid-list2-item'], // frame-… 已被 detect 过滤掉
        contract: contract15,
        violations: [{ code: 'display' }, { code: 'item-height' }],
      }
      const r = healGridListLayout(
        filesOf(REAL_LESS, [{ path: 'package/components/CardGridList2.vue', content: VUE_SHARED }]),
        [issue],
      )
      const list2 = r.files[0].content
      expect(list2).toContain('grid-template-columns: repeat(4, 126px)')
      const itemBlock = /\.c-component-card-grid-list2-item\s*\{([\s\S]*?)\n\}/.exec(list2)[1]
      expect(itemBlock).toContain('height: 30px')
      // 共享 class 的规则块必须保持原样（不凭空长出 height）
      expect(list2).not.toMatch(/\.c-component-frame-2136639905\s*\{/)
    })

    // 2026-10-22 收紧后的契约：`.vue` 只允许改两处 —— ① `<style>` 区；
    // ② **宿主动签自身的 `style` 属性**（元素级内联通道：共享基础类赢不了层叠时只有它能定论）。
    // 模板其余部分与 script 必须一字不动。
    it('.vue 只改 <style> 与宿主 style 属性，模板其余/script 一字不动', () => {
      const vue = VUE_12.replace(
        '.c-component-card-grid-item {\n  color: #333333;\n}',
        '.c-component-card-grid-item {\n  flex: 1 1 calc(25% - 20px);\n  color: #333333;\n}',
      )
      const r = healGridListLayout(
        filesOf(REAL_LESS, [{ path: 'package/components/CardGridList.vue', content: vue }]),
        [issue12],
      )
      const out = r.files[1].content
      const tpl = out.slice(0, out.indexOf('<style'))
      const before = vue.slice(0, vue.indexOf('<style'))
      expect(tpl).not.toBe(before) // 宿主 style 被补
      expect(tpl).toContain('display:grid')
      expect(tpl).toContain('grid-template-columns:repeat(4, 126px)')
      // 除宿主 style 属性外，模板逐字一致
      const stripHostStyle = (t) => t.replace(/(<[^>]*data-section-id[^>]*?)(\sstyle\s*=\s*"[^"]*")?(\s*>)/i, '$1$3')
      expect(stripHostStyle(tpl)).toBe(stripHostStyle(before))
      expect(r.files[0].content).toContain('display: grid') // class 块在共享 less 里
      expect(out).not.toContain('calc(25% - 20px)')
      expect(out).toContain('color: #333333')
    })

    it('找不到规则块 ⇒ failed（不静默成功）', () => {
      const r = healGridListLayout(
        [{ path: 'resources/styles/common.less', content: '.other { color: red; }' }],
        [issue12],
      )
      expect(r.healed).toHaveLength(0)
      expect(r.failed).toHaveLength(1)
      expect(r.failed[0].reason).toBe('no-rule-block')
    })

    // 🔴 2026-10-22 真机实锤（mc-1792653212647 · ContentSection7）：宿主
    //   `<div data-section-id="38:3140" class="…-row">` 在 `<style>` 里**一个声明都没有**
    //   （LLM 只给子项写了背景色）⇒ 旧实现直接 no-rule-block，判据永远红、没人能修。
    it('宿主 class 无任何规则块 ⇒ 在宿主 .vue 里新建（created）', () => {
      const vue = `<template>
  <div data-section-id="38:3140" class="c-component-row-x">
    <div v-for="(item, i) in list" :key="i" class="c-component-item-x">{{ item.name }}</div>
  </div>
</template>
<script setup>
const list = []
</script>
<style lang="less" scoped>
.c-component-item-x {
  background: #fffdf1;
}
</style>
`
      const issue = {
        sectionId: '38:3140',
        file: 'package/components/RowX.vue',
        wrapperClasses: ['c-component-row-x'],
        itemClasses: ['c-component-item-x'],
        contract: contract12,
        violations: [{ code: 'display' }, { code: 'col-gap' }],
      }
      const r = healGridListLayout([{ path: 'package/components/RowX.vue', content: vue }], [issue])
      expect(r.failed).toHaveLength(0)
      expect(r.healed).toHaveLength(1)
      expect(r.healed[0].created).toBe(true)
      const out = r.files[0].content
      const block = /\.c-component-row-x\s*\{([\s\S]*?)\n\}/.exec(out)
      expect(block).not.toBeNull()
      expect(block[1]).toContain('display: grid')
      expect(block[1]).toContain('grid-template-columns: repeat(4, 126px)')
      expect(block[1]).toContain('grid-auto-rows: 30px')
      expect(block[1]).toContain('column-gap: 20px')
      expect(block[1]).toContain('align-items: stretch')
      // 宿主元素同时拿到**内联**契约（层叠一定赢；只作用这一个元素）
      const tpl = out.slice(0, out.indexOf('<style'))
      expect(tpl).toContain('display:grid')
      const stripHostStyle = (t) => t.replace(/(<[^>]*data-section-id[^>]*?)(\sstyle\s*=\s*"[^"]*")?(\s*>)/i, '$1$3')
      expect(stripHostStyle(tpl)).toBe(stripHostStyle(vue.slice(0, vue.indexOf('<style'))))
      // 幂等：再跑一次不再新建、不再改
      const again = healGridListLayout(r.files, [issue])
      expect(again.files[0].content).toBe(out)
    })

    it('阴性：宿主 class 无块且 issue 不带 file ⇒ 仍 failed（不随便挑文件写）', () => {
      const r = healGridListLayout(
        [{ path: 'package/components/Other.vue', content: '<template><div/></template><style>.a{color:red}</style>' }],
        [issue12],
      )
      expect(r.healed).toHaveLength(0)
      expect(r.failed[0].reason).toBe('no-rule-block')
    })

    // 🔴 2026-10-22 真机实锤（mc-1792654286189 · 38:3211-list）：真值只画了**一行**（4 项），
    //   产物被折叠成 **15 项 = 4 行**。旧实现给单行契约补 `row-gap: 0px`（并把原 `gap` 删掉）
    //   ⇒ 4 行挤成 0 间距（实测行距 20 → 0）。行距未知时**不写也不删**。
    it('单行契约（rows=1）⇒ 不写 row-gap，且不删原有 gap（未知不猜）', () => {
      const contract1 = buildGridContract({
        id: '38:3211-list',
        items: mkBoxes(4, 4), // 只有一行
      })
      expect(contract1.rows).toBe(1)
      const less = `.c-component-single {
  display: flex;
  flex-direction: column;
  gap: 20px;
}`
      const issue = {
        sectionId: '38:3211-list',
        wrapperClasses: ['c-component-single'],
        itemClasses: [],
        contract: contract1,
        violations: [{ code: 'display' }],
      }
      const r = healGridListLayout([{ path: 'a.less', content: less }], [issue])
      const out = r.files[0].content
      expect(out).toContain('display: grid')
      expect(out).toContain('grid-template-columns: repeat(4, 126px)')
      expect(out).toContain('column-gap: 20px')
      expect(out).not.toContain('row-gap')
      expect(out).toContain('gap: 20px') // 行距原值必须留住
    })

    it('战略段：`--strategic` 的 flex-direction 残留不构成违约（级联按文件顺序，非属性顺序）', () => {
      const c = buildGridContract({
        id: '38:3140',
        layout: 'grid',
        gridColumns: 4,
        items: [],
        children: [{ id: '38:3141-list', items: mkBoxes(4, 4) }],
      })
      const r = healGridListLayout(filesOf(REAL_LESS), [
        {
          sectionId: '38:3140',
          wrapperClasses: ['c-component-vendor-grid'],
          itemClasses: ['c-component-vendor-cell'],
          contract: c,
          violations: [{ code: 'display' }, { code: 'item-basis' }],
        },
      ])
      const sources = [{ path: 'common.less', content: r.files[0].content }]
      const wrap = resolveElementDecls(sources, [
        'c-component-vendor-grid',
        'c-component-vendor-grid--strategic',
      ])
      const item = resolveElementDecls(sources, ['c-component-vendor-cell'])
      // `--strategic`（文件里更靠前）仍是 flex/column，但后写的 `vendor-grid` 已是 grid ⇒ 生效值为 grid
      expect(wrap.display).toBe('grid')
      expect(judgeGridContract(c, wrap, item)).toEqual([])
    })
  })
})
