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

import { buildDeterministicIndexTemplate, stripUnplannedSubComponentImports } from './code-generator.js'
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
    // 🛡️ 推 A：确定性子组件文件集（index 层「引用谁」唯一事实源）
    expect(facts!.componentFiles.sort()).toEqual([
      'HeaderSection', 'MainSection', 'SwitchSection', 'TabsSection',
    ])
  })

  test('同 type 多 section：去重改为语义后缀（替代裸序号 2/3）', () => {
    // 2026-09-14 命名治本：同类型多 section 不再用 ContentSection2/MainSection2 这类裸序号，
    // 而按 section.id/title 派生确定性 PascalCase 后缀（Main + id 段 → MainA/MainB）。
    const secs = [
      { id: 'a', type: 'body', responsibility: '主内容区' },
      { id: 'b', type: 'body', responsibility: '副内容区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    const tpl = facts!.template
    expect(tpl).toContain('<MainA />')
    expect(tpl).toContain('<MainB />')
    expect(tpl).not.toContain('<MainSection2 />') // 不再产出裸序号
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

  test('刀 5c：headerSlots 契约 figmaNodeId 匹配 sourceNodeIds → tabs 进 header-right，body 不重复', () => {
    // vehicle 实锤：tabs（标题行控件）与内容区「小标题」都进过 header/body 双轨。
    // 治本：header-right 只消费 headerSlots 契约命中的 node；body 排除同 node（只落一次）。
    const secs = [
      { id: '2:7954', type: 'tabs', responsibility: '标签页切换区', sourceNodeIds: ['2:7954'] },
      { id: '2:7959', type: 'content', responsibility: '小标题', sourceNodeIds: ['2:7959'] },
      { id: 'section-cards', type: 'stats', responsibility: '统计卡片区', sourceNodeIds: ['2:8023'] },
    ]
    const input = makeInput(secs)
    ;(input as any).headerSlots = [
      { slotType: 'header-right', elementType: 'tab', figmaNodeId: '2:7954', content: '危化/重型/超高' },
    ]
    const facts = buildDeterministicIndexTemplate(input)
    const tpl = facts!.template
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<TabsSection />')
    // 核心：body（slot-con 之后）不再出现 TabsSection（同 figmaNodeId 只落一次，杜绝双轨）
    const slotConIdx = tpl.indexOf('slot-con')
    const bodyPart = tpl.slice(slotConIdx)
    expect(bodyPart).not.toContain('<TabsSection />')
    // 统计卡叶子仍在 body
    expect(bodyPart).toContain('<StatsSection />')
  })

  test('刀 5c：无 headerSlots 契约 → 回退 type==="header" 二分（旧行为零回归）', () => {
    const secs = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
      { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    expect(facts!.template).toContain('<HeaderSection />')
    expect(facts!.template).toContain('<TabsSection />')
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

// ──────────────────────────────────────────────
// 🛡️ 推 A（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：索引层「引用谁」的确定性约束
// ──────────────────────────────────────────────
describe('stripUnplannedSubComponentImports（剥离未规划子组件 import）', () => {
  const CNT = (script: string) => `<template><div class="x"><ContentSection /></div></template>
<script setup>
${script}
</script>`

  test('规划外静态 import 被剥离，规划内保留（2290591b 形态）', () => {
    // 2290591b：规划只有 ContentSection，LLM 却 import 了未生成的 SubHeaderSection
    const content = CNT(`import ContentSection from './components/ContentSection.vue'
import SubHeaderSection from './components/SubHeaderSection.vue'`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).toContain("import ContentSection from './components/ContentSection.vue'")
    expect(out).not.toContain("import SubHeaderSection")
  })

  test('规划外 defineAsyncComponent 动态 import 表达式被消除', () => {
    const content = CNT(`const SubHeaderSection = defineAsyncComponent(() => import('./components/SubHeaderSection.vue'))`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).not.toContain("import('./components/SubHeaderSection.vue')")
    expect(out).toContain('SubHeaderSection') // 变量声明保留（仅去 import 表达式，不破坏语法链）
  })

  test('全部规划内 → 原样返回（零改动）', () => {
    const content = CNT(`import ContentSection from './components/ContentSection.vue'
import HeaderSection from './components/HeaderSection.vue'`)
    expect(stripUnplannedSubComponentImports(content, ['ContentSection', 'HeaderSection'])).toBe(content)
  })

  test('allowed 为空 → 不剥离（向后兼容无规划信息场景）', () => {
    const content = CNT(`import X from './components/X.vue'`)
    expect(stripUnplannedSubComponentImports(content, [])).toBe(content)
  })

  test('不触碰非 ./components/ 的 import（vue / 外部库保留）', () => {
    const content = CNT(`import { ref } from 'vue'
import ContentSection from './components/ContentSection.vue'`)
    const out = stripUnplannedSubComponentImports(content, ['ContentSection'])
    expect(out).toContain("import { ref } from 'vue'")
    expect(out).toBe(content)
  })

  test('空/畸形输入 fail-open 原样返回', () => {
    expect(stripUnplannedSubComponentImports('', ['A'])).toBe('')
    expect(stripUnplannedSubComponentImports(null as any, ['A'])).toBeNull()
  })
})
