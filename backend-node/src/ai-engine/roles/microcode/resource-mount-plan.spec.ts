/**
 * 🛡️ 删减法批次 2（2026-09-14 · c-device-monitor-485d724d 实锤）：资源挂载计划单测。
 *
 * 背景（914 文档 §11/§13 取证）：
 *   - switch 双态：bg-8788(active 193.4×64.8) / bg-8807(default) / bg-8439(cons) 各归其主，
 *     根 bg(2:8418) skipMount 不参与挂载；
 *   - device-grid 12 卡共享同一张 bg-8439.png，mapping 却编成 bg3~bg14 十二别名 →
 *     LLM 多别名引用 → dedupeSameImageAliases 事后合并（纠偏器存在理由）。
 *
 * 治本：计划层把「同 resourceFile」固化为单变量 + sharedBy，并按 sourceNodeIds（批次 1
 *   已锚定）+ figma 祖先链解析 owner 组件，下游挂载零猜测。
 */
import { buildResourceMountPlan, mountPlannedResources } from './resource-mount-plan.js'

// ── 真实形态 fixture：c-device-monitor-485d724d（914 §11/§13 取证值）──
const deviceSections: any[] = [
  { id: '2:8419', type: 'header', responsibility: '顶部标题区', elementCount: 6, sourceNodeIds: ['2:8419', '2:8427'] },
  { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38', '2:8787', '2:8806'] },
  { id: '89:37', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['89:37', '89:39'] },
  { id: '2:8440', type: 'grid', responsibility: '设备卡片网格区', elementCount: 12, sourceNodeIds: ['2:8440', '2:8441'] },
]

// figma 树（最小化但祖先链忠实）：switch active/default 的 bg 是各自状态的子节点
const deviceFigma: any = {
  id: '2:9778', name: 'cp-设备监测', type: 'FRAME',
  children: [
    { id: '2:8418', name: 'bg', type: 'RECTANGLE' },
    { id: '89:38', name: 'switch', type: 'FRAME', children: [
      { id: '2:8787', name: 'switch-active', type: 'FRAME', children: [
        { id: '2:8788', name: 'bg', type: 'RECTANGLE' },
      ] },
      { id: '2:8806', name: 'switch-default', type: 'FRAME', children: [
        { id: '2:8807', name: 'bg', type: 'RECTANGLE' },
      ] },
    ] },
    { id: '2:8440', name: 'device-grid', type: 'FRAME', children: [
      { id: '2:8441', name: 'device-card', type: 'FRAME', children: [
        { id: '2:8442', name: 'bg', type: 'RECTANGLE' },
      ] },
    ] },
  ],
}

const bgEntry = (over: any) => ({
  previewAnalysisRole: 'bg',
  downloadStatus: 'success',
  ...over,
})

describe('buildResourceMountPlan（资源挂载计划·单一事实源）', () => {
  it('同 resourceFile 多条目 → 单变量 + sharedBy 全节点（12 卡共享 bg-8439 治本）', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg3', resourceFile: 'bg-8439.png', figmaNodeId: '2:8442', mountTarget: 'device-card', figmaPath: 'cp-设备监测/device-grid/device-card/bg' }),
      bgEntry({ assignedVarName: 'bg4', resourceFile: 'bg-8439.png', figmaNodeId: '2:8452', mountTarget: 'device-card', figmaPath: 'cp-设备监测/device-grid/device-card-2/bg' }),
      bgEntry({ assignedVarName: 'bg5', resourceFile: 'bg-8439.png', figmaNodeId: '2:8462', mountTarget: 'device-card', figmaPath: 'cp-设备监测/device-grid/device-card-3/bg' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    const g = plan.byFile.get('bg-8439.png')
    expect(g.varName).toBe('bg3') // 首个（traverse 序）变量为唯一事实
    expect(g.sharedBy).toEqual(['2:8442', '2:8452', '2:8462'])
    expect(g.mounts).toHaveLength(3)
  })

  it('owner 解析：bg 节点不在 section.src 但祖先在 → 归属该 section（switch 双态各归其主）', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg1', resourceFile: 'bg-8788.png', figmaNodeId: '2:8788', mountTarget: 'switch-active', bgRole: 'sub-state', figmaPath: 'cp-设备监测/switch/switch-active/bg' }),
      bgEntry({ assignedVarName: 'bg2', resourceFile: 'bg-8807.png', figmaNodeId: '2:8807', mountTarget: 'switch-default', bgRole: 'sub-state', figmaPath: 'cp-设备监测/switch/switch-default/bg' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    // 2:8788/2:8807 不直接在 89:38 的 src，但祖先 2:8787/2:8806 在 → owner=SwitchSection
    expect(plan.byFile.get('bg-8788.png').mounts[0].owner).toBe('SwitchSection')
    expect(plan.byFile.get('bg-8807.png').mounts[0].owner).toBe('SwitchSection')
    // 双态互不串：active 的 mountTarget 与 default 不同
    expect(plan.byFile.get('bg-8788.png').mounts[0].mountTarget).toBe('switch-active')
    expect(plan.byFile.get('bg-8807.png').mounts[0].mountTarget).toBe('switch-default')
  })

  it('skipMount 根面板 bg 不进挂载计划（914 §11：根 bg 2:8418 skipMount）', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg1', resourceFile: 'bg-8418.png', figmaNodeId: '2:8418', skipMount: true, figmaPath: 'cp-设备监测/bg' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(plan.byFile.size).toBe(0)
    expect(plan.skipped).toHaveLength(1)
    expect(plan.skipped[0].figmaNodeId).toBe('2:8418')
  })

  it('byComponent 索引：同 owner 的多个资源聚合到组件名下', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg1', resourceFile: 'bg-8788.png', figmaNodeId: '2:8788', mountTarget: 'switch-active', bgRole: 'sub-state' }),
      bgEntry({ assignedVarName: 'bg2', resourceFile: 'bg-8807.png', figmaNodeId: '2:8807', mountTarget: 'switch-default', bgRole: 'sub-state' }),
      bgEntry({ assignedVarName: 'bg3', resourceFile: 'bg-8439.png', figmaNodeId: '2:8442', mountTarget: 'device-card' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(plan.byComponent.get('SwitchSection')).toHaveLength(2)
    expect(plan.byComponent.get('CardGrid')).toHaveLength(1)
  })

  it('无归属资源（祖先链不命中任何 section）→ owner=null 归 index 根，不猜', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg9', resourceFile: 'bg-9999.png', figmaNodeId: '9:9999', mountTarget: 'nowhere', figmaPath: 'cp-设备监测/elsewhere/bg' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(plan.byFile.get('bg-9999.png').mounts[0].owner).toBeNull()
    expect(plan.byComponent.get('index')).toHaveLength(1)
  })

  it('下载失败条目不进计划（走既有 CSS 兜底路径，不归本计划管）', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg1', resourceFile: 'bg-8788.png', figmaNodeId: '2:8788', mountTarget: 'switch-active', downloadStatus: 'failed' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(plan.byFile.size).toBe(0)
  })

  it('icon/img 角色同样按计划聚合（kind 透传）', () => {
    const mapping = [
      { assignedVarName: 'icon1', resourceFile: 'icon-3561.png', previewAnalysisRole: 'icon', downloadStatus: 'success', figmaNodeId: '2:8427', figmaPath: 'cp-设备监测/header/icon' },
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    const g = plan.byFile.get('icon-3561.png')
    expect(g.kind).toBe('icon')
    expect(g.mounts[0].owner).toBe('HeaderSection')
  })

  it('确定性 + 幂等：同输入两次调用结果深度相等', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg3', resourceFile: 'bg-8439.png', figmaNodeId: '2:8442', mountTarget: 'device-card' }),
      bgEntry({ assignedVarName: 'bg4', resourceFile: 'bg-8439.png', figmaNodeId: '2:8452', mountTarget: 'device-card' }),
    ]
    const a = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    const b = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(JSON.stringify(a.byFile)).toBe(JSON.stringify(b.byFile))
  })

  it('空输入安全：无 mapping / 无 sections 返回空计划', () => {
    const plan = buildResourceMountPlan([], [], {})
    expect(plan.byFile.size).toBe(0)
    expect(plan.byComponent.size).toBe(0)
    expect(buildResourceMountPlan(null as any, null as any)).toBeDefined()
  })
})

// ──────────────────────────────────────────────
// 批次 2 loop 2b：计划驱动挂载（替代 autoMount* 的关键词猜测 + 跨文件回退）
// ──────────────────────────────────────────────
describe('mountPlannedResources（计划驱动挂载·owner 限定·fail-closed）', () => {
  const switchVue = `<template>
  <div class="c-device-monitor-switch">
    <div :class="['c-device-monitor-switch-item', { active: mode === 'tunnel' }]" @click="mode = 'tunnel'">隧道</div>
    <div :class="['c-device-monitor-switch-item', { active: mode === 'bridge' }]" @click="mode = 'bridge'">大桥</div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const mode = ref('tunnel')
</script>`

  const gridVue = `<template>
  <div class="c-device-monitor-device-grid">
    <div v-for="d in devices" :key="d.name" class="c-device-monitor-device-card">
      <span>{{ d.name }}</span>
    </div>
  </div>
</template>
<script setup>
defineProps({ devices: Array })
</script>`

  const indexVue = `<template>
  <div class="c-device-monitor-root"><SwitchSection /><CardGrid /></div>
</template>
<script setup>
import SwitchSection from './components/SwitchSection.vue'
import CardGrid from './components/CardGrid.vue'
</script>`

  const makeFiles = () => ({
    'package/components/SwitchSection.vue': switchVue,
    'package/components/CardGrid.vue': gridVue,
    'package/index.vue': indexVue,
  })

  it('sub-state active bg → 只挂 SwitchSection.vue 的 active 条件绑定，index.vue 不被污染', () => {
    const sections: any[] = [
      { id: '89:38', type: 'switch', responsibility: '切换卡', sourceNodeIds: ['89:38', '2:8787'] },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '89:38', name: 'switch', children: [
        { id: '2:8787', name: 'switch-active', children: [{ id: '2:8788', name: 'bg' }] },
      ] },
    ] }
    const mapping = [
      { assignedVarName: 'bg1', resourceFile: 'bg-8788.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8788', mountTarget: 'switch-active', bgRole: 'sub-state' },
    ]
    const files = makeFiles()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].file).toBe('package/components/SwitchSection.vue')
    expect(files['package/components/SwitchSection.vue']).toContain('bg1')
    expect(files['package/components/SwitchSection.vue']).toContain('import bg1 from')
    expect(files['package/index.vue']).toBe(indexVue) // 零跨文件污染
  })

  it('共享底图 3 个 mount 同 target → 单绑定单 import（12 卡共享语义）', () => {
    const sections: any[] = [
      { id: '2:8440', type: 'grid', responsibility: '设备卡片网格区', sourceNodeIds: ['2:8440', '2:8441'] },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '2:8440', name: 'device-grid', children: [
        { id: '2:8441', name: 'device-card', children: [{ id: '2:8442', name: 'bg' }] },
      ] },
    ] }
    const mapping = [1, 2, 3].map((i) => ({
      assignedVarName: 'bg' + (2 + i), resourceFile: 'bg-8439.png', previewAnalysisRole: 'bg',
      downloadStatus: 'success', figmaNodeId: '2:844' + i, mountTarget: 'device-card',
    }))
    const files = makeFiles()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1) // 同 var+target 去重，只挂一次
    const out = files['package/components/CardGrid.vue']
    expect((out.match(/import bg3 from/g) || []).length).toBe(1)
    expect((out.match(/url\(' \+ bg3 \+ '\)/g) || []).length).toBe(1)
    expect(out).not.toContain('bg4')
    expect(out).not.toContain('bg5')
  })

  it('mountTarget 在 owner 文件不命中 → 记诊断，禁止跨文件/根回退', () => {
    const sections: any[] = [
      { id: '2:8440', type: 'grid', responsibility: '设备卡片网格区', sourceNodeIds: ['2:8440'] },
    ]
    const mapping = [
      { assignedVarName: 'bg3', resourceFile: 'bg-8439.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8440', mountTarget: 'nonexistent-target' },
    ]
    const files = makeFiles()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(0)
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0].reason).toBe('mount-target-not-found')
    expect(files['package/index.vue']).toBe(indexVue) // 无根回退
  })

  it('icon → 注入 img 子元素到 owner 文件目标标签（尺寸封顶 48px）', () => {
    const sections: any[] = [
      { id: '2:8440', type: 'grid', responsibility: '设备卡片网格区', sourceNodeIds: ['2:8440', '2:8441'] },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '2:8440', name: 'device-grid', children: [
        { id: '2:8441', name: 'device-card', children: [{ id: '2:8450', name: 'icon' }] },
      ] },
    ] }
    const mapping = [
      { assignedVarName: 'icon1', resourceFile: 'icon-8450.png', previewAnalysisRole: 'icon', downloadStatus: 'success', figmaNodeId: '2:8450', mountTarget: 'device-card', figmaBox: { width: 96, height: 96 } },
    ]
    const files = makeFiles()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1)
    const out = files['package/components/CardGrid.vue']
    expect(out).toContain(':src="icon1"')
    expect(out).toContain('import icon1 from')
    expect(out).toContain('48') // 96×96 封顶到 48
  })

  it('变量已被 LLM 引用 → 跳过（幂等，不重复绑定）', () => {
    const sections: any[] = [
      { id: '2:8440', type: 'grid', responsibility: '设备卡片网格区', sourceNodeIds: ['2:8440'] },
    ]
    const mapping = [
      { assignedVarName: 'bg3', resourceFile: 'bg-8439.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8440', mountTarget: 'device-card' },
    ]
    const files = makeFiles()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    const once = mountPlannedResources(files, plan)
    const afterOnce = files['package/components/CardGrid.vue']
    const twice = mountPlannedResources(files, plan)
    expect(twice.mounted).toHaveLength(0)
    expect(files['package/components/CardGrid.vue']).toBe(afterOnce)
    expect(once.mounted).toHaveLength(1)
  })

  it('owner=null 归 index.vue（不猜子组件）', () => {
    const mapping = [
      { assignedVarName: 'bg9', resourceFile: 'bg-9999.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '9:9999', mountTarget: 'root' },
    ]
    const files = makeFiles()
    const plan = buildResourceMountPlan([], mapping, { figmaRoot: null })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].file).toBe('package/index.vue')
    expect(files['package/components/SwitchSection.vue']).toBe(switchVue)
  })
})
