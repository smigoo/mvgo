import { stripLlmTailGarbage } from './llm-tail-garbage.js'

/**
 * G2: fence-tail 双 template 检测（2026-08-31，事故 4 mc-max-1788179386544-86ab341b 关联）
 *
 * 背景：LLM 输出尾部残留导致 SFC 出现两个 <template> 根元素。
 * 现有 stripLlmTailGarbage 用 lastSfcCloseLine 找最后一个 </template>，
 * 当存在重复 template 块时，它把第二个 template 块当作"合法 SFC 内容"，
 * 只剥离第二个 </template> 之后的尾部 → 双 template 残留 → SFC 编译失败 →
 * P1-4 隔离 → 触发 G1 空壳链。
 *
 * 修复：检测顶层 template 数量（depth tracking），>1 时在第一个顶层 template
 * 闭合处截断，reason='duplicate-template'。
 */

const makeValidSfc = (innerContent = '<div class="root">hello</div>') =>
  `<template>
  ${innerContent}
</template>
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>
<style lang="less" scoped>
.root { width: 100%; }
</style>`

describe('G2: stripLlmTailGarbage 双 template 检测', () => {
  it('单个 template（合法 SFC）→ 不截断', () => {
    const content = makeValidSfc()
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(false)
    expect(result.content).toBe(content)
  })

  it('单个 template + 普通尾部垃圾 → 按原有逻辑截断（reason=fence-tail 或 text-tail）', () => {
    const content = makeValidSfc() + '\n```\n这是一段说明文字\n'
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(true)
    expect(result.reason).toMatch(/fence-tail|text-tail/)
  })

  it('双 template（第二个是 LLM 重复输出的垃圾）→ 截断到第一个 template 闭合', () => {
    const content =
      makeValidSfc() +
      '\n<template>\n  <div class="duplicate">这是重复的template</div>\n</template>\n'
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(true)
    expect(result.reason).toBe('duplicate-template')
    // 截断后不应包含第二个 <template>
    expect(result.content).not.toContain('duplicate')
    // 截断后应仍是合法 SFC（以第一个 template 的 </template> 结尾）
    expect(result.content).toContain('</template>')
    // 只应有一个顶层 <template>
    const templateOpens = (result.content.match(/<template[\s>]/g) || []).length
    expect(templateOpens).toBe(1)
  })

  it('双 template + 围栏尾部 → 截断到第一个 template 闭合（reason=duplicate-template 优先）', () => {
    const content =
      makeValidSfc() +
      '\n<template>\n  <div>重复</div>\n</template>\n```\n说明文字\n'
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(true)
    expect(result.reason).toBe('duplicate-template')
    expect(result.content).not.toContain('重复')
  })

  it('template 内部有嵌套 template（如 v-for template）→ 不误判为双 template', () => {
    const content = makeValidSfc(`
      <div class="root">
        <template v-for="item in items" :key="item.id">
          <span>{{ item.name }}</span>
        </template>
      </div>
    `)
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(false)
    expect(result.content).toBe(content)
  })

  it('双 template 且第二个 template 跨多行 → 正确截断', () => {
    const content =
      makeValidSfc() +
      `
<template>
  <base-panel>
    <template #header_right>
      <HeaderTabs />
    </template>
  </base-panel>
</template>
`
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(true)
    expect(result.reason).toBe('duplicate-template')
    expect(result.content).not.toContain('base-panel')
    expect(result.content).not.toContain('HeaderTabs')
  })

  it('strippedLines 正确反映被截断的行数', () => {
    const content =
      makeValidSfc() +
      '\n<template>\n  <div>重复</div>\n</template>\n'
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(true)
    expect(result.strippedLines).toBeGreaterThan(0)
    // strippedLines = 原行数 - 保留行数（保留到 firstCloseLine 含）
    const originalLines = content.split('\n').length
    // result.content 末尾有额外 \n，split 会多一个空元素，用 match 计算保留行数更准确
    const keptNewlines = (result.content.match(/\n/g) || []).length
    const keptLines = keptNewlines // 保留的内容行数 = 换行符数（每行一个 \n）
    expect(originalLines - keptLines).toBe(result.strippedLines)
  })

  it('非 .vue 文件（.less）→ 不触发双 template 检测', () => {
    const content = `.root { width: 100%; }\n/* 一些注释 */\n`
    const result = stripLlmTailGarbage('resources/styles/common.less', content)
    expect(result.stripped).toBe(false)
  })

  it('空内容 → 不崩溃', () => {
    const result = stripLlmTailGarbage('package/index.vue', '')
    expect(result.stripped).toBe(false)
    expect(result.content).toBe('')
  })

  it('只有 template 没有 script/style → 单 template 不截断', () => {
    const content = `<template>\n  <div>simple</div>\n</template>\n`
    const result = stripLlmTailGarbage('package/index.vue', content)
    expect(result.stripped).toBe(false)
  })
})
