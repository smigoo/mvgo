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

import { buildDeterministicIndexTemplate, applyDeterministicIndexTemplate, stripUnplannedSubComponentImports, containChartRefInsidePanel, flexItemStyleFromWidths, flexItemStyleFromHeights, resolveSectionFlexSize } from './code-generator.js'
import { indexFigmaNodes } from '../../utils/section-tree.js'
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
    // 🛡️ P5（2026-09-17）：叶子子组件标签内联传导样式（flex:1;min-height:0）
    expect(tpl).toContain('<SwitchSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<TabsSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<MainSection style="flex:1;min-height:0;" />')
    expect(tpl).toContain('class="c-device-monitor-slot-con" style="display:flex;flex-direction:column;"')
    expect(tpl.indexOf('<SwitchSection')).toBeLessThan(tpl.indexOf('<TabsSection'))
    expect(tpl.indexOf('<TabsSection')).toBeLessThan(tpl.indexOf('<MainSection'))
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
    expect(tpl).toContain('<MainA style="flex:1;min-height:0;" />')
    expect(tpl).toContain('<MainB style="flex:1;min-height:0;" />')
    expect(tpl).not.toContain('<MainSection2 />') // 不再产出裸序号
  })

  test('水平 flex 子项按 Figma 宽度比例分配，tabs 46 / cons 367 不能均分', () => {
    // 🛡️ P6 wrapper 容器化合并（2026-09-17）：helper 只输出比例 + min 约束，
    //   display:flex 随 wrapper 消失，由目标元素（容器/子组件根）自身承载。
    expect(flexItemStyleFromWidths([46, 367], 0)).toBe('flex:0.111;min-width:0;')
    expect(flexItemStyleFromWidths([46, 367], 1)).toBe('flex:0.889;min-width:0;')
    expect(flexItemStyleFromWidths([0, 0], 0)).toBe('flex:1;min-width:0;')
    expect(flexItemStyleFromHeights([32, 207], 0)).toBe('flex:0.134;min-height:0;')
    expect(flexItemStyleFromHeights([0, 0], 0)).toBe('flex:1;min-height:0;')
    const secs = [{
      id: '89:40',
      name: 'slot-con',
      isLayoutContainer: true,
      layout: 'vertical',
      children: [{
        id: '89:37',
        name: '@antd/tab',
        isLayoutContainer: true,
        layout: 'horizontal',
        children: [
          { id: '89:39', type: 'tabs', title: 'tabs', absoluteBoundingBox: { width: 46, height: 317 } },
          { id: '2:8437', type: 'body', title: 'cons', absoluteBoundingBox: { width: 367, height: 295 } },
        ],
      }],
    }]
    const tpl = buildDeterministicIndexTemplate(makeInput(secs))!.template
    // P6：比例直接内联到子组件标签（无 wrapper 中转）
    expect(tpl).toContain('<TabsSection style="flex:0.111;min-width:0;" />')
    expect(tpl).toContain('<MainSection style="flex:0.889;min-width:0;" />')
    // P6：不再产出任何纯比例空壳 wrapper div
    expect(tpl).not.toContain('<div style="flex:')
    expect(tpl).not.toMatch(/antd-tab-con[\s\S]*flex:1;min-width:0;[\s\S]*flex:1;min-width:0;/)
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
    expect(tpl).toContain('<TabsSection style="flex:1;min-height:0;" />')
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
    expect(bodyPart).not.toContain('<TabsSection')
    // 统计卡叶子仍在 body
    expect(bodyPart).toContain('<StatsSection')
  })

  test('刀 5c：无 headerSlots 契约 → 回退 type==="header" 二分（旧行为零回归）', () => {
    const secs = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
      { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(secs))
    expect(facts!.template).toContain('<HeaderSection />')
    expect(facts!.template).toContain('<TabsSection style="flex:1;min-height:0;" />')
  })

  test('E1 治本：容器嵌套保留（switch/@antd-tab 生成 wrapper div，不拍平叶子）', () => {
    // device-monitor 实锤：con 容器下 switch（active/default）+ @antd/tab（tabs/cons），
    // 旧实现拍平叶子导致 switch 与 tab 全部平级 flex（用户指正「switch 没组成一个元素」）。
    const tree = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区' },
      {
        id: '89:40', type: 'container', name: 'con', isLayoutContainer: true,
        responsibility: '纵向布局容器',
        // 🛡️ 2026-09-30 P0-1：容器**必须携带显式 layout**（真实管线里 E1 恒从 A 类事实写入；
        //   字段缺失 = 「无事实」⇒ 写产物层按四分支**不内联方向**）。此处显式声明 vertical，
        //   保持本用例原意（验证 P6 wrapper 合并 + 容器 div 吃父比例）。
        layout: 'vertical',
        children: [
          {
            id: '89:38', type: 'container', name: 'switch', isLayoutContainer: true,
            responsibility: '纵向布局容器',
            layout: 'vertical',
            children: [
              { id: '2:8787', type: 'content', name: 'active', responsibility: 'active' },
              { id: '2:8806', type: 'content', name: 'default', responsibility: 'default' },
            ],
          },
          {
            id: '89:37', type: 'container', name: '@antd/tab', isLayoutContainer: true,
            responsibility: '纵向布局容器',
            layout: 'vertical',
            children: [
              { id: '89:39', type: 'tabs', responsibility: '标签页切换区' },
              { id: '2:8437', type: 'content', name: 'cons', responsibility: 'cons' },
            ],
          },
        ],
      },
    ]
    const facts = buildDeterministicIndexTemplate(makeInput(tree))
    const tpl = facts!.template
    // header 进插槽
    expect(tpl).toContain('<template #header-right>')
    expect(tpl).toContain('<HeaderSection />')
    // 容器生成 wrapper div，子叶子归属正确
    expect(tpl).toContain('c-device-monitor-switch-con')
    expect(tpl).toContain('c-device-monitor-antd-tab-con')
    // 结构顺序：switch 容器在 active/default 之前，active/default 在 antd-tab 容器之前，
    // tabs 在 antd-tab 容器之后（验证容器包裹关系，不拍平）
    const switchIdx = tpl.indexOf('c-device-monitor-switch-con')
    const tabIdx = tpl.indexOf('c-device-monitor-antd-tab-con')
    const tabsIdx = tpl.indexOf('<TabsSection')
    expect(switchIdx).toBeGreaterThan(-1)
    expect(tabIdx).toBeGreaterThan(-1)
    expect(switchIdx).toBeLessThan(tabIdx)
    expect(tabIdx).toBeLessThan(tabsIdx)
    // 🛡️ P6 wrapper 容器化合并：容器 div 直接吃父比例（本例 con-con 无父分配 → flex:1;min-height:0）
    //   + 对子方向（本例两个容器显式 layout='vertical' → column）；
    //   无任何纯比例空壳 wrapper。
    expect(tpl).toContain('c-device-monitor-switch-con" data-section-id="89:38" style="flex:1;min-height:0;display:flex;flex-direction:column;"')
    expect(tpl).toContain('c-device-monitor-antd-tab-con" data-section-id="89:37" style="flex:1;min-height:0;display:flex;flex-direction:column;"')
    // P6：模板中不再有 wrapper 空壳 div（纯 style 无 class 的 div）
    expect(tpl).not.toContain('<div style="flex:')
    // switch 容器的闭合 div 必须在 antd-tab 容器开始之后（两个容器互不嵌套、平级包裹各自叶子）
    expect(tpl.indexOf('</div>', switchIdx)).toBeLessThan(tabIdx)
  })

  /**
   * 🛡️ 2026-09-30 复审 P0-1：`section.layout` 取值域扩到 {horizontal, vertical, grid, null} 后，
   *   容器写产物层（`code-generator.js:649`）必须是**四分支**，不能再是二值三元
   *   （旧口径把 `grid`/`null` 一律内联成 `flex-direction:column`，内联优先级压过 class 规则）。
   */
  describe('P0-1 容器四分支（grid / null 不再退化成 column）', () => {
    const containerWith = (layout: unknown, extra: Record<string, unknown> = {}) => [
      {
        id: 'c1',
        type: 'container',
        name: 'wrap',
        isLayoutContainer: true,
        responsibility: '容器',
        layout,
        ...extra,
        children: [{ id: 'k1', type: 'content', name: 'main', responsibility: 'main' }],
      },
    ]
    // ⚠️ 断言必须精确到**容器 div 自身的 style 属性**：模板里 `slot-con` 本身恒含
    //    `display:flex;flex-direction:column`，用全局 not.toContain 会误判。
    const wrapStyle = (layout: unknown, extra?: Record<string, unknown>) => {
      const tpl = buildDeterministicIndexTemplate(makeInput(containerWith(layout, extra)))!.template
      const m = tpl.match(/c-device-monitor-wrap-con" data-section-id="c1" style="([^"]*)"/)
      expect(m).not.toBeNull()
      return m![1]
    }

    test('horizontal → display:flex;flex-direction:row + align-items:stretch', () => {
      const s = wrapStyle('horizontal')
      expect(s).toContain('display:flex;flex-direction:row;')
      expect(s).toContain('align-items:stretch;')
    })

    test('vertical → display:flex;flex-direction:column（无 align-items）', () => {
      const s = wrapStyle('vertical')
      expect(s).toContain('display:flex;flex-direction:column;')
      expect(s).not.toContain('align-items:stretch')
    })

    test('⭐ grid + gridColumns → display:grid + repeat(N,1fr)（旧口径会写成 column）', () => {
      const s = wrapStyle('grid', { gridColumns: 3 })
      expect(s).toContain('display:grid;grid-template-columns:repeat(3,1fr);')
      expect(s).not.toContain('flex-direction')
    })

    test('grid 无列数 → 只写 display:grid，不臆造列数', () => {
      const s = wrapStyle('grid')
      expect(s).toContain('display:grid;')
      expect(s).not.toContain('grid-template-columns')
      expect(s).not.toContain('flex-direction')
    })

    test('⭐ layout = null（无事实）→ 不内联 display / 方向（交 common.less 与 2.11）', () => {
      const s = wrapStyle(null)
      expect(s).not.toContain('display:flex')
      expect(s).not.toContain('display:grid')
      expect(s).not.toContain('flex-direction')
      // flex 比例仍保留（它是父容器的 flex item，与自身 display 无关）
      expect(s).toContain('flex:1;min-height:0;')
    })

    test('布局取值未知（拼写错误串）→ 同样不臆造（等同无事实）', () => {
      const s = wrapStyle('HORIZONTAL ')
      expect(s).not.toContain('flex-direction')
      expect(s).not.toContain('display:')
    })
  })

  test('E1 治本：headerSlots 编造 id 匹配不到 → 回退 type=header 二分（header 不丢）', () => {
    // device-monitor 实锤：headerSlots 契约 figmaNodeId 是 vision 编造 id（8:3/8:4/8:5），
    // 真实 header 叶子 sourceNodeIds 是 2:8419 → 匹配不到 → header 整个丢失。
    const secs = [
      { id: '2:8419', type: 'header', responsibility: '顶部标题区', sourceNodeIds: ['2:8419'] },
      { id: '89:37', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const input = makeInput(secs)
    ;(input as any).headerSlots = [
      { slotType: 'header-right', elementType: 'statistic', figmaNodeId: '8:3' },
      { slotType: 'header-right', elementType: 'statistic', figmaNodeId: '8:4' },
    ]
    const facts = buildDeterministicIndexTemplate(input)
    expect(facts!.template).toContain('<template #header-right>')
    expect(facts!.template).toContain('<HeaderSection />')
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

describe('E3-1 containChartRefInsidePanel（chartRef 容器位置收口，2026-09-16 12bc3750）', () => {
  test('⭐ chartRef 在 base-panel 外 → 移回 base-panel 内', () => {
    const input = [
      '<template>',
      '  <base-panel panelKey="default-panel">',
      '    <div class="c-x-slot-con">',
      '      <ListSection />',
      '    </div>',
      '  </base-panel>',
      '  <div ref="chartRef" class="c-x-chart" style="width:100%;height:100%"></div>',
      '</template>',
    ].join('\n')
    const out = containChartRefInsidePanel(input, {})
    expect(out.indexOf('ref="chartRef"')).toBeLessThan(out.indexOf('</base-panel>'))
  })

  test('chartRef 已在 base-panel 内 → 原样返回（零误伤）', () => {
    const input = '<template>\n  <base-panel>\n    <div class="slot-con">\n      <div ref="chartRef"></div>\n    </div>\n  </base-panel>\n</template>'
    expect(containChartRefInsidePanel(input, {})).toBe(input)
  })

  test('无 chartRef / 无 base-panel → 原样返回', () => {
    expect(containChartRefInsidePanel('<template><div>x</div></template>', {})).toBe('<template><div>x</div></template>')
    expect(containChartRefInsidePanel('', {})).toBe('')
  })
})

describe('resolveSectionFlexSize / 装配回查 Figma bbox（d70a19bf）', () => {
  test('树上无 bbox 时按 figmaNodeId / sourceNodeIds 回查宽度', () => {
    const figma = {
      document: {
        id: 'root', name: 'root', type: 'FRAME',
        children: [
          { id: '3:74', name: 'left', type: 'FRAME', absoluteBoundingBox: { x: 303, y: 2282, width: 220, height: 170 } },
          { id: '287:4', name: 'chart', type: 'FRAME', absoluteBoundingBox: { x: 561, y: 2267, width: 207, height: 207 } },
          { id: '3:110', name: 'right', type: 'FRAME', absoluteBoundingBox: { x: 806, y: 2282, width: 220, height: 170 } },
        ],
      },
    }
    const index = indexFigmaNodes(figma.document)
    expect(resolveSectionFlexSize({ id: '287:5-left', sourceNodeIds: ['3:74'] }, index, 'width')).toBe(220)
    expect(resolveSectionFlexSize({ id: '287:4', figmaNodeId: '287:4' }, index, 'width')).toBe(207)
    expect(resolveSectionFlexSize({ id: '287:5-right', sourceNodeIds: ['3:110'] }, index, 'width')).toBe(220)
  })

  test('planner 丢掉 bbox 时三栏按 220/207/220 分配，不回退 flex:1', () => {
    const sections = [
      {
        id: '287:6', type: 'container', isLayoutContainer: true, layout: 'horizontal',
        children: [
          { id: '287:5-left', type: 'stats', title: '统计数据-left', sourceNodeIds: ['3:74'] },
          { id: '287:4', type: 'chart', title: '中间图表', figmaNodeId: '287:4' },
          { id: '287:5-right', type: 'stats', title: '统计数据-right', sourceNodeIds: ['3:110'] },
        ],
      },
    ]
    const input = makeInput(sections, 'd70a19')
    ;(input as any).figmaNodeData = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [
          { id: '3:74', name: 'left', type: 'FRAME', absoluteBoundingBox: { x: 303, y: 2282, width: 220, height: 170 } },
          { id: '287:4', name: '中间图表', type: 'FRAME', absoluteBoundingBox: { x: 561, y: 2267, width: 207, height: 207 } },
          { id: '3:110', name: 'right', type: 'FRAME', absoluteBoundingBox: { x: 806, y: 2282, width: 220, height: 170 } },
        ],
      },
    }
    const tpl = buildDeterministicIndexTemplate(input)!.template
    expect(tpl).toContain('flex:0.340;min-width:0;')
    expect(tpl).toContain('flex:0.320;min-width:0;')
    expect(tpl.match(/flex:1;min-width:0;/g) || []).toHaveLength(0)
  })

  test('⭐ 多个「顶层」section 也按 Figma 高度分配比例，不再一律 flex:1（2026-09-28 afd08494 实锤）', () => {
    // 复刻 traffic 结构：slot-con 下三个顶层 section，设计高 556 / 142 / 174。
    // 旧实现 renderBodyNode(root, 0) 不传比例 → 顶层全走 flex:1 兜底 → 1/3 等分。
    const sections = [
      { id: '88:33', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: '88:34', type: 'content', title: '当日总流量' }] },
      { id: '2:3438', type: 'container', isLayoutContainer: true, layout: 'horizontal',
        children: [{ id: '2:3439', type: 'content', title: '车型分布' }] },
      { id: '83:30', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: '83:31', type: 'content', title: '流量预测' }] },
    ]
    const input = makeInput(sections, 'traffic-monitor')
    ;(input as any).figmaNodeData = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [
          { id: '88:33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 556 } },
          { id: '2:3438', name: 'slot-车型分布', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 556, width: 387, height: 142 } },
          { id: '83:30', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 698, width: 378, height: 174 } },
        ],
      },
    }
    const tpl = buildDeterministicIndexTemplate(input)!.template
    // 556:142:174 → 0.638 / 0.163 / 0.200（归一化 flex-grow）
    expect(tpl).toContain('flex:0.638;min-height:0;')
    expect(tpl).toContain('flex:0.163;min-height:0;')
    expect(tpl).toContain('flex:0.200;min-height:0;')
  })

  test('无高度事实时顶层多 section 行为不变（回落 flex:1，零回归）', () => {
    const sections = [
      { id: 'a', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: 'a1', type: 'content', title: '甲' }] },
      { id: 'b', type: 'container', isLayoutContainer: true, layout: 'vertical',
        children: [{ id: 'b1', type: 'content', title: '乙' }] },
    ]
    const tpl = buildDeterministicIndexTemplate(makeInput(sections, 'no-height'))!.template
    expect(tpl).toContain('flex:1;min-height:0;')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ B（#719 主线 · 2026-09-26 · mc-max-1790420477334-6e065bd7 实锤）
// applyDeterministicIndexTemplate：simple/medium 分支的 index.vue 由 LLM 整文件产出，
// 绕过确定性装配 → 模板子元素顺序与 effectiveSections 脱钩（实锤 chart 被提到 tabs 之前）。
// 治本契约：保留 LLM 的 <script>，仅覆盖 <template> 段。
// ══════════════════════════════════════════════════════════════════════════
describe('#719 B · applyDeterministicIndexTemplate（装配与填值分离）', () => {
  // 复刻 env-monitor 真实结构：89:41 > 89:42[tab 列表] + 2:7898[图表内容]，另挂 chart 叶子
  const envPlan = () => ({
    isForced: true,
    minFiles: 8,
    effectiveSections: [
      {
        id: '89:41', title: 'con', type: 'container', isLayoutContainer: true,
        layout: 'vertical', elementCount: 49,
        children: [
          {
            id: '89:42', title: 'sub-t', type: 'container', isLayoutContainer: true,
            layout: 'horizontal', elementCount: 14,
            children: [
              { id: '2:7889', title: 'tabs-list', type: 'tabs', elementCount: 6 },
              { id: '89:43', title: 'tab-panel', type: 'tabs', elementCount: 20 },
            ],
          },
          {
            id: '2:7898', title: 'echarts-line', type: 'container', isLayoutContainer: true,
            layout: 'horizontal', elementCount: 10,
            children: [{ id: '2:7899', title: 'chart-body', type: 'content', elementCount: 8 }],
          },
        ],
      },
      { id: 'chart-2:7898', title: 'chart', type: 'chart', elementCount: 5 },
    ],
  })

  // LLM 整文件产物：chart 写在 tabs 之前（正是实锤的顺序错位形态）
  const llmIndexVue = () => `<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-slot-con">
        <EnvMonitorChart class="c-env-monitor-chart-section" />
        <EnvMonitorTabs class="c-env-monitor-tabs-section" />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import EnvMonitorChart from './components/EnvMonitorChart.vue'
import EnvMonitorTabs from './components/EnvMonitorTabs.vue'
const switchSelected = ref('active')
</script>`

  const mkInput = (p: any) => ({
    componentName: 'env-monitor',
    panelType: 'default-panel',
    subComponentPlan: p,
  })

  it('有 effectiveSections → <template> 段被确定性骨架覆盖，顺序 = facts 顺序，script 原样保留', () => {
    const r = applyDeterministicIndexTemplate(llmIndexVue(), mkInput(envPlan()), {})
    expect(r.applied).toBe(true)
    expect(r.facts?.source).toBe('deterministic-template')

    const out = r.content
    const tpl = out.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)?.[1] || ''

    // ① 装配收回：LLM 自拟的模板标签与内容根不复存在
    expect(tpl).not.toContain('EnvMonitorChart')
    expect(tpl).not.toContain('c-env-monitor-root')
    expect(tpl).toContain('c-env-monitor-slot-con')
    expect(tpl).toContain('data-section-id="89:42"')

    // ② 顺序 = effectiveSections 顺序：tabs 区必须在图表区之前
    const tabsAt = tpl.indexOf('data-section-id="89:42"')
    const chartAt = tpl.indexOf('data-section-id="2:7898"')
    expect(tabsAt).toBeGreaterThanOrEqual(0)
    expect(chartAt).toBeGreaterThan(tabsAt)

    // ③ 填值保留：LLM script 内容不被改写
    expect(out).toContain('const switchSelected = ref(')

    // ④ import 与新模板对齐：模型自拟的子组件 import 变死 → 被裁剪
    expect(out).not.toContain("import EnvMonitorChart from './components/EnvMonitorChart.vue'")
    expect(out).not.toContain("import EnvMonitorTabs from './components/EnvMonitorTabs.vue'")
  })

  it('无 plan（effectiveSections 空）→ 原样返回 + reason，不 fail-closed', () => {
    const src = llmIndexVue()
    const r = applyDeterministicIndexTemplate(src, mkInput({ isForced: false, effectiveSections: [] }), {})
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('no-plan-sections')
    expect(r.content).toBe(src)
  })

  it('空内容 / 无 <template> 段 → 原样返回', () => {
    expect(applyDeterministicIndexTemplate('', mkInput(envPlan()), {}).reason).toBe('empty-content')
    const r = applyDeterministicIndexTemplate('<script setup>const a=1</script>', mkInput(envPlan()), {})
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('no-template-block')
  })
})
