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

