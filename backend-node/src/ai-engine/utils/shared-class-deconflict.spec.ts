import {
  collectSharedBlocks,
  collectVueClassDecls,
  parseDecls,
  deconflictSharedClassDecls,
  DECONFLICT_PROPS,
} from './shared-class-deconflict.js'

/**
 * 共享表「同名类语义冲突」去冗余回归测试（2026-09-29 · mc-max-1790655877133-02ab668d 实锤）
 *
 * 事故：`.c-traffic-monitor-chart` 在 4 个子组件里语义不同 ——
 *   CardGrid / CardGrid13 / ContentSection6 = 52×52 环形图容器；
 *   ChartChart = 占满宽度的柱状图容器（width:100%）。
 * 共享表 common.less 取了 52px，而每个 .vue 的 `<style scoped>@import index.less`
 * 会把整张共享表复制一遍（含父 index.vue）→ 52px 被复制 13 份、同特异性后注入者胜
 * → 柱状图实测被钉成 52×150（对照图 411×150）。生产同一条路径。
 */

const commonLess = `// 通用样式（系统自动生成）
.c-traffic-monitor-chart {
  display: flex;
  flex-direction: column;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  min-height: 160px;
}

.c-traffic-monitor-chart-2 {
  display: flex;
  width: 100%;
  height: 100%;
}
`

const cardGrid = `<template><div class="c-traffic-monitor-card"><div class="c-traffic-monitor-chart"></div></div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-traffic-monitor-chart {
  display: flex;
  flex-direction: column;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  min-height: 160px;
}
</style>
`

const chartChart = `<template><div class="c-traffic-monitor-chart"></div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-traffic-monitor-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 127px;
}
</style>
`

const files = () => [
  { path: 'resources/styles/common.less', content: commonLess },
  { path: 'package/components/CardGrid.vue', content: cardGrid },
  { path: 'package/components/ChartChart.vue', content: chartChart },
]

describe('shared-class-deconflict', () => {
  test('parseDecls / collectSharedBlocks / collectVueClassDecls 基本解析', () => {
    expect(parseDecls(' width: 52px; height:52px ').get('width')).toBe('52px')
    const blocks = collectSharedBlocks(commonLess)
    expect(blocks.has('c-traffic-monitor-chart')).toBe(true)
    expect(blocks.get('c-traffic-monitor-chart')[0].propMap.get('width')).toBe('52px')
    expect(collectVueClassDecls(chartChart).get('c-traffic-monitor-chart').get('width')).toBe('100%')
    expect(DECONFLICT_PROPS.has('min-height')).toBe(true)
  })

  test('🛡️ 复刻事故现场：共享表删除所有使用方都自带、且互相冲突的属性', () => {
    const r = deconflictSharedClassDecls(files())
    const after = r.files.find((f) => f.path === 'resources/styles/common.less').content
    const block = after.match(/\.c-traffic-monitor-chart \{([\s\S]*?)\}/)[1]

    // ① width / height / min-height：两个使用方各自声明且值不同 → 从共享表删除
    expect(block).not.toMatch(/width\s*:/)
    expect(block).not.toMatch(/height\s*:/)
    expect(block).not.toMatch(/min-height\s*:/)
    // ② display / flex-direction / flex-shrink：ChartChart 未声明 → 必须保留（否则它会失去样式）
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/flex-direction:\s*column/)
    expect(block).toMatch(/flex-shrink:\s*0/)
    // ③ 另一个类无人冲突 → 原样不动
    expect(after).toMatch(/\.c-traffic-monitor-chart-2 \{[\s\S]*?width:\s*100%/)
    expect(r.changes.length).toBe(3)
  })

  test('🛡️ 使用方之一未自带该属性 → 保守保留，不误删', () => {
    // ChartChart 不声明 display：共享表的 display 必须留下（上一条已覆盖）
    // 这里构造反向场景：使用方之一完全没有任何声明
    const noStyle = `<template><div class="c-traffic-monitor-chart"></div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>@import '../../resources/styles/index.less';</style>
`
    const r = deconflictSharedClassDecls([
      files()[0],
      files()[1],
      { path: 'package/components/Plain.vue', content: noStyle },
    ])
    const after = r.files.find((f) => f.path === 'resources/styles/common.less').content
    const block = after.match(/\.c-traffic-monitor-chart \{([\s\S]*?)\}/)[1]
    // Plain.vue 使用该类但无任何声明 → 共享表必须完整保留
    expect(block).toMatch(/width:\s*52px/)
    expect(r.changes.length).toBe(0)
    expect(r.evaluated.some((e) => /未自带该声明/.test(e))).toBe(true)
  })

  test('🛡️ 使用方声明一致 → 保留（交给 prune-duplicate-style-decls 处理）', () => {
    const sameA = cardGrid
    const sameB = cardGrid.replace('CardGrid', 'CardGrid2')
    const r = deconflictSharedClassDecls([
      { path: 'resources/styles/common.less', content: commonLess },
      { path: 'package/components/CardGrid.vue', content: sameA },
      { path: 'package/components/CardGrid2.vue', content: sameB },
    ])
    const after = r.files.find((f) => f.path === 'resources/styles/common.less').content
    expect(after).toMatch(/\.c-traffic-monitor-chart \{[\s\S]*?width:\s*52px/)
    expect(r.changes.length).toBe(0)
    expect(r.evaluated.some((e) => /使用方声明一致/.test(e))).toBe(true)
  })

  test('幂等：再跑一次无改动', () => {
    const r1 = deconflictSharedClassDecls(files())
    const r2 = deconflictSharedClassDecls(r1.files)
    expect(r2.changes.length).toBe(0)
  })

  test('形态跟随：对象 map 进 → 对象 map 出；无改动返回原引用', () => {
    const map = {
      'resources/styles/common.less': commonLess,
      'package/components/CardGrid.vue': cardGrid,
      'package/components/ChartChart.vue': chartChart,
    }
    const r = deconflictSharedClassDecls(map)
    expect(Array.isArray(r.files)).toBe(false)
    expect(typeof r.files).toBe('object')
    // 只看该类自己的块，避免跨块匹配到 .c-traffic-monitor-chart-2
    const block = String(r.files['resources/styles/common.less']).match(
      /\.c-traffic-monitor-chart \{([\s\S]*?)\}/,
    )[1]
    expect(block).not.toMatch(/width\s*:/)
    expect(block).not.toMatch(/height\s*:/)
    expect(block).toMatch(/display:\s*flex/)

    // 无冲突 → 原引用
    const clean = {
      'resources/styles/common.less': '.c-x { width: 10px; }',
      'package/components/A.vue': '<template><div class="c-x"/></template><style>.c-x{width:10px}</style>',
    }
    const r2 = deconflictSharedClassDecls(clean)
    expect(r2.files).toBe(clean)
    expect(r2.changes.length).toBe(0)
  })
})
