import { consolidateSubComponentClasses, ensureBackgroundContainerDimensions } from './style-class-consolidator.js'

/**
 * 子组件类样式收敛（2026-09-03，管线 A 方案）。
 * 背景：契约化改造后产物拆分为多子组件，子组件类样式落在 <style scoped>；
 * 预览加载器（vue3-sfc-loader 0.9.5）scopeId 失配 → 子组件样式在预览页全部失效
 * （icon 按 PNG 原始尺寸渲染、chart 容器 0 高）。收敛进 common.less 后经
 * index.css 全局注入生效，不再依赖 scoped。
 */

const logger = { warn: () => {}, info: () => {}, log: () => {} }

/** 子组件 SFC：style 块内含一个类规则 + 一个变量声明（变量不应被迁移） */
const child = (cls, body) => `<template>
  <div class="${cls.slice(1)}"></div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
@fontSize: var(--fontSize);

${cls} {
${body}
}
</style>
`

describe('consolidateSubComponentClasses', () => {
  it('子组件类规则收敛进 common.less（新增）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/IconBar.vue': child('.c-demo-icon-btn', '  width: 24px;\n  height: 24px;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    expect(out['resources/styles/common.less']).toContain('.c-demo-icon-btn')
    expect(out['resources/styles/common.less']).toContain('width: 24px;')
    // 原有内容保留
    expect(out['resources/styles/common.less']).toContain('.c-demo-root')
  })

  it('同名类冲突：以子组件定义为准（消除双源漂移）', () => {
    const files = {
      // common.less 里的同名类值为 100%（导致 icon 按父容器/原始尺寸失控的元凶）
      'resources/styles/common.less': '.c-demo-icon-btn {\n  width: 100%;\n  height: 100%;\n}\n',
      'package/components/IconBar.vue': child('.c-demo-icon-btn', '  width: 24px;\n  height: 24px;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('width: 24px;')
    expect(css).not.toContain('width: 100%;')
    // 只保留一份定义
    expect(css.match(/\.c-demo-icon-btn\s*\{/g)?.length).toBe(1)
  })

  it('🛡️ 批0（2026-09-28）同名类合并保留 common.less 独有声明（不再「删除后覆盖」丢 display/flex-direction）', () => {
    const files = {
      // common.less 的「丰富版」：含结构性声明
      'resources/styles/common.less': '.c-demo-stat-item {\n  display: flex;\n  flex-direction: row;\n  gap: 8px;\n}\n',
      // 子组件的「薄弱版」：只有尺寸类声明（旧实现会整体覆盖 → display/flex-direction 净丢失）
      'package/components/StatCard.vue': child('.c-demo-stat-item', '  flex: 1 1 0;\n  min-height: 0;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 现有独有声明必须被保留（子组件未提供的属性）
    expect(css).toContain('display: flex;')
    expect(css).toContain('flex-direction: row;')
    expect(css).toContain('gap: 8px;')
    // 子组件声明仍然生效
    expect(css).toContain('flex: 1 1 0;')
    expect(css).toContain('min-height: 0;')
    // 仍只有一份定义
    expect(css.match(/\.c-demo-stat-item\s*\{/g)?.length).toBe(1)
  })

  it('🛡️ 批0：同名属性仍以子组件为准（仅补回子组件缺失的声明）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-x {\n  display: flex;\n  gap: 8px;\n}\n',
      'package/components/XCard.vue': child('.c-demo-x', '  display: block;\n  gap: 4px;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('display: block;') // 子组件覆盖同名属性
    expect(css).toContain('gap: 4px;')
    expect(css).not.toContain('gap: 8px;')
  })

  // 🗑️ P4（2026-09-19）已删除 4 条补偿器测试：
  //   - 布局声明缺则保留（injectMissingLayoutDecls，89f28cb）
  //   - flex 信号补 display / flex 信号幂等 / 无 flex 信号不注入（injectDisplayFromFlexSignals，8404de1）
  // display 判定权已由 B' 布局事实层接管（buildNodeLayoutFacts → style+component chunk 双 prompt
  // 强制约束），收敛层不再事后补 display。

  it('子组件已写 display 时不覆盖（以子组件布局意图为准）', () => {
    const files = {
      'resources/styles/common.less':
        '.c-demo-tabs-section {\n  display: flex;\n  flex-direction: row;\n}\n',
      'package/components/Tabs.vue': child('.c-demo-tabs-section', '  display: flex;\n  flex-direction: column;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 子组件明确写了 column，必须保留 column，不被 common.less 的 row 覆盖
    expect(css).toContain('flex-direction: column')
    expect(css).not.toContain('flex-direction: row')
  })

  it('🛡️ echarts 容器（*-canvas）百分比尺寸不被「百分比保护」丢弃（c-traffic-monitor-4d6135d1 实锤）', () => {
    // 场景：LLM 把某真值像素（52×52）误写到 canvas 类进 common.less；
    // 子组件 .vue 的 canvas 规则是 width/height:100%（echarts 挂载点唯一正确形态）。
    // 百分比保护若不豁免 echarts 容器 ⇒ 子组件块被丢弃 ⇒ 52px 恒胜 ⇒ 柱图不可见。
    const chartChild = `<template>
  <div class="c-demo-chart" v-bind="$attrs"><div ref="chartRef" class="c-demo-chart-canvas"></div></div>
</template>

<script setup>
import * as echarts from 'echarts'
</script>

<style lang="less" scoped>
.c-demo-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 127px;
}
</style>
`
    const files = {
      'resources/styles/common.less': '.c-demo-chart-canvas {\n  width: 52px;\n  height: 52px;\n  min-height: 52px;\n}\n',
      'package/components/ChartChart.vue': chartChild,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 子组件百分比必须覆盖 common.less 的误置像素
    // 🛡️ R2 收紧（2026-09-30 · a6d2e5e1）：127px 同属固定像素尺寸，图表类一律不进 common
    //   （scoped @import 复制 N 份后文档序失控，52px 家族的第二形态）。
    expect(css).toContain('width: 100%')
    expect(css).not.toContain('127px')
    expect(css).not.toContain('width: 52px')
  })

  it('非图表类的「子组件百分比 vs common 像素」保护行为不变（回归防线）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-frame {\n  width: 200px;\n  height: 52px;\n}\n',
      'package/components/Frame.vue': `<template>
  <div class="c-demo-frame"></div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
.c-demo-frame {
  width: 100%;
  height: 100%;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 非 echarts 容器：common.less 像素仍应保留（真值不被百分比冲掉）
    expect(css).toContain('height: 52px')
  })

  it('🛡️ 图表组件根类百分比同样豁免（bda1b2fd 宽度塌陷实锤：common 52px 根类 ⇒ 「还是一点点宽」）', () => {
    const chartChild = `<template>
  <div class="c-demo-chart" v-bind="$attrs"><div ref="chartRef" class="c-demo-chart-canvas"></div></div>
</template>

<script setup>
import * as echarts from 'echarts'
</script>

<style lang="less" scoped>
.c-demo-chart {
  width: 100%;
  height: 100%;
  min-height: 160px;
}
</style>
`
    const files = {
      'resources/styles/common.less': '.c-demo-chart {\n  width: 52px;\n  height: 52px;\n}\n',
      'package/components/ChartChart.vue': chartChild,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('width: 100%')
    expect(css).not.toContain('width: 52px')
  })

  it('不迁移 @import 与变量声明', () => {    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/IconBar.vue': child('.c-demo-icon-btn', '  width: 24px;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).not.toContain('@import')
    expect(css).not.toContain('@fontSize: var(--fontSize)')
  })

  it('无子组件 / 无 common.less 时 no-op（不改动原对象）', () => {
    const files = { 'package/index.vue': '<template><div/></template>' }
    expect(consolidateSubComponentClasses(files, { logger })).toEqual(files)

    const onlyChild = { 'package/components/A.vue': child('.c-a', '  width: 1px;') }
    expect(consolidateSubComponentClasses(onlyChild, { logger })).toEqual(onlyChild)
  })

  it('幂等：重复执行内容不再变化', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/IconBar.vue': child('.c-demo-icon-btn', '  width: 24px;'),
    }
    const first = consolidateSubComponentClasses(files, { logger })
    const second = consolidateSubComponentClasses(first, { logger })
    expect(second['resources/styles/common.less']).toBe(first['resources/styles/common.less'])
  })

  it('括号不平衡时整体回退（不写入残缺 LESS）', () => {
    const broken = `<template><div/></template>
<style lang="less" scoped>
.c-demo-broken {
  width: 1px;
</style>
`
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Broken.vue': broken,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    expect(out['resources/styles/common.less']).toBe(files['resources/styles/common.less'])
  })

  it('分隔文本碎片不进入 common.less', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n============== 左侧垂直 Tab ====================\n',
      'package/components/Broken.vue': `<template><div/></template>
<style lang="less" scoped>
============== 右侧分类 Tab ====================
.c-demo-broken {
  width: 1px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    expect(out['resources/styles/common.less']).not.toContain('============== 左侧垂直 Tab ====================')
    expect(out['resources/styles/common.less']).not.toContain('============== 右侧分类 Tab ====================')
    expect(out['resources/styles/common.less']).toContain('.c-demo-root')
    expect(out['resources/styles/common.less']).toContain('.c-demo-broken')
  })

  // ============ ④ #648/#649：scoped 短类 → DOM 真实长/短类重写（治本） ============

  it('④ 全双前缀 DOM：scoped 短类重写为 DOM 长类（对齐真实 DOM）', () => {
    // 子组件 template 的 class 全是 c-{instanceId}-短类 长形式，scoped 里是短类
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Card.vue': `<template>
  <div class="c-demo-card-malvtjd5-c-demo-card-wrap">
    <span class="c-demo-card-malvtjd5-c-demo-card-title">标题</span>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-card-wrap {
  display: flex;
}
.c-demo-card-title {
  font-size: 14px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 缩写后的选择器必须匹配 DOM 真实长类，而非原 scoped 短类
    expect(css).toContain('.c-demo-card-malvtjd5-c-demo-card-wrap')
    expect(css).toContain('.c-demo-card-malvtjd5-c-demo-card-title')
    expect(css).not.toContain('.c-demo-card-wrap {')
    expect(css).not.toContain('.c-demo-card-title {')
    // 原有内容保留
    expect(css).toContain('.c-demo-root')
  })

  it('④ 全短 DOM（无 instanceId）：scoped 短类保持短类，不臆造前缀', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Box.vue': `<template>
  <div class="c-demo-box-wrap">
    <span class="c-demo-box-label">标签</span>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-box-wrap {
  display: flex;
}
.c-demo-box-label {
  font-size: 14px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // DOM 全短 → 保持短类，选择器与 DOM 一致
    expect(css).toContain('.c-demo-box-wrap')
    expect(css).toContain('.c-demo-box-label')
    expect(css).not.toContain('c-demo-box-malvtjd5')
    expect(css).toContain('.c-demo-root')
  })

  it('④ 混合 DOM（部分双前缀、部分短）：各 selector 按 DOM 实际形态对齐', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Mix.vue': `<template>
  <div class="c-demo-mix-malvtjd5-c-demo-mix-long">
    <span class="c-demo-mix-short">短类</span>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-mix-long {
  display: flex;
}
.c-demo-mix-short {
  font-size: 14px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('.c-demo-mix-malvtjd5-c-demo-mix-long') // DOM 有长类 → 用长类
    expect(css).toContain('.c-demo-mix-short') // DOM 只有短类 → 保持短类
    expect(css).not.toContain('.c-demo-mix-long {')
  })

  it('④ 跨行多选择器分组（.a, .b, .c {）完整保留为单一块，不丢规则', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Group.vue': `<template>
  <div class="c-demo-grp-malvtjd5-c-demo-grp-a">
    <span class="c-demo-grp-malvtjd5-c-demo-grp-b">b</span>
    <span class="c-demo-grp-malvtjd5-c-demo-grp-c">c</span>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-grp-a,
.c-demo-grp-b,
.c-demo-grp-c {
  display: flex;
  gap: 4px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 三个选择器必须在同一规则块内，且都被重写为 DOM 长类
    expect(css).toContain('.c-demo-grp-malvtjd5-c-demo-grp-a,')
    expect(css).toContain('.c-demo-grp-malvtjd5-c-demo-grp-b,')
    expect(css).toContain('.c-demo-grp-malvtjd5-c-demo-grp-c {')
    expect(css).toContain('gap: 4px;')
    expect(css).not.toContain('.c-demo-grp-a,')
  })

  it('④ 纯父引用嵌套块（& { &:hover{} }）整体跳过，内部 c- 类不被改写', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Nest.vue': `<template>
  <div class="c-demo-nest-malvtjd5-c-demo-nest-item">item</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-nest-item {
  width: 24px;

  & {
    &:hover {
      opacity: 0.9;
    }
  }
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('.c-demo-nest-malvtjd5-c-demo-nest-item')
    // 父引用块整体保留（未被改写为 DOM 长类）
    expect(css).toContain('& {')
    expect(css).toContain('&:hover')
  })

  it('④ fail-open：无 template / 无映射时行为与旧版一致（保留 scoped 短类）', () => {
    // scoped 短类在 DOM 找不到对应 → 保留原短类（不动）
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Orphan.vue': `<template>
  <div class="c-demo-orphan-real">
    <span class="c-demo-orphan-real-label">x</span>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-orphan-virtual {
  display: none;
}
.c-demo-orphan-real {
  display: block;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // .c-demo-orphan-virtual 在 DOM 无对应 → 保留原短类（fail-open）
    expect(css).toContain('.c-demo-orphan-virtual')
    // .c-demo-orphan-real 在 DOM 有对应短类 → 保持短类
    expect(css).toContain('.c-demo-orphan-real')
  })
})

/**
 * 🛡️ P1.2 修饰符专项（2026-09-11，260ff122 实锤回归）
 *
 * 事故：scoped 里正确的 `.c-x-tab-item--active { 白字 }` 被旧映射（剥修饰符基名 +
 * first-wins）改写成 `.c-x-tab-item { 白字 }` → 激活态规则污染全部 tab，盖掉 Figma
 * 真值 #2c9bea（像素取证渲染为 #bacff3）。
 */
describe('consolidateSubComponentClasses · 修饰符类（260ff122 回归）', () => {
  it('standalone --active 选择器保留后缀；基类规则不被覆盖', () => {
    const files = {
      'resources/styles/common.less': '.c-env-monitor-root {\n  width: 100%;\n}\n',
      'package/components/Tabs.vue': `<template>
  <div class="c-env-monitor-tab">
    <div class="c-env-monitor-tab-item" :class="{ 'c-env-monitor-tab-item--active': active === t.value }">t</div>
  </div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-env-monitor-tab-item {
  color: #2c9bea;
}
.c-env-monitor-tab-item--active {
  color: #ffffff;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('.c-env-monitor-tab-item--active')
    // 关键：激活态规则不得以基类名写入（否则污染全部元素）
    const baseBlocks = css.split('\n').filter((l) => l.trim() === '.c-env-monitor-tab-item {')
    expect(baseBlocks.length).toBeLessThanOrEqual(1)
    expect(css).not.toMatch(/\.c-env-monitor-tab-item\s*\{\s*\n\s*color:\s*#ffffff/s)
  })

  it('DOM 具完整长形修饰符类时直接用长形（含后缀）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Tabs.vue': `<template>
  <div class="c-demo-tabs-malvtjd5-c-demo-tab-item"
       :class="{ 'c-demo-tabs-malvtjd5-c-demo-tab-item--active': active === 'a' }">t</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-tab-item--active {
  color: #ffffff;
}
.c-demo-tab-item {
  color: #2c9bea;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('.c-demo-tabs-malvtjd5-c-demo-tab-item--active')
    expect(css).not.toContain('.c-demo-tab-item--active {')
  })

  it('属性书写顺序反转 → 收敛结果一致（消除顺序依赖）', () => {
    const mk = (staticFirst: boolean) => ({
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Order.vue': staticFirst
        ? `<template>
  <div class="c-demo-item" :class="{ 'c-demo-item--active': on }">x</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-item--active {
  color: #fff;
}
</style>
`
        : `<template>
  <div :class="{ 'c-demo-item--active': on }" class="c-demo-item">x</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-item--active {
  color: #fff;
}
</style>
`,
    })
    const a = consolidateSubComponentClasses(mk(true), { logger })
    const b = consolidateSubComponentClasses(mk(false), { logger })
    expect(a['resources/styles/common.less']).toBe(b['resources/styles/common.less'])
    expect(a['resources/styles/common.less']).toContain('.c-demo-item--active')
  })

  it('幂等：带修饰符的收敛二次执行内容不变', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-root {\n  width: 100%;\n}\n',
      'package/components/Idem.vue': `<template>
  <div class="c-demo-idem-item" :class="{ 'c-demo-idem-item--active': on }">x</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-idem-item--active {
  color: #fff;
}
</style>
`,
    }
    const once = consolidateSubComponentClasses(files, { logger })
    const twice = consolidateSubComponentClasses(once, { logger })
    expect(twice['resources/styles/common.less']).toBe(once['resources/styles/common.less'])
  })
})

/**
 * 🛡️ P0-1 装饰元素保护（2026-09-14，菱形 8px 被撑成 1013×1013 事故）
 *
 * 事故：校验器对 style 第一个 class 注入 width:100%，而 consolidator 以子组件定义
 * 无条件覆盖 common.less。菱形装饰元素（8px）被注入 width:100% → 撑成 1013×1013。
 * 治本：consolidator 保护像素值不被百分比覆盖。
 */
describe('consolidateSubComponentClasses · 装饰元素保护（P0-1）', () => {
  it('菱形装饰：common.less 像素值不被子组件百分比覆盖', () => {
    const files = {
      'resources/styles/common.less': `.c-traffic-monitor-diamond {
  width: 8px;
  height: 8px;
  transform: rotate(45deg);
}
`,
      'package/components/Diamond.vue': `<template>
  <div class="c-traffic-monitor-diamond"></div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-traffic-monitor-diamond {
  width: 100%;
  height: 100%;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 关键：common.less 的 8px 必须保留，不被 100% 覆盖
    expect(css).toContain('width: 8px')
    expect(css).toContain('height: 8px')
    expect(css).not.toMatch(/\.c-traffic-monitor-diamond\s*\{[^}]*width:\s*100%/s)
  })

  it('车辆监测胶囊 tab：像素宽度不被百分比覆盖', () => {
    const files = {
      'resources/styles/common.less': `.c-vehicle-monitor-tab {
  width: 120px;
  padding: 8px 16px;
}
`,
      'package/components/Tab.vue': `<template>
  <div class="c-vehicle-monitor-tab">Tab</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-vehicle-monitor-tab {
  width: 100%;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 关键：common.less 的 120px 必须保留
    expect(css).toContain('width: 120px')
    expect(css).not.toMatch(/\.c-vehicle-monitor-tab\s*\{[^}]*width:\s*100%/s)
  })

  it('正常场景：子组件像素值可以覆盖 common.less 百分比', () => {
    const files = {
      'resources/styles/common.less': `.c-demo-item {
  width: 100%;
}
`,
      'package/components/Item.vue': `<template>
  <div class="c-demo-item">Item</div>
</template>
<script setup></script>
<style lang="less" scoped>
.c-demo-item {
  width: 200px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 正常场景：子组件像素值应该覆盖 common.less 百分比
    expect(css).toContain('width: 200px')
    expect(css).not.toContain('width: 100%')
  })

  // 🛡️ R2 治本（2026-09-30 · c-traffic-monitor-a6d2e5e1 实锤）：
  //   图表组件块的固定 px 尺寸不得进 common.less——scoped @import 会把 common 规则
  //   复制 N 份（各自 data-v），文档序靠后的一份胜过 SFC 本体 width:100% ⇒ 柱图塌陷
  //   （渲染实锤 computed width=52px）。
  it('图表组件（echarts）：固定 px 尺寸不进 common.less，百分比/flex 保留', () => {
    const files = {
      'resources/styles/common.less': `.c-traffic-monitor-chart {
  display: flex;
  flex-direction: column;
}
`,
      'package/components/ChartChart.vue': `<template>
  <div class="c-traffic-monitor-chart"><div class="c-traffic-monitor-chart-canvas"></div></div>
</template>
<script setup>
import * as echarts from 'echarts'
</script>
<style lang="less" scoped>
.c-traffic-monitor-chart {
  width: 52px;
  height: 52px;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.c-traffic-monitor-chart-canvas {
  width: 100%;
  min-height: 127px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    // 任何 52px / 127px 都不得进 common.less
    expect(css).not.toContain('52px')
    expect(css).not.toContain('127px')
    // 百分比与 flex 语义保留；canvas 的 127px 同属固定像素，同样被剥
    expect(css).toMatch(/\.c-traffic-monitor-chart\s*\{[^}]*width:\s*100%/s)
    expect(css).not.toMatch(/\.c-traffic-monitor-chart-canvas\s*\{[^}]*min-height:\s*127px/s)
    expect(css).toMatch(/\.c-traffic-monitor-chart\s*\{[^}]*display:\s*flex/s)
  })

  it('图表组件块剥后无声明 → 整块不进 common.less', () => {
    const files = {
      'resources/styles/common.less': '',
      'package/components/Only.vue': `<template>
  <div class="c-x-chart"></div>
</template>
<script setup>
import * as echarts from 'echarts'
</script>
<style lang="less" scoped>
.c-x-chart {
  width: 52px;
  height: 52px;
}
</style>
`,
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).not.toContain('.c-x-chart')
  })
})


/**
 * 🛡️ R2 补口（2026-09-30 · mc-max-1790701114594-bc33c27d 实锤）：
 *   批0 并集会把旧 common.less 的同名块**原文**回灌——新块剥了 52px、旧块又并回来
 *   （子组件剥后无 width 声明 → 旧值保留）⇒ 柱状图 canvas 仍 52×160。
 *   补口：existing 同名块在该 selector 有 isChartComponent 来源时同样剥。
 */
describe('consolidateSubComponentClasses · R2 补口：批0 existing 块同剥（bc33c27d）', () => {
  const chartChild = (cls, body) => `<template>
  <div class="${cls.slice(1)}"></div>
</template>

<script setup>
import * as echarts from 'echarts'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

${cls} {
${body}
}
</style>
`

  it('⭐ 旧 common 同名块的 52px 在合并时被剥离（不再回灌）', () => {
    const files = {
      // 旧 common.less：含 LLM 误写的 52px（style chunk 阶段写入）
      'resources/styles/common.less': '.c-demo-chart {\n  display: flex;\n  flex-direction: column;\n  width: 52px;\n  min-height: 52px;\n}\n',
      // 图表子组件：百分比块（剥后 52px 行消失）
      'package/components/ChartChart.vue': chartChild('.c-demo-chart', '  width: 100%;\n  height: 100%;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('width: 100%') // 子组件百分比保留
    expect(css).not.toContain('52px') // 旧块 52px 不回灌
    expect(css).toContain('display: flex') // 批0 结构声明保留不受影响
  })

  it('非图表组件的 existing 块像素不受影响（真值保护不回归）', () => {
    const files = {
      'resources/styles/common.less': '.c-demo-icon {\n  width: 52px;\n  min-height: 52px;\n}\n',
      'package/components/IconBar.vue': child('.c-demo-icon', '  display: flex;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less']
    expect(css).toContain('52px') // 非图表真值像素仍受保护
  })
})

describe("🛡️ sanitizeCommonLessText 跨行块注释感知（2026-10-15 · a715fafc 实锤）", () => {
  // 事故形态：common.less 多行块注释收尾行 `   ============ */` 被分隔线清理误杀
  // → /* 失配 → LESS-WRITE-002 门禁拦截 → 新任务首写无 last-good → 空兜底模板裸产物
  const child = (cls, body) => `<template><div class="${cls.slice(1)}">x</div></template>
<style scoped lang="less">
${cls} {
${body}
}
</style>
`;
  const commentedCommon = `/* ============================================================
   部署节点概览 · 业务样式（common.less）
   ============================================================ */

/* ---------- 外层结构容器 ---------- */
.c-x-slot-con {
  display: flex;
}
/* ============================================================
   Header 区
   ============================================================ */
.c-x-header {
  height: 30px;
}
`;

  it("多行块注释收尾行（==== */）不再被分隔线规则误杀，注释保持配对", () => {
    const files = {
      "resources/styles/common.less": commentedCommon,
      "package/components/HeaderBar.vue": child(".c-x-new-block", "  display: flex;"),
    };
    const out = consolidateSubComponentClasses(files, { logger });
    const css = out["resources/styles/common.less"];
    const opens = (css.match(/\/\*/g) || []).length;
    const closes = (css.match(/\*\//g) || []).length;
    expect(opens).toBe(closes);
    expect(css).toContain("============ */");
    // 子组件样式仍正常收敛
    expect(css).toContain(".c-x-new-block");
  });

  it("回归：注释外的裸 ==== 分隔线仍被清理", () => {
    const files = {
      "resources/styles/common.less":
        ".c-x-a {\n  display: flex;\n}\n============ 垃圾分隔线\n.c-x-b {\n  height: 10px;\n}\n",
      "package/components/Bar.vue": child(".c-x-c", "  width: 100%;"),
    };
    const out = consolidateSubComponentClasses(files, { logger });
    const css = out["resources/styles/common.less"];
    expect(css).not.toContain("垃圾分隔线");
    expect(css).toContain(".c-x-c");
  });

  it("单行注释 /* ==== */ 不受影响且配对保持", () => {
    const files = {
      "resources/styles/common.less":
        "/* ==== 单行注释 ==== */\n.c-x-a {\n  display: flex;\n}\n",
      "package/components/Baz.vue": child(".c-x-d", "  color: red;"),
    };
    const out = consolidateSubComponentClasses(files, { logger });
    const css = out["resources/styles/common.less"];
    expect(css).toContain("/* ==== 单行注释 ==== */");
    const opens = (css.match(/\/\*/g) || []).length;
    const closes = (css.match(/\*\//g) || []).length;
    expect(opens).toBe(closes);
  });
});

describe('ensureBackgroundContainerDimensions · v-for 重复单元豁免（2026-10-20 ee06ee24 实锤）', () => {
  // 病灶：v-for item 首卡 :style 绑背景图 ⇒ 根因 H 给 item class 前置注入 width/height:100%，
  // flex-column wrapper 里 = 每项占满容器高 ⇒ 「6 卡只见首卡」。且本函数跑在 writeFiles
  // 写盘路径（自愈链之后）⇒ 刀 31 检出时 item 尚无 height:100%，写盘时才被注入。
  const COMMON = 'resources/styles/common.less'
  const mkFiles = (itemAttrs: string) => ({
    'package/components/ContentSection.vue': `<template>
  <div class="c-x-content-section">
    <div ${itemAttrs}>
      <span>{{ n.name }}</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-x-group-2136638414 {
  display: flex;
  flex-direction: row;
}
</style>`,
    [COMMON]: `.c-x-group-2136638414 {
  display: flex;
}`,
  })

  it('v-for item 带 backgroundImage ⇒ 不注入 width/height:100%（common.less 与 SFC 都不动）', () => {
    const files = mkFiles(`v-for="(n, i) in list" :key="n.name" class="c-x-group-2136638414" :style="i === 0 ? { backgroundImage: 'url(x)' } : {}"`)
    const out = ensureBackgroundContainerDimensions(files)
    expect(out[COMMON]).toBe(files[COMMON])
    expect(out['package/components/ContentSection.vue']).toBe(files['package/components/ContentSection.vue'])
  })

  it(':style 在 class 前的属性序 + v-for ⇒ 同样豁免', () => {
    const files = mkFiles(`v-for="(n, i) in list" :style="{ backgroundImage: 'url(x)' }" class="c-x-group-2136638414"`)
    const out = ensureBackgroundContainerDimensions(files)
    expect(out[COMMON]).toBe(files[COMMON])
  })

  it('阳性对照：非 v-for 背景容器 ⇒ 照常注入 width:100% + height:100%', () => {
    const files = mkFiles(`class="c-x-group-2136638414" :style="{ backgroundImage: 'url(x)' }"`)
    const out = ensureBackgroundContainerDimensions(files)
    expect(out[COMMON]).toContain('width: 100%')
    expect(out[COMMON]).toContain('height: 100%')
    expect(out['package/components/ContentSection.vue']).toContain('width: 100%')
    expect(out['package/components/ContentSection.vue']).toContain('height: 100%')
  })
})
