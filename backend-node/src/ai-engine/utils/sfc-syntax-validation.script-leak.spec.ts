/**
 * 🛡️ 2026-09-30 · 写盘门禁新增两条判据的用例
 *
 * 来源（mc-max-1790770973695-8bb771e4 实锤）：
 *   ① `</script>` 与 `<style>` 之间残留裸 JS（scriptSplit 多段拼接畸形）
 *      → `@vue/compiler-sfc#parse` 不报错、`onMounted` 永不执行、全静默；
 *   ② 产物 `package/components/base-panel.vue` 与宿主全局注册组件同名 → 面板外壳套两层。
 */
import {
  detectScriptBlockLeakage,
  healScriptBlockLeakage,
  findHostReservedComponentCollisions,
  validateVueScriptSyntax,
  HOST_RESERVED_COMPONENT_NAMES,
} from './sfc-syntax-validation.js'

const CLEAN = `<template>
  <base-panel>
    <div class="c-x">hi</div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
onMounted(() => {})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
`

// 真实畸形形态（c-traffic-monitor-598d88fc/package/index.vue 逐字精简）
const LEAKED = `<template>
  <base-panel><div class="c-x">hi</div></base-panel>
</template>

<script setup>
import {onMounted} from 'vue'
const emitLoadEvent = () => {}
onMounted(() => { emitLoadEvent() })
</script>
import {onUnmounted} from 'vue'
onUnmounted(() => {})
onUnmounted(() => {})

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
`

describe('detectScriptBlockLeakage：</script> 与下一个顶层块之间有裸 JS', () => {
  it('干净 SFC ⇒ 0 泄漏 / 0 错误', () => {
    const r = detectScriptBlockLeakage(CLEAN, 'package/index.vue')
    expect(r.leaks).toEqual([])
    expect(r.errors).toEqual([])
  })

  it('泄漏 SFC ⇒ 1 条，行号定位到 </script> 那一行，字符数正确', () => {
    const r = detectScriptBlockLeakage(LEAKED, 'package/index.vue')
    expect(r.leaks).toHaveLength(1)
    // </script> 在第 9 行（1-based）
    expect(r.leaks[0].line).toBe(9)
    expect(r.leaks[0].chars).toBeGreaterThan(50)
    expect(r.leaks[0].preview).toContain('onUnmounted')
    expect(r.errors[0]).toContain('package/index.vue:9:1')
    expect(r.errors[0]).toContain('脚本块泄漏')
  })

  it('注释不算泄漏（只有 <!-- --> 时判干净）', () => {
    const src = CLEAN.replace('</script>\n\n<style', '</script>\n<!-- 说明 -->\n<style')
    expect(detectScriptBlockLeakage(src).leaks).toEqual([])
  })

  it('无 <style> 块时，</script> 之后有裸 JS 也算泄漏', () => {
    const src = '<template><div/></template>\n<script setup>\nconst a = 1\n</script>\nconst b = 2\n'
    const r = detectScriptBlockLeakage(src)
    expect(r.leaks).toHaveLength(1)
    expect(r.leaks[0].preview).toBe('const b = 2')
  })

  it('两个合法 <script> 块（无 setup + setup）⇒ 零误报', () => {
    const src = `<template><div/></template>\n<script>\nexport default { name: 'X' }\n</script>\n<script setup>\nconst a = 1\n</script>\n`
    expect(detectScriptBlockLeakage(src).leaks).toEqual([])
  })
})

describe('healScriptBlockLeakage：形态A（JS）后移 / 形态B（说明文字）删除', () => {
  it('形态A：泄漏 ⇒ 修复后零泄漏，且泄漏 JS 逐字保留在 script 块内', () => {
    const r = healScriptBlockLeakage(LEAKED)
    expect(r.fixed).toBe(true)
    expect(r.actions).toHaveLength(1)
    expect(r.actions[0].kind).toBe('moved')
    expect(r.unfixable).toEqual([])
    expect(detectScriptBlockLeakage(r.source).leaks).toEqual([])
    // 关键回归护栏：不能截断 —— onUnmounted 两处与 emitLoadEvent 必须都还在
    const src = r.source
    expect(src).toContain('import {onUnmounted} from \'vue\'')
    expect((src.match(/onUnmounted\(\(\) => \{\}\)/g) || []).length).toBe(2)
    expect(src).toContain('onMounted(() => { emitLoadEvent() })')
    // 闭合标签恰好一个，且落在 <style> 之前
    expect((src.match(/<\/script\s*>/gi) || []).length).toBe(1)
    expect(src.indexOf('</script>')).toBeLessThan(src.indexOf('<style'))
  })

  it('形态B：泄漏是 markdown 说明（12bc3750 实锤）⇒ 整段删除，不得塞进 script 块', () => {
    const src = `<template><div/></template>\n<script setup>\nconst a = 1\n</script>\n\n## 📋 脚本生成说明\n\n### 1. 组件职责边界\n- **主组件**：容器布局\n\n\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>\n`
    const r = healScriptBlockLeakage(src)
    expect(r.fixed).toBe(true)
    expect(r.actions[0].kind).toBe('dropped')
    expect(r.actions[0].preview).toBe('## 📋 脚本生成说明')
    expect(detectScriptBlockLeakage(r.source).leaks).toEqual([])
    expect(r.source).not.toContain('脚本生成说明')
    // script 块内容未被破坏
    expect(r.source).toContain('const a = 1')
    expect(r.source).toContain('<style lang="less" scoped>')
  })

  it('混合形态：JS 前缀 + markdown 尾巴 ⇒ 保 JS、删尾巴', () => {
    const src = `<template><div/></template>\n<script setup>\nconst a = 1\n</script>\nimport { onUnmounted } from 'vue'\nonUnmounted(() => {})\n### 说明\n- 一些文字\n<style lang="less" scoped>\n.x{color:red}\n</style>\n`
    const r = healScriptBlockLeakage(src)
    expect(r.fixed).toBe(true)
    expect(r.actions[0].kind).toBe('moved')
    expect(detectScriptBlockLeakage(r.source).leaks).toEqual([])
    expect(r.source).toContain("import { onUnmounted } from 'vue'")
    expect(r.source).not.toContain('### 说明')
  })

  it('不猜：既 parse 不过、又不属说明形态（半截坏 JS）⇒ 原样不动 + unfixable', () => {
    const src = `<template><div/></template>\n<script setup>\nconst a = 1\n</script>\nconst b = }\n<style lang="less" scoped>\n</style>\n`
    const r = healScriptBlockLeakage(src)
    expect(r.source).toBe(src)
    expect(r.fixed).toBe(false)
    expect(r.unfixable).toHaveLength(1)
    expect(r.unfixable[0].preview).toBe('const b = }')
  })

  it('后移会引入重复声明 ⇒ 退化为删除（8bb771e4 实锤：state 段与 lifecycle 段都写 emitLoadEvent）', () => {
    const src = `<template><div/></template>\n<script setup>\nimport { onMounted } from 'vue'\nconst emitLoadEvent = () => { runtimeBuilder.publishEvent('x-onload', {}) }\nonMounted(() => { emitLoadEvent() })\n</script>\n/* ===== 生命周期与事件（第 2/3 段） ===== */\nconst emitLoadEvent = () => { runtimeBuilder.publishEvent('x-onload', {}) }\nonMounted(() => { emitLoadEvent() })\nonUnmounted(() => {})\n<style lang="less" scoped>\n.x{color:red}\n</style>\n`
    const r = healScriptBlockLeakage(src)
    expect(r.fixed).toBe(true)
    expect(r.actions[0].kind).toBe('dropped')
    expect(detectScriptBlockLeakage(r.source).leaks).toEqual([])
    // 不得引入新语法错
    expect(validateVueScriptSyntax(r.source, '').errors).toEqual([])
    // 块内原声明保留（只保留一份）
    expect((r.source.match(/const emitLoadEvent/g) || []).length).toBe(1)
  })

  it('幂等：修一次后再修零改动', () => {
    const once = healScriptBlockLeakage(LEAKED).source
    const twice = healScriptBlockLeakage(once)
    expect(twice.fixed).toBe(false)
    expect(twice.source).toBe(once)
  })

  it('干净 SFC ⇒ 逐字不变（零改动）', () => {
    const r = healScriptBlockLeakage(CLEAN)
    expect(r.fixed).toBe(false)
    expect(r.source).toBe(CLEAN)
    expect(r.actions).toEqual([])
    expect(r.unfixable).toEqual([])
  })
})

describe('findHostReservedComponentCollisions：产物禁与宿主全局注册组件同名', () => {
  it('保留名单当前为 base-panel', () => {
    expect([...HOST_RESERVED_COMPONENT_NAMES]).toEqual(['base-panel'])
  })

  it('package/components/base-panel.vue ⇒ 命中', () => {
    const r = findHostReservedComponentCollisions(
      { 'package/index.vue': '', 'package/components/base-panel.vue': '<template><base-panel/></template>' },
      'package/index.vue',
    )
    expect(r.collisions).toEqual([{ name: 'base-panel', file: 'package/components/base-panel.vue' }])
    expect(r.errors[0]).toContain('宿主保留组件同名')
  })

  it('普通子组件名 ⇒ 不命中', () => {
    const r = findHostReservedComponentCollisions({
      'package/components/HeaderSection.vue': '',
      'package/components/ChartSection.vue': '',
    })
    expect(r.collisions).toEqual([])
  })

  it('resources/ 下的同名文件不算（只认 package/components/）', () => {
    const r = findHostReservedComponentCollisions({ 'resources/styles/base-panel.vue': '' })
    expect(r.collisions).toEqual([])
  })

  it('大小写/反斜杠路径归一后仍命中', () => {
    const r = findHostReservedComponentCollisions({ 'package\\components\\Base-Panel.vue': '' })
    expect(r.collisions).toHaveLength(1)
  })
})
