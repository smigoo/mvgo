/**
 * R1 主门禁升档：script-only 空壳不得判「合法 SFC」（2026-11-16）。
 *
 * 真机 mc-max-1794761757056-0d15ab1b：磁盘 package/index.vue 872B 只有
 * <script setup>，终验从 code-chunks 回退时 `validateVueSfcExpressions` 因
 * 「无 template ⇒ 跳过全部 template 检查」判 valid=true ⇒ 空壳落盘 ⇒ 预览空白。
 *
 * 判据单一来源：`inspectRenderableTemplateFromDescriptor`。本文件同时锁住
 * 主门禁（validateVueSfc）与终验（validateVueSfcExpressions）两条消费路径，
 * 并做阴阳对照：合法 SFC / 嵌套 slot 不误伤，真错（双 template）仍 FAIL。
 */
import { describe, it, expect } from '@jest/globals'
import {
  validateVueSfc,
  validateVueSfcExpressions,
  inspectSfcRenderableTemplate,
  inspectRenderableTemplateFromDescriptor,
} from '../sfc-syntax-validation.js'

// 真机 0d15ab1b 磁盘终态同形态：只有 script setup，无 <template>
const SCRIPT_ONLY = `<script setup>
import { onMounted } from 'vue'
import ContentSection from './components/ContentSection.vue'
onMounted(() => {})
</script>
`

const GOOD_VUE = `<template>
  <div class="c-demo-root"><span>{{ title }}</span></div>
</template>

<script setup>
const title = 'demo'
</script>

<style scoped lang="less">
.c-demo-root { color: red; }
</style>
`

// 合法嵌套 <template #slot> 不得被误判为「多顶层块」
const NESTED_SLOT = `<template>
  <base-panel>
    <template #header-right><span>right</span></template>
    <div class="c-demo-root">body</div>
  </base-panel>
</template>

<script setup>
const title = 'demo'
</script>
`

// 真机 0d15ab1b 快照 revision 同形态：外层 template 里又包一份完整 SFC
const DOUBLE_TEMPLATE = `<template><template>
  <div class="c-demo-root">body</div>
</template>
<script setup>
const title = 'demo'
</script>
<style scoped>.c-demo-root { color: red; }</style>
</template>
`

describe('R1 可渲染 template 判据（唯一权威函数）', () => {
  it('阳性①：script-only 空壳 → 主门禁 FAIL，错误含「缺少 <template>」', () => {
    const r = validateVueSfc(SCRIPT_ONLY, 'package/index.vue')
    expect(r.valid).toBe(false)
    expect(r.errors.join('\n')).toContain('缺少 <template>')
  })

  it('阳性②：script-only 空壳 → 终验表达式判据 FAIL（缓存回退不得假绿）', () => {
    const r = validateVueSfcExpressions(SCRIPT_ONLY, 'package/index.vue')
    expect(r.valid).toBe(false)
    expect(r.errors.join('\n')).toContain('缺少 <template>')
  })

  it('阳性③：包装函数返回 hasTemplate=false，与主门禁结论一致', () => {
    const r = inspectSfcRenderableTemplate(SCRIPT_ONLY, 'package/index.vue')
    expect(r.hasTemplate).toBe(false)
    expect(r.valid).toBe(false)
    expect(r.errors).toHaveLength(1)
  })

  it('descriptor 版与 source 版同口径（单一来源，不是两份实现）', () => {
    const fromSource = inspectSfcRenderableTemplate(GOOD_VUE, 'Good.vue')
    const fromDescriptor = inspectRenderableTemplateFromDescriptor(
      // 用 compiler 的 descriptor 形状做契约断言，不依赖私有字段
      { template: { content: '<div />' } } as any,
      'Good.vue',
    )
    expect(fromSource.hasTemplate).toBe(true)
    expect(fromDescriptor.hasTemplate).toBe(true)
    expect(fromDescriptor.valid).toBe(true)
  })

  it('阴性①：合法单 SFC（含 less style）三条路径全绿', () => {
    expect(validateVueSfc(GOOD_VUE, 'Good.vue').valid).toBe(true)
    expect(validateVueSfcExpressions(GOOD_VUE, 'Good.vue').valid).toBe(true)
    expect(inspectSfcRenderableTemplate(GOOD_VUE, 'Good.vue').hasTemplate).toBe(true)
  })

  it('阴性②：合法嵌套 <template #slot> 不被误伤', () => {
    expect(validateVueSfc(NESTED_SLOT, 'Nested.vue').valid).toBe(true)
    expect(validateVueSfcExpressions(NESTED_SLOT, 'Nested.vue').valid).toBe(true)
  })

  it('阴性③：真错仍 FAIL —— 双 <template> 包住 script/style 被判无效', () => {
    expect(validateVueSfc(DOUBLE_TEMPLATE, 'package/index.vue').valid).toBe(false)
    expect(validateVueSfcExpressions(DOUBLE_TEMPLATE, 'package/index.vue').valid).toBe(false)
    // 该形态有 template，不得被误分类成 script-only
    expect(inspectSfcRenderableTemplate(DOUBLE_TEMPLATE, 'package/index.vue').hasTemplate).toBe(true)
  })

  it('阴性④：空串 / 非 SFC 文本不误报为「合法可渲染」', () => {
    expect(inspectSfcRenderableTemplate('', 'Empty.vue').hasTemplate).toBe(false)
    expect(validateVueSfcExpressions('', 'Empty.vue').valid).toBe(false)
  })
})
