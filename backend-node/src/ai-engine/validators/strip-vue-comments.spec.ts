/**
 * 🛡️ 刀 8（2026-10-27）：strip-vue-comments 判据单一来源的阳性/反向对照。
 *
 * 事故实锤：mc-max-1793079162063-8bbcf027 子组件注释
 *   `// 设备编码区块：仅渲染本 section 真值文案 ROB004`
 * 吞掉真值「编码」⇒ TEXT-COVERAGE 假绿。
 */
import { describe, it, expect } from '@jest/globals'
// @ts-ignore js 模块无类型声明
import { stripVueComments } from '../utils/strip-vue-comments.js'

describe('strip-vue-comments 刀 8 剥注释', () => {
  it('阳性：script 行注释里的中文被剥除（实锤复刻）', () => {
    const vue = `<template><div class="c-t">{{ label }}</div></template>
<script setup>
// 设备编码区块：仅渲染本 section 真值文案 ROB004
const label = '设备总数'
</script>`
    const out = stripVueComments(vue)
    expect(out).not.toContain('设备编码区块')
    expect(out).toContain('设备总数')
  })

  it('阳性：template 的 HTML 注释被剥除', () => {
    const vue = `<template><div><!-- 设备编码占位 --><span>完好率</span></div></template>`
    const out = stripVueComments(vue)
    expect(out).not.toContain('设备编码占位')
    expect(out).toContain('完好率')
  })

  it('阳性：script 块注释与 style 注释（含 less 行注释）被剥除', () => {
    const vue = `<template><div/></template>
<script setup>
/* 块注释里的设备编码 */
const a = 1
</script>
<style lang="less" scoped>
/* 样式块注释里的设备编码 */
// less 行注释里的设备编码
.c-t { color: red; }
</style>`
    const out = stripVueComments(vue)
    expect(out).not.toContain('设备编码')
    expect(out).toContain('color: red')
  })

  it('反向：字符串/模板串内的 // 与中文不得被剥', () => {
    const vue = `<script setup>
const url = 'https://example.cn//path'
const note = "这是//不是注释"
const tpl = \`模板串 // 里的中文保留\`
// 真注释
</script>`
    const out = stripVueComments(vue)
    expect(out).toContain('https://example.cn//path')
    expect(out).toContain('这是//不是注释')
    expect(out).toContain('模板串 // 里的中文保留')
    expect(out).not.toContain('真注释')
  })

  it('反向：style 里未引号 url(http://...) 的 // 不得当注释剥掉路径', () => {
    const vue = `<style lang="less" scoped>
.c-t { background: url(http://cdn.example.cn/a.png) no-repeat; }
</style>`
    const out = stripVueComments(vue)
    expect(out).toContain('http://cdn.example.cn/a.png')
  })

  it('反向：剥注释保留换行（行号对齐，不漂移）', () => {
    const vue = `<script setup>
// 注释行
const a = 1
/* 多行
   块注释 */
const b = 2
</script>`
    const out = stripVueComments(vue)
    expect(out.indexOf('const a = 1')).toBeLessThan(out.indexOf('const b = 2'))
    expect(out.split('\n').length).toBe(vue.split('\n').length)
  })

  it('反向：接管产物 script 数据里的真值串必须保留（刀 53 形态）', () => {
    const vue = `<template><div class="c-t"><span v-for="(r,i) in runs" :key="i">{{ r.text }}</span></div></template>
<script setup>
const runs = [{ text: '编码' }, { text: '设备总数' }]
</script>`
    const out = stripVueComments(vue)
    expect(out).toContain('编码')
    expect(out).toContain('设备总数')
  })

  it('反向：非字符串入参与空串 fail-open', () => {
    expect(stripVueComments('')).toBe('')
    // @ts-expect-error 故意传非字符串
    expect(stripVueComments(null)).toBe('')
  })
})
