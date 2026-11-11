/**
 * 运行时标识符事实单测（2026-11-11 · 根因 G · 清单 §2.3）。
 *
 * 这一族断言的意义不是「实现能跑」，而是**把几道门的病灶条件钉成回归网**：
 *   · ① 号门：触发条件曾只看 `$mcComponentBuilder` ⇒ 只裸用 `runtimeBuilder` 的产物兜底压根不执行；
 *   · ② 号门：正则曾只匹配 `?.` 可选链 ⇒ 裸用 `runtimeBuilder.publishEvent(...)` 一个字符都不改；
 *   · ③ 号门：兜底曾只覆盖 `package/index.vue` ⇒ 子组件裸用直接白屏；
 *   · ④ 号门：vue3 生成链路（vue3-engineer）曾**从不调用**兜底 ⇒ 一路裸奔写盘。
 * 前三条在本文件（谓词 + 中和器），第四条由 `neutralizeFilesRuntimeIdents` 的产物级接口保证。
 */
import {
  RUNTIME_BUILDER_NOOP_REF,
  MC_BUILDER_STUB_EXPR,
  isReferenced,
  isDeclared,
  hasRuntimeIdentifiers,
  findUndeclaredRuntimeIdents,
  neutralizeSfcRuntimeIdents,
  neutralizeFilesRuntimeIdents,
} from './runtime-idents.js'

const sfc = (script, extra = '') => `<template><div class="x">x</div></template>\n<script setup>\n${script}\n</script>\n${extra}`

describe('isReferenced / isDeclared（谓词口径）', () => {
  it('裸用 runtimeBuilder ⇒ 引用且未声明（②号门病灶形态）', () => {
    const c = sfc(`runtimeBuilder.publishEvent('c-onload', { a: 1 })`)
    expect(isReferenced(c, 'runtimeBuilder')).toBe(true)
    expect(isDeclared(c, 'runtimeBuilder')).toBe(false)
    expect(findUndeclaredRuntimeIdents(c)).toEqual(['runtimeBuilder'])
  })

  it('可选链 runtimeBuilder?.publishEvent ⇒ 同样未声明', () => {
    const c = sfc(`runtimeBuilder?.publishEvent('c-onload')`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual(['runtimeBuilder'])
  })

  it('const 声明 ⇒ 已声明', () => {
    const c = sfc(`const runtimeBuilder = window.__rb`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('解构声明（$mcComponentBuilder 取成员）⇒ 已声明', () => {
    const c = sfc(`const { componentProps, businessProps, runtimeBuilder } = $mcComponentBuilder()`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('函数形参 ⇒ 已声明', () => {
    const c = sfc(`function init(businessProps, runtimeBuilder) { return businessProps }`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('import 具名绑定 ⇒ 已声明', () => {
    const c = sfc(`import { runtimeBuilder, componentProps } from './mc-runtime'`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('import 别名绑定 ⇒ 已声明', () => {
    const c = sfc(`import { rb as runtimeBuilder } from './mc-runtime'`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('import 跨行不误命中：多行 import 之后的裸用仍是未声明（早期实现的自伤形态）', () => {
    // 早期判据用 `import\\s+[^;]{0,300}?name`，在「全文无分号」的产物里会跨行命中裸用
    //   ⇒ 把裸用误判成已声明 ⇒ 兜底不注入（与本 bug 同款的空窗，实测复现）。
    const c = sfc(`import { ref } from 'vue'
import { computed } from 'vue'
runtimeBuilder.publishEvent('c-onload')`)
    expect(isDeclared(c, 'runtimeBuilder')).toBe(false)
    expect(findUndeclaredRuntimeIdents(c)).toEqual(['runtimeBuilder'])
  })

  it('属性访问 foo.runtimeBuilder ⇒ 不算引用（无需声明）', () => {
    const c = sfc(`const x = window.runtimeBuilder`)
    expect(isReferenced(c, 'runtimeBuilder')).toBe(false)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('对象字面量 key { runtimeBuilder: 1 } ⇒ 不算引用', () => {
    const c = sfc(`const o = { runtimeBuilder: 1, componentProps: {} }`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual([])
  })

  it('标识符子串（runtimeBuilderX）⇒ 不算引用', () => {
    const c = sfc(`const runtimeBuilderX = 1`)
    expect(isReferenced(c, 'runtimeBuilder')).toBe(false)
  })

  it('hasRuntimeIdentifiers：只出现 $mcComponentBuilder 也算（①号门修正）', () => {
    expect(hasRuntimeIdentifiers(sfc(`const p = $mcComponentBuilder()`))).toBe(true)
    expect(hasRuntimeIdentifiers(sfc(`const n = 1`))).toBe(false)
  })

  it('componentProps / businessProps / componentApi 同一口径', () => {
    const c = sfc(`const a = componentProps.id\nconst b = businessProps.title\nconst d = componentApi.get()`)
    expect(findUndeclaredRuntimeIdents(c)).toEqual(['componentProps', 'businessProps', 'componentApi'])
  })
})

describe('neutralizeSfcRuntimeIdents（SFC 级中和）', () => {
  it('裸用 publishEvent ⇒ 短路表达式 + 注入 no-op 对象兜底（不再是 null）', () => {
    const c = sfc(`onMounted(() => { runtimeBuilder.publishEvent('c-onload', { a: 1 }) })`, '')
    const res = neutralizeSfcRuntimeIdents(c, { filePath: 'package/index.vue' })
    expect(res.changed).toBe(true)
    expect(res.undeclared).toEqual(['runtimeBuilder'])
    expect(res.injected).toBe(true)
    // 调用点被短路（RHS 永不求值 ⇒ 既不 ReferenceError 也不 TypeError）
    expect(res.content).toContain(RUNTIME_BUILDER_NOOP_REF)
    // 只短路一次（幂等守卫；自我套娃会长出第二个 `void 0 &&`）
    expect(res.content.match(/void 0 &&/g) || []).toHaveLength(1)
    expect(res.content).toContain("void 0 && runtimeBuilder.publishEvent('c-onload', { a: 1 })")
    // 兜底用对象而非 null：残留 `runtimeBuilder.xxx()` 也不会 TypeError
    expect(res.content).toContain('const runtimeBuilder = { publishEvent() {}, subscribeEvent() { return () => {} } }')
  })

  it('$mcComponentBuilder() ⇒ 整体替换为安全对象，解构成员仍可读', () => {
    const c = sfc(`const { componentProps } = $mcComponentBuilder()\nconst id = componentProps.id`)
    const res = neutralizeSfcRuntimeIdents(c)
    expect(res.changed).toBe(true)
    expect(res.content).toContain(MC_BUILDER_STUB_EXPR)
    expect(res.content).not.toContain('$mcComponentBuilder(')
    // 解构成员已由替换表达式提供 ⇒ 不再需要额外注入
    expect(res.undeclared).toEqual([])
    expect(res.injected).toBe(false)
  })

  it('幂等：已中和的产物再次中和不再改写（NOOP_REF 自含 runtimeBuilder.publishEvent）', () => {
    const c = sfc(`runtimeBuilder.publishEvent('c-onload')`)
    const once = neutralizeSfcRuntimeIdents(c)
    const twice = neutralizeSfcRuntimeIdents(once.content)
    expect(twice.changed).toBe(false)
    expect(twice.content).toBe(once.content)
  })

  it('无 <script> 块但裸用 ⇒ injected:false 且 undeclared 非空（调用方必须上报，禁止静默放过）', () => {
    const c = `<template><div>{{ runtimeBuilder.publishEvent('x') }}</div></template>`
    const res = neutralizeSfcRuntimeIdents(c)
    expect(res.undeclared).toEqual(['runtimeBuilder'])
    expect(res.injected).toBe(false)
    // 模板表达式**不改写**（改写成 `void 0 && ...` 既不是合法 Vue 表达式，又会掩盖
    //   「模板引用应解析到 setup 绑定」这条链路）⇒ 无 script 时只能原样返回 + 上报
    expect(res.changed).toBe(false)
    expect(res.content).toBe(c)
  })

  it('模板引用 + 有 <script> ⇒ 模板不动、由注入的 setup 声明让它可解析', () => {
    const c = sfc(`const n = ref(0)`, '<template><i>{{ runtimeBuilder.publishEvent("x") }}</i></template>')
    const tpl = '<template><i>{{ runtimeBuilder.publishEvent("x") }}</i></template>'
    const res = neutralizeSfcRuntimeIdents(c)
    expect(res.injected).toBe(true)
    expect(res.undeclared).toEqual(['runtimeBuilder'])
    // 模板表达式原样保留
    expect(res.content).toContain(tpl)
    // setup 里补上了声明
    expect(res.content).toContain('const runtimeBuilder = { publishEvent() {}')
  })

  it('干净产物 ⇒ 原样返回、changed:false', () => {
    const c = sfc(`const n = ref(0)`)
    const res = neutralizeSfcRuntimeIdents(c)
    expect(res.changed).toBe(false)
    expect(res.content).toBe(c)
  })
})

describe('neutralizeFilesRuntimeIdents（产物级 · ③④号门）', () => {
  const dirtyIndex = sfc(`runtimeBuilder.publishEvent('c-onload')`)
  const dirtyChild = sfc(`onMounted(() => runtimeBuilder?.publishEvent('child-ready'))`)
  const cleanVue = sfc(`const n = ref(0)`)

  it('覆盖子组件（③号门：旧实现只处理 package/index.vue）', () => {
    const { files, changed } = neutralizeFilesRuntimeIdents({
      'package/index.vue': cleanVue,
      'package/components/panel.vue': dirtyChild,
      'package/utils/format.js': 'export const a = 1',
    })
    expect(changed.map((c) => c.filePath)).toEqual(['package/components/panel.vue'])
    expect(files['package/components/panel.vue']).not.toContain("runtimeBuilder?.publishEvent('child-ready')")
    // 非 .vue 文件不动
    expect(files['package/utils/format.js']).toBe('export const a = 1')
  })

  it('数组入参同样生效且保持形状', () => {
    const input = [
      { path: 'package/index.vue', content: dirtyIndex },
      { path: 'package/components/a.vue', content: cleanVue },
    ]
    const { files, changed } = neutralizeFilesRuntimeIdents(input)
    expect(Array.isArray(files)).toBe(true)
    expect(changed.map((c) => c.filePath)).toEqual(['package/index.vue'])
    expect(files[0].content).toContain('const runtimeBuilder =')
    expect(files[1].content).toBe(cleanVue)
  })

  it('无法中和（无 <script>）⇒ 归入 unfixable 而非 changed（必须可观测）', () => {
    const bad = `<template><div>{{ runtimeBuilder.publishEvent('x') }}</div></template>`
    const { changed, unfixable } = neutralizeFilesRuntimeIdents({ 'package/index.vue': bad })
    expect(changed).toHaveLength(0)
    expect(unfixable).toHaveLength(1)
    expect(unfixable[0].filePath).toBe('package/index.vue')
    expect(unfixable[0].idents).toEqual(['runtimeBuilder'])
  })

  it('全干净 ⇒ 零改动（不产生无意义写盘）', () => {
    const { changed, unfixable } = neutralizeFilesRuntimeIdents({
      'package/index.vue': cleanVue,
      'package/components/a.vue': cleanVue,
    })
    expect(changed).toHaveLength(0)
    expect(unfixable).toHaveLength(0)
  })
})
