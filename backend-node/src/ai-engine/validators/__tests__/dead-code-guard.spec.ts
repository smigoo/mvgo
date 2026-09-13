/**
 * CODE-020/021/022 三个确定性检测器单测（2026-09-10，治 device-0quu3hqa 内联渲染/死代码）
 * 覆盖：子组件死代码 import / 资源变量未挂载 / 反向类名不命中。
 */
import {
  CodeStructureValidator,
  findDeadSubComponentImports,
  findUnmountedResourceVars,
  findUndefinedComponentClasses,
} from '../code-structure-validator.js'

describe('CODE-021 findDeadSubComponentImports（子组件死代码 import）', () => {
  const indexWithHeader = (templateBody) => `<template>
  <base-panel panelKey="default-panel">
    ${templateBody}
  </base-panel>
</template>

<script setup>
import HeaderSection from './components/HeaderSection.vue'
import SwitchSection from './components/SwitchSection.vue'
import TabsSection from './components/TabsSection.vue'
</script>`

  test('模板 0 处引用 → 全部判死代码', () => {
    const content = indexWithHeader('<div>内联内容</div>')
    const dead = findDeadSubComponentImports(content)
    expect(dead.sort()).toEqual(['HeaderSection', 'SwitchSection', 'TabsSection'].sort())
  })

  test('PascalCase 标签引用 → 不死代码', () => {
    const content = indexWithHeader('<HeaderSection />')
    const dead = findDeadSubComponentImports(content)
    expect(dead).not.toContain('HeaderSection')
  })

  test('kebab-case 标签引用 → 不死代码', () => {
    const content = indexWithHeader('<switch-section />')
    const dead = findDeadSubComponentImports(content)
    expect(dead).not.toContain('SwitchSection')
  })

  test('非 ./components 的 import 不误判（vue/echarts）', () => {
    const content = `<template><div>x</div></template>
<script setup>
import { ref } from 'vue'
import * as echarts from 'echarts'
</script>`
    expect(findDeadSubComponentImports(content)).toEqual([])
  })

  test('命名插槽 <template #header-right> 不截断模板 → 插槽外的子组件引用不被误判死代码', () => {
    // 实锤：lazy *? 匹配会停在命名插槽的 </template>，漏掉插槽外的 <HeaderStats /> → 误报死代码。
    const content = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div>头部插槽内容</div>
    </template>
    <div class="body">
      <HeaderStats />
      <DeviceGrid />
    </div>
  </base-panel>
</template>

<script setup>
import HeaderStats from './components/HeaderStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
</script>`
    expect(findDeadSubComponentImports(content)).toEqual([])
  })
})

describe('CODE-022 findUnmountedResourceVars（资源变量 import 未挂载）', () => {
  test('import 后 0 引用 → 判未挂载', () => {
    const content = `<template><div>x</div></template>
<script setup>
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
</script>`
    expect(findUnmountedResourceVars(content).sort()).toEqual(['bg1', 'bg2'].sort())
  })

  test('被脚本引用（const bg4 = bg3）→ 不算未挂载', () => {
    const content = `<template><div>x</div></template>
<script setup>
import bg3 from '../resources/images/bg-8439.png'
const bg4 = bg3
const bg5 = bg3
</script>`
    expect(findUnmountedResourceVars(content)).toEqual([])
  })

  test('词边界：bg1 不被 bg10 误判为已引用', () => {
    const content = `<template><div>x</div></template>
<script setup>
import bg1 from '../resources/images/bg-1.png'
import bg10 from '../resources/images/bg-10.png'
const use = bg10
</script>`
    const res = findUnmountedResourceVars(content)
    expect(res).toContain('bg1')
    expect(res).not.toContain('bg10')
  })

  test('validate 扫子组件：StatsSection 只 import 不挂 bg2 → CODE-022 BLOCK（index 干净不误报）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <base-panel>
    <StatsSection />
  </base-panel>
</template>
<script setup>
import StatsSection from './components/StatsSection.vue'
</script>
<style scoped lang="less">
@import '../resources/styles/common.less';
</style>`,
      },
      {
        path: 'package/components/StatsSection.vue',
        content: `<template><div class="card">中间卡</div></template>
<script setup>
import bg2 from '../../resources/images/bg-8807.png'
</script>`,
      },
    ]
    const res = CodeStructureValidator.validate(files, 'c-vehicle-monitor', {
      target: 'microcode',
    })
    const code022 = (res.issues || []).filter((i) => i.id === 'CODE-022')
    expect(code022.length).toBeGreaterThanOrEqual(1)
    expect(code022.some((i) => String(i.file).includes('StatsSection.vue'))).toBe(true)
    expect(code022.some((i) => /bg2/.test(i.message))).toBe(true)
    expect(code022.some((i) => String(i.file).endsWith('package/index.vue'))).toBe(false)
  })
})

describe('CODE-020 findUndefinedComponentClasses（反向类名不命中）', () => {
  const files = [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-monitor-root">
    <div :class="['c-monitor-tab-item', { 'c-monitor-tab-item-active': true }]">x</div>
    <div class="active">y</div>
  </div>
</template>`,
    },
    {
      path: 'resources/styles/common.less',
      content: `.c-monitor-0quu3hqa-c-monitor-root { width: 100%; }
.c-monitor-0quu3hqa-c-monitor-tab-item { color: #333; }
.c-monitor-0quu3hqa-c-monitor-tab-item-active { color: #fff; }`,
    },
  ]

  test('模板用 c-monitor-tab-item 但 CSS 精确无此名（只有带 hash 前缀版）→ 判未定义', () => {
    const res = findUndefinedComponentClasses(files)
    expect(res).toContain('c-monitor-tab-item')
    expect(res).toContain('c-monitor-tab-item-active')
  })

  test('动态状态类（active，不带 c- 前缀）豁免', () => {
    const res = findUndefinedComponentClasses(files)
    expect(res).not.toContain('active')
  })

  test('实例根类 c-mc-max-* 豁免', () => {
    const f2 = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-mc-max-1789046782479-465cd516 c-monitor-root">x</div></template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-monitor-0quu3hqa-c-monitor-root { width: 100%; }`,
      },
    ]
    const res = findUndefinedComponentClasses(f2)
    expect(res).not.toContain('c-mc-max-1789046782479-465cd516')
  })

  test('模板 class 精确命中 CSS → 不报', () => {
    const f3 = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-monitor-0quu3hqa-c-monitor-root">x</div></template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-monitor-0quu3hqa-c-monitor-root { width: 100%; }`,
      },
    ]
    expect(findUndefinedComponentClasses(f3)).toEqual([])
  })

  test('figma 节点名直译的占位 class（CSS 无后缀）→ 不误报', () => {
    // 历史组件实锤：模板用 c-device-monitor-frame-2136638825（figma 节点名），
    // 这类 class 不承载样式、CSS 里没有也不该报「类名未定义」。
    const f4 = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-device-monitor-frame-2136638825 c-monitor-0quu3hqa-c-monitor-root">x</div></template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-monitor-0quu3hqa-c-monitor-root { width: 100%; }`,
      },
    ]
    expect(findUndefinedComponentClasses(f4)).toEqual([])
  })
})
