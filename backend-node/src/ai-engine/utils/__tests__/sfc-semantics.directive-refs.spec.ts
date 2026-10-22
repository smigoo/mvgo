/**
 * 🛡️ 刀 47（2026-10-22 · mc-1792642629927-5084c375 实锤）：模板**指令表达式**里的未声明变量。
 *
 * 真机病灶：`HeaderText3.vue` 写
 *   `<img v-if="icon普通厂商" :src="icon6" …>`
 * `icon普通厂商` 在 script 里**没有任何声明** ⇒ `v-if` 求值抛 ReferenceError ⇒ 整段模块白屏
 * （比"图标缺失"严重得多：缺图标只是少个元素，未声明变量会让整个组件渲染失败）。
 *
 * 为什么原先零拦截：`extractTemplateRefs` 只抽四类 —— `${var}` / `:attr="裸标识符"` /
 * `ref="var"` / `v-for` 源。**指令表达式（v-if/v-else-if/v-show/v-model）整类不在其中**，
 * 实测 `extractTemplateRefs('<img v-if="icon普通厂商" :src="icon6">')` 只返回 `icon6`。
 *
 * 同时锁死三条**误报**边界（加严门禁最大的风险是假阳性把好产物拒掉）：
 *   ① 成员属性名不是变量（`Math.random` 的 random、`item.visible` 的 visible、`form.name` 的 name）；
 *   ② `v-for` 作用域变量豁免；
 *   ③ 字符串字面量与 JS 关键字的内部标识符不算引用。
 */
// acorn 可选依赖的加载器用 `import.meta.url`，jest 的 CJS 运行时无法解析 ⇒ 降级 mock。
// 本 spec 只验「模板引用抽取」，不依赖 AST 自由变量检测。
jest.mock('../acorn-optional-loader.js', () => ({ acornParser: null, acornWalker: null }))

import {
  validateVueScriptSemantics,
  extractTemplateRefs,
} from '../sfc-semantics.js'

const refsOf = (templateInner: string) => [...extractTemplateRefs(templateInner).used]

describe('刀 47 指令表达式引用抽取', () => {
  test('① 阳性：v-if 未声明变量（ASCII）', () => {
    const code = `<template><div v-if="notDeclared">x</div></template>
<script setup>
const a = 1
</script>`
    const r = validateVueScriptSemantics(code, 'A.vue', {})
    expect(r.issues.join(' ')).toContain('notDeclared')
  })

  test('② 阳性：v-if 未声明变量（中文标识符，合法 JS）', () => {
    const code = `<template><img v-if="icon普通厂商" :src="icon6" /></template>
<script setup>
import icon6 from './a.png'
</script>`
    const r = validateVueScriptSemantics(code, 'B.vue', {})
    expect(r.issues.join(' ')).toContain('icon普通厂商')
    expect(refsOf('<img v-if="icon普通厂商" :src="icon6" />')).toEqual(
      expect.arrayContaining(['icon普通厂商', 'icon6']),
    )
  })

  test('③ 阳性：v-show / v-model 同样纳入', () => {
    const code = `<template><div v-show="visibleFlag"><input v-model="form2" /></div></template>
<script setup>
const a = 1
</script>`
    const r = validateVueScriptSemantics(code, 'C.vue', {})
    const joined = r.issues.join(' ')
    expect(joined).toContain('visibleFlag')
    expect(joined).toContain('form2')
  })

  test('④ 阴性：成员属性名不算引用（Math.random / item.visible / form.name）', () => {
    const code = `<template>
  <div v-for="(item, i) in list" :key="i" v-show="item.visible">
    <span v-if="typeof item.name === 'string' && Math.random() > 0.5">{{ item.name }}</span>
    <input v-model="form.name" />
  </div>
</template>
<script setup>
const list = []
const form = { name: '' }
</script>`
    const r = validateVueScriptSemantics(code, 'D.vue', {})
    expect(r.issues).toEqual([])
    const used = refsOf(code.match(/<template>([\s\S]*)<\/template>/)![1])
    expect(used).toContain('list')
    expect(used).toContain('form')
    // 成员名绝不能被当成变量
    expect(used).not.toContain('random')
    expect(used).not.toContain('visible')
    expect(used).not.toContain('name')
  })

  test('⑤ 阴性：v-for 作用域变量豁免（item / i 不需要 script 声明）', () => {
    const code = `<template><div v-for="(item, i) in list" :key="i" v-if="item.ok">{{ i }}</div></template>
<script setup>
const list = []
</script>`
    expect(validateVueScriptSemantics(code, 'E.vue', {}).issues).toEqual([])
  })

  test('⑥ 阴性：字符串字面量内的标识符不算引用', () => {
    const code = `<template><div v-if="status === 'active'">x</div></template>
<script setup>
const status = 'active'
</script>`
    expect(validateVueScriptSemantics(code, 'F.vue', {}).issues).toEqual([])
    expect(refsOf('<div v-if="status === \'active\'">x</div>')).not.toContain('active')
  })

  test('⑦ 阴性：JS 关键字不是变量（typeof / in / new / delete …）', () => {
    const used = refsOf('<div v-if="typeof a !== \'x\' && b in c && new Date() && delete d">x</div>')
    expect(used).toContain('a')
    expect(used).toContain('b')
    expect(used).toContain('c')
    expect(used).toContain('d')
    for (const kw of ['typeof', 'in', 'new', 'delete']) expect(used).not.toContain(kw)
  })

  test('⑧ 阴性：implicitlyDeclared 里的资源变量仍豁免', () => {
    const code = `<template><img v-if="icon5" :src="icon5" /></template>
<script setup>
const a = 1
</script>`
    expect(
      validateVueScriptSemantics(code, 'G.vue', { implicitlyDeclared: ['icon5'] }).issues,
    ).toEqual([])
  })

  test('⑨ 回归：第七轮真机 HeaderText3 形态被拦下（icon普通厂商）', () => {
    const code = `<template>
  <div data-section-id="38:3206-tail-text" class="c-5084c3-header-text3" v-bind="$attrs">
    <img v-if="icon普通厂商" :src="icon6" class="c-5084c3-header-text3-icon" alt="普通厂商" />
    <span class="c-5084c3-header-text3-title">普通厂商</span>
  </div>
</template>

<script setup>
import icon6 from '../../resources/images/icon-普通厂商-3208.png'
</script>`
    const issues = validateVueScriptSemantics(code, 'HeaderText3.vue', {}).issues
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('icon普通厂商')
  })
})
