/**
 * T05: class 命名规范验证测试
 * 验证 CODE-003 校验器（2026-11-13 新范式）：common.less 顶层必须是带前缀根类块，内层 LESS 嵌套短名合法
 * 
 * 注意：CodeStructureValidator.validate 会同时检查 CODE-001/002（style 块要求），
 * 测试时需要提供完整的 .vue 文件避免误报 BLOCK
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'

// 完整的 .vue 文件模板（包含 style 块和 @import）
const validVueFile = `<template>
  <div class="c-monitor-root">
    <div class="c-monitor-header">头部</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
}
.c-monitor-header {
  height: 60px;
}
</style>`

test('T05-A: 符合规范的 class 通过校验', () => {
  const generatedFiles = [
    {
      path: 'package/index.vue',
      content: validVueFile,
    },
    {
      path: 'resources/styles/common.less',
      content: `
.c-monitor-test-root {
  width: 100%;
}
.c-monitor-test-header {
  height: 60px;
}
`,
    },
  ]
  
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  
  // 不应报 CODE-003
  const code003 = result.issues.find(i => i.id === 'CODE-003')
  assert.ok(!code003, `符合规范的 class 不应报 CODE-003, 实际 issues: ${JSON.stringify(result.issues)}`)
})

test('T05-B: 不符合规范的 class 报 CODE-003', () => {
  const generatedFiles = [
    {
      path: 'package/index.vue',
      content: validVueFile,
    },
    {
      path: 'resources/styles/common.less',
      content: `
.vehicle-type-wrap {
  width: 100%;
}
.tunnel-chart {
  height: 300px;
}
`,
    },
  ]
  
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  
  // 应报 CODE-003（WARN 级别）
  const code003 = result.issues.find(i => i.id === 'CODE-003')
  assert.ok(code003, '不符合规范的 class 应报 CODE-003')
  assert.ok(
    code003.message.includes('2 个 class'),
    `应检测到 2 个违规 class，实际: ${code003.message}`
  )
})

test('T05-C: 混合情况只报违规部分', () => {
  const generatedFiles = [
    {
      path: 'package/index.vue',
      content: validVueFile,
    },
    {
      path: 'resources/styles/common.less',
      content: `
.c-monitor-test-root {
  width: 100%;
}
.invalid-class {
  height: 60px;
}
.c-monitor-test-header {
  padding: 10px;
}
`,
    },
  ]
  
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  
  const code003 = result.issues.find(i => i.id === 'CODE-003')
  assert.ok(code003, '混合情况应报 CODE-003')
  assert.ok(
    code003.message.includes('1 个 class'),
    `应只检测到 1 个违规 class，实际: ${code003.message}`
  )
})

test('T05-D: 无 common.less 文件不报 CODE-003', () => {
  const generatedFiles = [
    {
      path: 'package/index.vue',
      content: validVueFile,
    },
  ]
  
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  
  const code003 = result.issues.find(i => i.id === 'CODE-003')
  assert.ok(!code003, '无 common.less 文件不应报 CODE-003')
})

test('T05-E: componentId 为空时放宽为 c- 前缀检查', () => {
  const generatedFiles = [
    {
      path: 'package/index.vue',
      content: validVueFile,
    },
    {
      path: 'resources/styles/common.less',
      content: `
.c-env-monitor-root {
  width: 100%;
}
.invalid-class {
  height: 60px;
}
`,
    },
  ]
  
  // componentId 为空
  const result = CodeStructureValidator.validate(generatedFiles, '')
  
  const code003 = result.issues.find(i => i.id === 'CODE-003')
  assert.ok(code003, 'componentId 为空时应放宽为 c- 前缀检查')
  assert.ok(
    code003.message.includes('1 个 class'),
    `应检测到 1 个违规 class，实际: ${code003.message}`
  )
})


// ── 2026-11-13 新范式补充用例 ──
test('T05-F: 根类嵌套 + 内层短名 ⇒ 不报 CODE-003', () => {
  const generatedFiles = [
    { path: 'package/index.vue', content: validVueFile },
    {
      path: 'resources/styles/common.less',
      content: `
.c-monitor-test-root {
  .header { color: red; }
  .stats-item { padding: 12px; &.active { color: blue; } }
}
`,
    },
  ]
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  assert.ok(!result.issues.find(i => i.id === 'CODE-003'), `根类嵌套不应报 CODE-003: ${JSON.stringify(result.issues)}`)
})

test('T05-G: 顶层 .dark 主题包裹 ⇒ 报 CODE-003（宿主不加主题类）', () => {
  const generatedFiles = [
    { path: 'package/index.vue', content: validVueFile },
    {
      path: 'resources/styles/common.less',
      content: `
.dark {
  .c-monitor-test-root { color: red; }
}
`,
    },
  ]
  const result = CodeStructureValidator.validate(generatedFiles, 'c-monitor-test')
  assert.ok(result.issues.find(i => i.id === 'CODE-003'), '顶层主题包裹应报 CODE-003')
})
