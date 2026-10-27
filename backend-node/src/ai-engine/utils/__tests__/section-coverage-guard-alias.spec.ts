/**
 * 🛡️ 刀 9（2026-10-27 · mc-max-1793096943263-6c77f76f 实锤）：`@/` 别名 .vue import 治本。
 *
 * 事故链：LLM 在 index.vue 写 `import BasePanel from '@/components/base-panel.vue'`
 *   ⇒ 文件从未生成（宿主全局组件，不该 import）⇒ 预览 404 load-error（RUNTIME-004/007/010）
 *   ⇒ 旧识别正则字符类不含 `@` ⇒ detect 不报、strip 不剥 = 全链盲区。
 *
 * 修复口径：
 *   ① 识别正则 detect/strip 同一处放行 `@/` 前缀（判据同构单一来源）；
 *   ② `resolveSpecifierToPath` 对 `@/` 从 **package 根**解析（非 fromFile 目录）；
 *   ③ 宿主外壳（base-panel/mc-panel，HOST_SHELL_TAG_RE 唯一事实源）只删 import/声明，
 *      **绝不删模板标签**（删标签 = `<base-panel>` 外壳整棵拔掉）。
 */
import { describe, it, expect } from '@jest/globals'
// @ts-ignore js 模块无类型声明
import {
  stripDanglingComponentRefs,
  detectDanglingComponentRefs,
  resolveSpecifierToPath,
// @ts-ignore
} from '../section-coverage-guard.js'

const IDX_HEAD = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-root"><HeaderText /></div>
  </base-panel>
</template>
<script setup>
`

describe('刀 9 @/ 别名 import', () => {
  it('阳性（实锤复刻）：@/components/base-panel.vue 悬空 ⇒ 删 import 行、保留 <base-panel> 外壳标签', () => {
    const files = {
      'package/index.vue': `${IDX_HEAD}import BasePanel from '@/components/base-panel.vue'
import HeaderText from './components/HeaderText.vue'
</script>`,
      'package/components/HeaderText.vue': `<template><div>头</div></template>`,
    }
    const { files: out, stripped } = stripDanglingComponentRefs(files, undefined, false)
    expect(stripped).toHaveLength(1)
    expect(stripped[0].refs).toContain('base-panel')
    const idx = out['package/index.vue']
    expect(idx).not.toContain('base-panel.vue')
    expect(idx).toContain('<base-panel panelKey="default-panel">')
    expect(idx).toContain('</base-panel>')
    // 正常兄弟 import 不动
    expect(idx).toContain(`import HeaderText from './components/HeaderText.vue'`)
  })

  it('阳性：detect 也能报出 @/ 悬空引用（detect/strip 判据同构）', () => {
    const files = {
      'package/index.vue': `${IDX_HEAD}import BasePanel from '@/components/base-panel.vue'
</script>`,
    }
    const hits = detectDanglingComponentRefs(files)
    expect(hits).toHaveLength(1)
    expect(hits[0].ref).toBe('components/base-panel') // ref 剥前缀（与 ./ 口径一致）
  })

  it('反向：@/ 指向**存在**的文件 ⇒ 不剥（别名从 package 根解析，含子组件深路径）', () => {
    const files = {
      'package/index.vue': `${IDX_HEAD}import HeaderText from '@/components/HeaderText.vue'
</script>`,
      'package/components/HeaderText.vue': `<template><div>头</div></template>`,
      'package/components/Sub.vue': `<template><HeaderText /></template>
<script setup>
import HeaderText from '@/components/HeaderText.vue'
</script>`,
    }
    const { files: out, stripped } = stripDanglingComponentRefs(files, undefined, false)
    expect(stripped).toHaveLength(0)
    expect(out).toEqual(files) // 内容零变化（引用相等是包装层 pruneDanglingSubComponentImports 的契约）
    expect(detectDanglingComponentRefs(files)).toHaveLength(0)
  })

  it('阳性：@/ 悬空**非外壳**组件 ⇒ import 与模板标签一并剥除', () => {
    const files = {
      'package/index.vue': `<template><div><GhostCard /></div></template>
<script setup>
import GhostCard from '@/components/GhostCard.vue'
</script>`,
    }
    const { files: out, stripped } = stripDanglingComponentRefs(files, undefined, false)
    expect(stripped).toHaveLength(1)
    expect(out['package/index.vue']).not.toContain('GhostCard')
  })

  it('反向：mc-panel 变体同属宿主外壳 ⇒ 保标签', () => {
    const files = {
      'package/index.vue': `<template><mc-panel-aio panelKey="aio"><div /></mc-panel-aio></template>
<script setup>
import McPanelAio from '@/components/mc-panel-aio.vue'
</script>`,
    }
    const { files: out } = stripDanglingComponentRefs(files, undefined, false)
    expect(out['package/index.vue']).toContain('<mc-panel-aio panelKey="aio">')
    expect(out['package/index.vue']).not.toContain('mc-panel-aio.vue')
  })

  it('回归：相对路径 ./ 行为不变（悬空照删 import+标签）', () => {
    const files = {
      'package/index.vue': `<template><div><Ghost /></div></template>
<script setup>
import Ghost from './components/Ghost.vue'
</script>`,
    }
    const { files: out, stripped } = stripDanglingComponentRefs(files, undefined, false)
    expect(stripped).toHaveLength(1)
    expect(out['package/index.vue']).not.toContain('Ghost')
  })

  it('resolveSpecifierToPath：@/ 从 package 根解析（双候选）', () => {
    const present = new Set(['package/index.vue', 'package/components/HeaderText.vue'])
    expect(
      resolveSpecifierToPath('package/components/Sub.vue', '@/components/HeaderText.vue', present),
    ).toBe('package/components/HeaderText.vue')
    expect(
      resolveSpecifierToPath('package/index.vue', '@/components/Miss.vue', present),
    ).toBe('package/components/Miss.vue') // 未命中 ⇒ 期望路径供判悬空
  })
})
