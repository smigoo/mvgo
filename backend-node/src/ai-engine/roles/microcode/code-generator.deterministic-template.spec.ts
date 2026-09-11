import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：下列模块内部使用 import.meta，jest CJS 模式下直接 import 会加载失败。
// 与 code-generator.parse-failure.spec.ts 同款替身，避免触发 import.meta 解析错误。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

import { buildDeterministicIndexTemplate } from './code-generator.js'
import { pruneDeadSubComponentImports } from './resource-mounter.js'

// 模拟 planner 的 effectiveSections（device-monitor 实锤：header + switch + tabs + section-main）
function makeInput(sections: any, componentName = 'device-monitor') {
  return {
    componentName,
    panelType: 'default-panel',
    subComponentPlan: { effectiveSections: sections, isForced: true },
  }
}

const deviceSections = [
  { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
  { id: '89:38', type: 'switch', responsibility: 'switch（请按功能拆分）' },
  { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
  { id: 'section-main', type: 'body', responsibility: '主内容区' },
]

describe('层① 确定性 index.vue 模板装配', () => {
  test('有计划子组件 → 返回确定性模板（base-panel + header 插槽 + 子组件标签）', () => {
    const facts = buildDeterministicIndexTemplate(makeInput(deviceSections))
    expect(facts).not.toBeNull()
    const tpl = facts!.template
    expect(tpl).toContain('<base-panel panelKey="default-panel">')
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<HeaderSection />')
    expect(tpl).toContain('<SwitchSection />')
    expect(tpl).toContain('<TabsSection />')
    expect(tpl).toContain('<MainSection />')
    expect(tpl).toContain('class="c-device-monitor-slot-con"')
    expect(tpl.indexOf('<SwitchSection />')).toBeLessThan(tpl.indexOf('<TabsSection />'))
    expect(tpl.indexOf('<TabsSection />')).toBeLessThan(tpl.indexOf('<MainSection />'))
    // 🛡️ R1-2：facts 单一事实源（rootContainerClass + sectionRoots）
    expect(facts!.rootContainerClass).toBe('c-device-monitor-slot-con')
    expect(facts!.sectionRoots.map((s) => s.component)).toEqual([
      'HeaderSection', 'SwitchSection', 'TabsSection', 'MainSection',
    ])
  })

  test('同名 type 去重：第二个 body 类 section 加序号', () => {
    const secs = [
      { id: 'a', type: 'body', responsibility: '主内容区' },
      { id: 'b', type: 'body', responsibility: '副内容区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    const tpl = facts!.template
    expect(tpl).toContain('<MainSection />')
    expect(tpl).toContain('<MainSection2 />')
  })

  test('无计划子组件 → 返回 null（回退 LLM 生成）', () => {
    expect(buildDeterministicIndexTemplate(makeInput([]))).toBeNull()
    expect(buildDeterministicIndexTemplate({ componentName: 'x', subComponentPlan: null } as any)).toBeNull()
  })

  test('无 header section → 不生成 header 插槽', () => {
    const secs = [{ id: '89:37', type: 'tabs', responsibility: '标签页' }]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    const tpl = facts!.template
    expect(tpl).not.toContain('#header-right')
    expect(tpl).toContain('<TabsSection />')
  })
})

describe('层① pruneDeadSubComponentImports（删死 import）', () => {
  test('删除模板未引用的 ./components/X.vue import', () => {
    const content = `<template><div class="x"><TabsSection /></div></template>
<script setup>
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
import { ref } from 'vue'
const x = ref(0)
</script>`
    const out = pruneDeadSubComponentImports(content)
    expect(out).toContain("import TabsSection from './components/TabsSection.vue'")
    expect(out).not.toContain("import MainSection from './components/MainSection.vue'")
    expect(out).toContain("import { ref } from 'vue'")
  })

  test('保留 :is="X" 动态引用的子组件 import', () => {
    const content = `<template><component :is="DynamicComp" /></template>
<script setup>
import DynamicComp from './components/DynamicComp.vue'
</script>`
    const out = pruneDeadSubComponentImports(content)
    expect(out).toContain("import DynamicComp from './components/DynamicComp.vue'")
  })

  test('无死 import 时原样返回', () => {
    const content = `<template><div><TabsSection /></div></template>
<script setup>
import TabsSection from './components/TabsSection.vue'
</script>`
    expect(pruneDeadSubComponentImports(content)).toBe(content)
  })
})
