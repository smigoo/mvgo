import { detectMissingSections, ensureSectionAssembly } from './section-coverage-guard.js'
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
