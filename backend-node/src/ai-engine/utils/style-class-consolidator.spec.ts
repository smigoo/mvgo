import { consolidateSubComponentClasses } from './style-class-consolidator.js'

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

  it('不迁移 @import 与变量声明', () => {
    const files = {
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

