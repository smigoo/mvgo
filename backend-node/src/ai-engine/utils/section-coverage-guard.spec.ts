import { detectMissingSections, detectUnmaterializedSections, ensureSectionAssembly, detectDanglingComponentRefs, stripDanglingComponentRefs } from './section-coverage-guard.js'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'

/**
 * COMP-001 回归测试：模块组装覆盖检测。
 *
 * 背景：2026-09-02 真实事故 mc-max-1788306635802-e7258c1f（流量监测）——
 * vision 88% 捕获 5 section、强制拆分 5 子组件、LLM 生成了 5 个子组件文件，
 * 但 index.vue 只内联 1 个 section（tunnel-flow-chart），其余 4 个零引用 →
 * 预览里 4/5 模块整块消失。既有机制（ensureSubComponentImport / pruneOrphan /
 * 各 CODE 规则）全部漏检。
 *
 * 反向样本 mc-max-1788306653919-a57e4409（设备监测）：3 个子组件全部被
 * index.vue 组装（import + template 引用），应 0 缺失放行。
 */

const plan = (sections: Array<Record<string, any>>, isForced = true) => ({
  effectiveSections: sections,
  isForced,
  minFiles: sections.length + 2,
  reason: '有效 sections≥3 → 强制拆分',
})

// 流量监测形态：5 section，index.vue 只内联 tunnel，4 个子组件文件孤儿
const FLOW_FILES = [
  {
    path: 'package/index.vue',
    content: `<template>
  <div class="c-monitor-tunnel-flow-chart">
    <span class="c-monitor-tunnel-title">江阴靖江长江隧道</span>
    <div ref="chartRef" class="c-monitor-tunnel-chart"></div>
  </div>
</template>
<script setup>
import * as echarts from 'echarts'
</script>
<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
  },
  { path: 'package/components/DailyTotal.vue', content: `<template><div>当日总流量</div></template>` },
  { path: 'package/components/BridgeFlowChart.vue', content: `<template><div>江阴大桥</div></template>` },
  { path: 'package/components/VehicleTypeDistribution.vue', content: `<template><div>车型分布</div></template>` },
  { path: 'package/components/FlowPrediction.vue', content: `<template><div>流量预测</div></template>` },
]

const FLOW_PLAN = plan([
  { id: 'daily-total', title: '当日总流量' },
  { id: 'tunnel-flow-chart', title: '江阴靖江长江隧道' },
  { id: 'bridge-flow-chart', title: '江阴大桥' },
  { id: 'vehicle-type-distribution', title: '车型分布' },
  { id: 'flow-prediction', title: '流量预测' },
])

// 设备监测形态：3 section，全部被 index.vue import + template 引用
const MONITOR_FILES = [
  {
    path: 'package/index.vue',
    content: `<template>
  <base-panel>
    <template #header_right><HeaderStats /></template>
    <div class="c-monitor-root">
      <LeftNav class="c-monitor-left-nav-wrapper" />
      <div class="c-monitor-main-content"><DeviceGrid /></div>
    </div>
  </base-panel>
</template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
import LeftNav from './components/LeftNav.vue'
</script>
<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
  },
  { path: 'package/components/HeaderStats.vue', content: `<template><div>设备类型</div></template>` },
  { path: 'package/components/DeviceGrid.vue', content: `<template><div>摄像机</div></template>` },
  { path: 'package/components/LeftNav.vue', content: `<template><div>监控</div></template>` },
]

const MONITOR_PLAN = plan([
  { id: 'header-stats', title: '头部统计' },
  { id: 'device-grid', title: '设备类型网格' },
  { id: 'left-nav', title: '左侧导航菜单' },
])

// 环境监测形态（mc-max-1788327432319-a6198738）：规划 section.id 与 LLM 实际
// 组件命名不一致（tab-tools vs TabsTools、concentration-trend-chart vs
// ConcentrationChart），信号1/2 双 miss，但 3 个子组件文件全部被组装（无孤儿）
const DRIFT_FILES = [
  {
    path: 'package/index.vue',
    content: `<template>
  <base-panel>
    <template #title_left><SectionHeader /></template>
    <div class="c-env-monitor-root">
      <TabsTools />
      <ConcentrationChart />
    </div>
  </base-panel>
</template>
<script setup>
import SectionHeader from './components/SectionHeader.vue'
import TabsTools from './components/TabsTools.vue'
import ConcentrationChart from './components/ConcentrationChart.vue'
</script>
<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
  },
  { path: 'package/components/SectionHeader.vue', content: `<template><div>环境监测</div></template>` },
  { path: 'package/components/TabsTools.vue', content: `<template><div>一氧化碳</div></template>` },
  { path: 'package/components/ConcentrationChart.vue', content: `<template><div>chart</div></template>` },
]

const DRIFT_PLAN = plan([
  { id: 'section-header', title: '标题栏' },
  { id: 'tab-tools', title: 'Tab切换与工具栏' },
  { id: 'concentration-trend-chart', title: '浓度趋势图表' },
])

describe('detectMissingSections 纯函数', () => {
  it('流量监测形态：index.vue 只内联 1 section → 检出 4 个缺失', () => {
    const missing = detectMissingSections(FLOW_FILES, FLOW_PLAN)
    expect(missing).toHaveLength(4)
    const titles = missing.map((m) => m.title)
    expect(titles).toContain('当日总流量')
    expect(titles).toContain('江阴大桥')
    expect(titles).toContain('车型分布')
    expect(titles).toContain('流量预测')
    // 内联的 tunnel（标题在 index.vue 模板）不应判缺失
    expect(titles).not.toContain('江阴靖江长江隧道')
  })

  it('设备监测形态：3 子组件全部被引用 → 0 缺失', () => {
    const missing = detectMissingSections(MONITOR_FILES, MONITOR_PLAN)
    expect(missing).toHaveLength(0)
  })

  it('非强制拆分（isForced=false）→ 不判定', () => {
    const missing = detectMissingSections(FLOW_FILES, plan(FLOW_PLAN.effectiveSections as any, false))
    expect(missing).toHaveLength(0)
  })

  it('单 section（<2）→ 不判定', () => {
    const missing = detectMissingSections(FLOW_FILES, plan([{ id: 'a', title: '甲' }]))
    expect(missing).toHaveLength(0)
  })

  it('componentPlan 缺失 → 不判定（fail-open）', () => {
    expect(detectMissingSections(FLOW_FILES, undefined as any)).toHaveLength(0)
    expect(detectMissingSections(FLOW_FILES, null as any)).toHaveLength(0)
  })

  it('index.vue 缺失 → 不判定（交由 EMPTY_ARTIFACT）', () => {
    const missing = detectMissingSections(
      [{ path: 'package/components/A.vue', content: '<template><div>a</div></template>' }],
      FLOW_PLAN,
    )
    expect(missing).toHaveLength(0)
  })

  it('命名漂移形态：组件名与 section.id 不一致但无孤儿文件 → 0 缺失（豁免不误报）', () => {
    const missing = detectMissingSections(DRIFT_FILES, DRIFT_PLAN)
    expect(missing).toHaveLength(0)
  })

  it('section- 前缀归一：section.id 带 section- 前缀 + 组件名不带 → 0 缺失（2026-09-03 误报实锤）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="root"><HeaderStats /><SummaryCards /></div></template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
</script>`,
      },
      {
        path: 'package/components/HeaderStats.vue',
        content: '<template><div>h</div></template>',
      },
      {
        path: 'package/components/SummaryCards.vue',
        content: '<template><div>s</div></template>',
      },
    ]
    const planWithPrefix = plan([
      { id: 'section-header-stats', title: '标题栏统计指标' },
      { id: 'section-summary-cards', title: '设备汇总卡片区' },
    ])
    const missing = detectMissingSections(files, planWithPrefix)
    expect(missing).toHaveLength(0)
  })

  it('命名漂移但存在孤儿文件 → 豁免不触发，仍按双信号判定', () => {
    // 3 文件 < 5 section：数量不覆盖 → 豁免不触发
    const missing = detectMissingSections(FLOW_FILES, FLOW_PLAN)
    expect(missing.length).toBeGreaterThan(0)
  })

  it('list/grid 折叠 section：DeviceGrid 内 v-for + itemCount=12 → 0 缺失', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <base-panel>
    <HeaderStats />
    <DeviceGrid />
  </base-panel>
</template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
</script>`,
      },
      { path: 'package/components/HeaderStats.vue', content: '<template><div>h</div></template>' },
      {
        path: 'package/components/DeviceGrid.vue',
        content: `<template>
  <div class="grid">
    <div v-for="card in devices" :key="card.id" class="card">{{ card.name }}</div>
  </div>
</template>
<script setup>
const devices = Array(12)
</script>`,
      },
    ]
    const listPlan = plan([
      { id: 'header-stats', title: '头部统计' },
      {
        id: 'device-grid',
        title: '设备卡片网格',
        type: 'grid',
        collapsed: true,
        renderHint: 'v-for',
        itemCount: 12,
        items: Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}` })),
      } as any,
    ])
    expect(detectMissingSections(files, listPlan)).toHaveLength(0)
  })

  it('list section 无 v-for 且无组件引用 → 仍缺失', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="root"><HeaderStats /></div>
</template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
</script>`,
      },
      { path: 'package/components/HeaderStats.vue', content: '<template><div>h</div></template>' },
    ]
    const listPlan = plan([
      { id: 'header-stats', title: '头部统计' },
      {
        id: 'device-grid',
        title: '设备卡片网格',
        type: 'grid',
        collapsed: true,
        renderHint: 'v-for',
        itemCount: 12,
      },
    ])
    const missing = detectMissingSections(files, listPlan)
    expect(missing.map((m) => m.id)).toContain('device-grid')
  })

  it('嵌套容器不计缺失：叶子全组装时 89:40 不进 missing', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="root">
    <HeaderStats />
    <div class="slot-con">
      <SwitchBar />
      <TabPanel />
    </div>
  </div>
</template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
import SwitchBar from './components/SwitchBar.vue'
import TabPanel from './components/TabPanel.vue'
</script>`,
      },
      { path: 'package/components/HeaderStats.vue', content: '<template><div>头部统计</div></template>' },
      { path: 'package/components/SwitchBar.vue', content: '<template><div>switch</div></template>' },
      { path: 'package/components/TabPanel.vue', content: '<template><div>tab</div></template>' },
    ]
    const nestedPlan = plan([
      { id: 'header-stats', title: '头部统计' },
      {
        id: '89:40',
        title: 'slot-con',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        children: [
          { id: '89:38', title: 'switch' },
          { id: '89:37', title: '@antd/tab' },
        ],
      },
    ])
    const missing = detectMissingSections(files, nestedPlan)
    expect(missing).toHaveLength(0)
    expect(missing.map((m) => m.id)).not.toContain('89:40')
  })

  it('嵌套容器下缺叶子仍报缺失，但不把容器当缺失模块', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="root"><HeaderStats /><SwitchBar /></div>
</template>
<script setup>
import HeaderStats from './components/HeaderStats.vue'
import SwitchBar from './components/SwitchBar.vue'
</script>`,
      },
      { path: 'package/components/HeaderStats.vue', content: '<template><div>头部统计</div></template>' },
      { path: 'package/components/SwitchBar.vue', content: '<template><div>switch</div></template>' },
    ]
    const nestedPlan = plan([
      { id: 'header-stats', title: '头部统计' },
      {
        id: '89:40',
        title: 'slot-con',
        isLayoutContainer: true,
        layoutSource: 'container-rebuild',
        children: [
          { id: '89:38', title: 'switch' },
          { id: '89:37', title: '@antd/tab' },
        ],
      },
    ])
    const missing = detectMissingSections(files, nestedPlan)
    expect(missing.map((m) => m.id)).toEqual(['89:37'])
    expect(missing.map((m) => m.id)).not.toContain('89:40')
  })
})

describe('COMP-001 L0-B 门禁集成', () => {
  it('流量监测形态 → COMP-001 BLOCK', () => {
    const res = CodeStructureValidator.validate(FLOW_FILES, 'c-monitor', {
      target: 'microcode',
      componentPlan: FLOW_PLAN,
    })
    const comp = res.issues.filter((i: any) => i.id === 'COMP-001')
    expect(comp).toHaveLength(1)
    expect(comp[0].severity).toBe('BLOCK')
    expect(comp[0].message).toContain('当日总流量')
    expect(comp[0].message).toContain('流量预测')
  })

  it('设备监测形态 → 无 COMP-001', () => {
    const res = CodeStructureValidator.validate(MONITOR_FILES, 'c-monitor', {
      target: 'microcode',
      componentPlan: MONITOR_PLAN,
    })
    const comp = res.issues.filter((i: any) => i.id === 'COMP-001')
    expect(comp).toHaveLength(0)
  })

  it('命名漂移形态 → 无 COMP-001（避免误报触发不必要的全量重试）', () => {
    const res = CodeStructureValidator.validate(DRIFT_FILES, 'c-env-monitor', {
      target: 'microcode',
      componentPlan: DRIFT_PLAN,
    })
    const comp = res.issues.filter((i: any) => i.id === 'COMP-001')
    expect(comp).toHaveLength(0)
  })

  it('vue3 目标 → 不启用 COMP-001', () => {
    const res = CodeStructureValidator.validate(FLOW_FILES, 'c-monitor', {
      target: 'vue3',
      componentPlan: FLOW_PLAN,
    })
    const comp = res.issues.filter((i: any) => i.id === 'COMP-001')
    expect(comp).toHaveLength(0)
  })

  it('未传 componentPlan → 不启用 COMP-001', () => {
    const res = CodeStructureValidator.validate(FLOW_FILES, 'c-monitor', {
      target: 'microcode',
    })
    const comp = res.issues.filter((i: any) => i.id === 'COMP-001')
    expect(comp).toHaveLength(0)
  })
})

describe('ensureSectionAssembly 自愈（COMP-001 前置）', () => {
  const filesObj = (arr: Array<{ path: string; content: string }>) =>
    Object.fromEntries(arr.map((f) => [f.path, f.content]))

  it('流量监测形态：注入 4 个缺失 section 的 import + 标签', () => {
    const out = ensureSectionAssembly(filesObj(FLOW_FILES), FLOW_PLAN)
    const idx = out['package/index.vue']
    // 注入 4 个 import
    for (const c of ['DailyTotal', 'BridgeFlowChart', 'VehicleTypeDistribution', 'FlowPrediction']) {
      expect(idx).toContain(`import ${c} from './components/${c}.vue'`)
      expect(idx).toContain(`<${c} />`)
    }
    // 已内联的 tunnel 不重复注入
    expect(idx).not.toContain("import TunnelFlowChart from './components/TunnelFlowChart.vue'")
  })

  it('设备监测形态：已全部组装 → 不注入（不误伤）', () => {
    const before = JSON.stringify(filesObj(MONITOR_FILES))
    const out = ensureSectionAssembly(filesObj(MONITOR_FILES), MONITOR_PLAN)
    expect(JSON.stringify(out)).toBe(before)
  })

  it('幂等：二次调用不再变化', () => {
    const once = ensureSectionAssembly(filesObj(FLOW_FILES), FLOW_PLAN)
    const twice = ensureSectionAssembly(once, FLOW_PLAN)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('自愈后 COMP-001 门禁放行（detectMissingSections 归零）', () => {
    const out = ensureSectionAssembly(filesObj(FLOW_FILES), FLOW_PLAN)
    const arr = Object.entries(out).map(([path, content]) => ({ path, content }))
    expect(detectMissingSections(arr, FLOW_PLAN)).toHaveLength(0)
  })
})

/**
 * 🛡️ 刀 13（2026-09-13）：命名单一事实源 + 未物化分离。
 *
 * 事故 mc-1789308308127-356073d1（设备监测）真实形态：
 *   componentPlan 4 个叶子（id 是噪声名、type 正确）——
 *     header(type=header) / switch(type=switch) / @antd/tab(type=tabs) / 主内容区(type=body)
 *   产物命名由层① `buildDeterministicIndexTemplate` → `assignSectionComponentNames` 决定：
 *     HeaderSection / SwitchSection / TabsSection / MainSection
 *   旧实现用 `kebabToPascal(section.id)` **自造**名字（Header / Switch / @antd/tab / 主内容区）
 *   → 3 个恒不命中 → index.vue 明明组装了全部 3 个存活子组件，仍报「未组装 3 个」
 *   → COMP-001 BLOCK ×3 轮不收敛（软失败发布，主内容区整块消失）。
 */
describe('刀 13 · COMP-001 命名单一事实源 / 未物化分离', () => {
  const NOISE_PLAN = plan([
    { id: 'header', type: 'header', title: '标题', responsibility: '标题栏' },
    { id: 'switch', type: 'switch', title: 'switch', responsibility: '状态切换' },
    { id: '@antd/tab', type: 'tabs', title: '@antd/tab', responsibility: '标签页切换区' },
    { id: '主内容区', type: 'body', title: '主内容区', responsibility: '主内容区' },
  ])

  const INDEX_VUE = {
    path: 'package/index.vue',
    content: `<template>
  <base-panel>
    <template #header-right><HeaderSection /></template>
    <div class="c-x-slot-con">
      <TabsSection />
      <MainSection />
    </div>
  </base-panel>
</template>
<script setup>
import HeaderSection from './components/HeaderSection.vue'
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
</script>`,
  }
  const COMP = (n: string) => ({ path: `package/components/${n}.vue`, content: `<template><div>${n}</div></template>` })

  it('🔴 噪声 section.id + 确定性命名产物 → 不得误报（旧版报 switch/@antd/tab/主内容区 3 个）', () => {
    // 复测产物真实形态：SwitchSection.vue 被 P1-4 隔离 → 只剩 3 个子组件；
    // index.vue 已组装 HeaderSection / TabsSection / MainSection
    const files = [INDEX_VUE, COMP('HeaderSection'), COMP('TabsSection'), COMP('MainSection')]
    const missing = detectMissingSections(files, NOISE_PLAN)
    // `@antd/tab`(type=tabs→TabsSection) 与 `主内容区`(type=body→MainSection) 均已组装 → 不再误报
    expect(missing.map((m) => m.id)).toEqual(['switch'])
  })

  it('未物化（组件文件不存在）→ hasFile=false，且可被 detectUnmaterializedSections 单独取出', () => {
    const files = [INDEX_VUE, COMP('HeaderSection'), COMP('TabsSection'), COMP('MainSection')]
    const missing = detectMissingSections(files, NOISE_PLAN)
    expect(missing[0].hasFile).toBe(false)
    expect(detectUnmaterializedSections(files, NOISE_PLAN)).toEqual([
      { id: 'switch', title: 'switch', expected: 'SwitchSection' },
    ])
  })

  it('有组件文件但未组装 → hasFile=true（可 BLOCK / 可确定性注入）', () => {
    const files = [
      INDEX_VUE,
      COMP('HeaderSection'),
      COMP('TabsSection'),
      COMP('MainSection'),
      COMP('SwitchSection'),
    ]
    const missing = detectMissingSections(files, NOISE_PLAN)
    expect(missing.map((m) => ({ id: m.id, hasFile: m.hasFile }))).toEqual([
      { id: 'switch', hasFile: true },
    ])
    expect(detectUnmaterializedSections(files, NOISE_PLAN)).toHaveLength(0)
  })

  it('ensureSectionAssembly 按确定性命中文件名注入（`switch` → SwitchSection.vue）', () => {
    const files = {
      'package/index.vue': INDEX_VUE.content,
      'package/components/HeaderSection.vue': '<template><div>h</div></template>',
      'package/components/TabsSection.vue': '<template><div>t</div></template>',
      'package/components/MainSection.vue': '<template><div>m</div></template>',
      'package/components/SwitchSection.vue': '<template><div>s</div></template>',
    }
    const out = ensureSectionAssembly(files, NOISE_PLAN)
    expect(out['package/index.vue']).toContain("import SwitchSection from './components/SwitchSection.vue'")
    expect(out['package/index.vue']).toContain('<SwitchSection />')
  })

  it('门禁：仅「未物化」时不再 BLOCK，只发 COMP-001-UNMATERIALIZED WARN', () => {
    const files = [INDEX_VUE, COMP('HeaderSection'), COMP('TabsSection'), COMP('MainSection')]
    const res = CodeStructureValidator.validate(files, 'c-x', {
      target: 'microcode',
      componentPlan: NOISE_PLAN,
    } as any)
    const comp = res.issues.filter((i: any) => i.id.startsWith('COMP-001'))
    expect(comp.filter((i: any) => i.severity === 'BLOCK')).toHaveLength(0)
    // 4 个 section 里 switch 的组件文件不存在 → WARN（不可修，重试无意义）
    expect(comp.map((i: any) => i.id)).toContain('COMP-001-UNMATERIALIZED')
    expect(comp.find((i: any) => i.id === 'COMP-001-UNMATERIALIZED').severity).toBe('WARN')
  })

  it('零回归：旧 kebab 命名产物仍被识别（不新增阻断）', () => {
    expect(detectMissingSections(FLOW_FILES, FLOW_PLAN)).toHaveLength(4)
    expect(detectMissingSections(MONITOR_FILES, MONITOR_PLAN)).toHaveLength(0)
    expect(detectMissingSections(DRIFT_FILES, DRIFT_PLAN)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// 🛡️ COMP-001-DANGLING（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：递归悬空引用检测
// ──────────────────────────────────────────────
describe('detectDanglingComponentRefs（递归悬空引用）', () => {
  const FILE = (path, content) => ({ path, content })
  const CONTENT_SECTION = FILE(
    'package/components/ContentSection.vue',
    `<template><div><SubHeaderSection /><StatGroupSection /></div></template>
<script setup>
const SubHeaderSection = defineAsyncComponent(() => import('./SubHeaderSection.vue'))
import StatGroupSection from './StatGroupSection.vue'
</script>`,
  )

  it('子组件内部引用了未生成文件 → 检出悬空引用（defineAsyncComponent 形态）', () => {
    const files = [
      FILE('package/index.vue', '<template><ContentSection /></template>'),
      CONTENT_SECTION,
    ]
    const d = detectDanglingComponentRefs(files)
    const refs = d.map((x) => x.ref).sort()
    expect(refs).toEqual(['StatGroupSection', 'SubHeaderSection'])
    d.forEach((x) =>
      expect(x.expected).toBe(`package/components/${x.ref}.vue`),
    )
  })

  it('index.vue 已组装全部子组件（无孤儿）→ 旧豁免不报错，但悬空引用仍独立检出', () => {
    // 模拟 2290591b：index 引用了 ContentSection（真实存在），但 ContentSection 内部引用了缺失文件
    const files = [
      FILE('package/index.vue', "<template><ContentSection /></template><script setup>\nimport ContentSection from './components/ContentSection.vue'\n</script>"),
      CONTENT_SECTION,
    ]
    // 旧 analyzeSectionCoverage 的命名漂移豁免会让 detectMissingSections 返回空
    expect(detectMissingSections(files, { isForced: true, effectiveSections: [{ id: 'a', type: 'body', responsibility: '主体' }] })).toHaveLength(0)
    // 但递归悬空检测必须单独拦下
    expect(detectDanglingComponentRefs(files).length).toBe(2)
  })

  it('引用的文件真实存在 → 不报悬空', () => {
    const files = [
      CONTENT_SECTION,
      FILE('package/components/SubHeaderSection.vue', '<template><div>ok</div></template>'),
      FILE('package/components/StatGroupSection.vue', '<template><div>ok</div></template>'),
    ]
    expect(detectDanglingComponentRefs(files)).toHaveLength(0)
  })

  it('异常 fail-open：files 为 null / 畸形 → 返回 [] 不抛', () => {
    expect(detectDanglingComponentRefs(null)).toEqual([])
    expect(detectDanglingComponentRefs(undefined)).toEqual([])
    expect(detectDanglingComponentRefs([{ path: 'a.vue', content: undefined }])).toEqual([])
  })
})

// ──────────────────────────────────────────────
// 🛡️ 推 A 全 .vue 层（2026-09-14 · mc-max-1789376057659-2290591b 实锤）：悬空子组件引用剥离
// ──────────────────────────────────────────────
describe('stripDanglingComponentRefs（全 .vue 层悬空引用剥离）', () => {
  const FILE = (path: string, content: string) => ({ path, content })

  // 复刻 2290591b：ContentSection 空壳引用 7 个未生成的兄弟 section
  const CONTENT_SECTION = FILE(
    'package/components/ContentSection.vue',
    `<template>
  <div class="c-content">
    <SubHeaderSection />
    <StatGroupSection />
    <VehicleDistSection></VehicleDistSection>
  </div>
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
const SubHeaderSection = defineAsyncComponent(() => import('./SubHeaderSection.vue'))
import StatGroupSection from './StatGroupSection.vue'
const VehicleDistSection = defineAsyncComponent(() => import('./VehicleDistSection.vue'))
</script>`,
  )

  it('子组件层越权 import 未生成文件 → 剥离 import + 模板孤儿标签', () => {
    const files: Record<string, string> = {
      'package/index.vue': '<template><ContentSection /></template>',
      'package/components/ContentSection.vue': CONTENT_SECTION.content,
      'package/components/HeaderSection.vue': '<template><div>ok</div></template>',
    }
    const before = files['package/components/ContentSection.vue']
    const { files: out, stripped } = stripDanglingComponentRefs(files)
    const c = out['package/components/ContentSection.vue']
    expect(stripped).toHaveLength(1)
    expect(stripped[0].refs.sort()).toEqual(['StatGroupSection', 'SubHeaderSection', 'VehicleDistSection'])
    // import 全部移除了
    expect(c).not.toMatch(/SubHeaderSection\.vue|StatGroupSection\.vue|VehicleDistSection\.vue/)
    // defineAsyncComponent 死声明整行删除，不残留 `= null`（避免 CODE-021 / Vue 警告）
    expect(c).not.toMatch(/defineAsyncComponent\(\s*\(\)\s*=>\s*null/)
    expect(c).not.toMatch(/const\s+(SubHeaderSection|StatGroupSection|VehicleDistSection)\s*=/)
    // defineAsyncComponent 的正确 import 保留（供 HeaderSection 使用）
    expect(c).toMatch(/import \{ defineAsyncComponent \} from 'vue'/)
    // 模板孤儿标签移除（自闭合 + 成对）
    expect(c).not.toMatch(/<SubHeaderSection|<StatGroupSection|<VehicleDistSection/)
    // 未受影响的其它文件零触碰
    expect(out['package/components/HeaderSection.vue']).toContain('ok')
    expect(before).toContain('SubHeaderSection.vue')
  })

  it('被剥离后内容自洽：不再有指向缺失文件的 import', () => {
    const files: Record<string, string> = {
      'package/index.vue': '<template><ContentSection /></template>',
      'package/components/ContentSection.vue': CONTENT_SECTION.content,
    }
    const { files: out } = stripDanglingComponentRefs(files)
    const dangling = detectDanglingComponentRefs(
      Object.entries(out).map(([path, content]) => ({ path, content })),
    )
    expect(dangling).toHaveLength(0)
  })

  it('引用的文件真实存在 → 原样返回，零改动', () => {
    const files: Record<string, string> = {
      'package/components/ContentSection.vue': CONTENT_SECTION.content,
      'package/components/SubHeaderSection.vue': '<template><div>ok</div></template>',
      'package/components/StatGroupSection.vue': '<template><div>ok</div></template>',
      'package/components/VehicleDistSection.vue': '<template><div>ok</div></template>',
    }
    const { files: out, stripped } = stripDanglingComponentRefs(files)
    expect(stripped).toHaveLength(0)
    expect(out).toEqual(files)
  })

  it('异常 fail-open：files 为 null → 原样返回不抛', () => {
    const r = stripDanglingComponentRefs(null as unknown as Record<string, string>)
    expect(r.files).toBe(null)
    expect(r.stripped).toEqual([])
  })
})
