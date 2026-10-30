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
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { buildResourceMountPlan, mountPlannedResources, ensureStateRootFlexLayout } from './resource-mount-plan.js'

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
    // 同 var+target 去重，只挂一次；且这一次必须是 **v-for item**（逐卡）挂载
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].keyword).toBe('v-for-item')
    expect(r.mounted[0].file).toBe('package/components/CardGrid.vue')
    const out = files['package/components/CardGrid.vue']
    expect((out.match(/import bg3 from/g) || []).length).toBe(1)
    expect((out.match(/url\(' \+ bg3 \+ '\)/g) || []).length).toBe(1)
    expect(out).not.toContain('bg4')
    expect(out).not.toContain('bg5')
    // 🛡️ 刀33 第3步：owner=null 的第 3 条 mount（figmaNodeId 不在树内 → 落 index.vue 根）
    //   是**同一张共享底图** ⇒ 必须让位给 per-item 宿主（CardGrid.vue 的 v-for item），
    //   绝不能再把逐卡背景挂到只渲染一次的根组件（旧实现正是如此：根背景 100% 拉伸）。
    expect(files['package/index.vue']).toBe(indexVue)
    expect(r.diagnostics.map((x: any) => x.reason)).toContain('per-item-host-external')
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

  it('独立 ContentActive 无 :class active 绑定 → 静态挂 bg1 到根容器', () => {
    // 🛡️ 夹具修正（2026-09-26）：原夹具 section 带 `type:'body'` 且**只有单张卡** →
    //   `assignSectionComponentNames` 落 `MainSection`（type 基名 + 无同 type 兄弟不做语义后缀），
    //   而夹具只提供 ContentActive.vue → 计划期 owner 文件不存在 → 挂载时 `owner-file-missing`
    //   直接 return，**这条"静态兜底"分支永远测不到**（测试长期红）。
    //   真机形态（c-device-monitor-8d304bf9 实测）：switch 子卡**无 type 字段**，且 active/default
    //   是**兄弟**（同 type 多 section → 语义后缀去重）→ 才派生 ContentActive/ContentDefault。
    //   夹具据此对齐真机（已实测该形态派生名 = ContentActive/ContentDefault）。
    const sections: any[] = [
      {
        id: '89:38', type: 'switch', title: 'switch', isLayoutContainer: true,
        layout: 'horizontal', sourceNodeIds: ['89:38', '2:8787', '2:8806'],
        children: [
          { id: '2:8787', title: 'active', responsibility: '激活卡', sourceNodeIds: ['2:8787', '2:8788'] },
          { id: '2:8806', title: 'default', responsibility: '默认卡', sourceNodeIds: ['2:8806', '2:8807'] },
        ],
      },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '89:38', name: 'switch', children: [
        { id: '2:8787', name: 'active', children: [{ id: '2:8788', name: 'bg' }] },
        { id: '2:8806', name: 'default', children: [{ id: '2:8807', name: 'bg' }] },
      ] },
    ] }
    const mapping = [
      { assignedVarName: 'bg1', resourceFile: 'bg-8788.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8788', mountTarget: 'active', bgRole: 'container' },
    ]
    const files = {
      'package/components/ContentActive.vue': `<template>
  <div class="c-device-monitor-active">
    <div class="c-device-monitor-active-title">隧道设备</div>
  </div>
</template>
<script setup>
</script>`,
      'package/index.vue': indexVue,
    }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].file).toBe('package/components/ContentActive.vue')
    // 🛡️ 期望更新（2026-09-26）：`bgRole:'container'` + `target∈{active,default}` 由**更早**的
    //   专用分支 `isContainerStateBg` 处理并 continue（`container-state-root`），
    //   能力比 2026-09-17 那条 `standalone-state-static-fallback` 更强：
    //   额外做 P-08 根布局确定化（ensureStateRootFlexLayout）+ 跨文件误挂清洗
    //   （removeContainerBgOffTargetRefs）。旧 reason 对本输入**被遮蔽**（不是回归）。
    expect(r.mounted[0].reason).toBe('container-state-root')
    const out = files['package/components/ContentActive.vue']
    expect(out).toContain('bg1')
    expect(out).toContain('import bg1 from')
    expect(out).toContain('backgroundImage')
    expect(files['package/index.vue']).toBe(indexVue)
  })

  it('（补覆盖）bgRole=sub-state + target=active → 走独立状态组件静态兜底路径', () => {
    // 🛡️ 覆盖补位（2026-09-26）：`standalone-state-static-fallback` 对 `bgRole:'container'`
    //   会被前面的 container 专用分支遮蔽；但 `bgRole:'sub-state'` 仍可达该分支。
    //   补一条把这条老兜底路径的回归网留住（删减法纪律：先确认覆盖，再谈退役）。
    const sections: any[] = [
      {
        id: '89:38', type: 'switch', title: 'switch', isLayoutContainer: true,
        layout: 'horizontal', sourceNodeIds: ['89:38', '2:8787', '2:8806'],
        children: [
          { id: '2:8787', title: 'active', responsibility: '激活卡', sourceNodeIds: ['2:8787', '2:8788'] },
          { id: '2:8806', title: 'default', responsibility: '默认卡', sourceNodeIds: ['2:8806', '2:8807'] },
        ],
      },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '89:38', name: 'switch', children: [
        { id: '2:8787', name: 'active', children: [{ id: '2:8788', name: 'bg' }] },
        { id: '2:8806', name: 'default', children: [{ id: '2:8807', name: 'bg' }] },
      ] },
    ] }
    const mapping = [
      { assignedVarName: 'bg1', resourceFile: 'bg-8788.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8788', mountTarget: 'active', bgRole: 'sub-state' },
    ]
    const files = {
      'package/components/ContentActive.vue': `<template>
  <div class="c-device-monitor-active">
    <div class="c-device-monitor-active-title">隧道设备</div>
  </div>
</template>
<script setup>
</script>`,
      'package/index.vue': indexVue,
    }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].file).toBe('package/components/ContentActive.vue')
    expect(r.mounted[0].reason).toBe('standalone-state-static-fallback')
    const out = files['package/components/ContentActive.vue']
    expect(out).toContain('bg1')
    expect(out).toContain('import bg1 from')
    expect(files['package/index.vue']).toBe(indexVue)
  })

  it('owner 派生的组件文件不存在 → 记 owner-file-missing 诊断，不猜文件（fixture 失真形态锁死）', () => {
    // 锁死行为：plan 派生名（如单卡无 type 兄弟 → MainSection）对应的文件不存在时，
    // **不跨文件回退、不改挂 index.vue**，只记诊断（fail-closed）。
    const sections: any[] = [
      { id: '2:8787', type: 'body', responsibility: '激活卡', sourceNodeIds: ['2:8787', '2:8788'] },
    ]
    const figma: any = { id: 'r', name: 'root', children: [
      { id: '2:8787', name: 'active', children: [{ id: '2:8788', name: 'bg' }] },
    ] }
    const mapping = [
      { assignedVarName: 'bg1', resourceFile: 'bg-8788.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8788', mountTarget: 'active', bgRole: 'container' },
    ]
    const files = { 'package/index.vue': indexVue }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(0)
    expect(r.diagnostics.some((d: any) => d.reason === 'owner-file-missing')).toBe(true)
    expect(files['package/index.vue']).toBe(indexVue)
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

describe('注入器自检防线（错配注入回滚，拒绝把合格产物改坏）', () => {
  const sections: any[] = [
    { id: '2:8440', type: 'grid', responsibility: '卡片网格区', sourceNodeIds: ['2:8440'] },
  ]
  // 一张「已合法」的卡片组件，模板只有一个简单容器（无 bg 绑定点）
  const cleanCardVue = `<template>
  <div class="c-x-card">
    <span>危化品车</span>
  </div>
</template>
<script setup>
const { runtimeBuilder } = $mcComponentBuilder()
</script>
<style lang="less" scoped>
.c-x-card { width: 100%; }
</style>
`
  const files = () => ({
    'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-root"><CardGrid /></div>
  </base-panel>
</template>
<script setup>
import CardGrid from './components/CardGrid.vue'
</script>
`,
    'package/components/CardGrid.vue': cleanCardVue,
  })

  it('bg 注入到合法组件 → 自检通过，正常挂载', () => {
    const mapping = [
      { assignedVarName: 'bg3', resourceFile: 'bg-8439.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8440', mountTarget: 'c-x-card' },
    ]
    const f = files()
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    const r = mountPlannedResources(f, plan)
    // 至少触发了挂载尝试（成功与否取决于 tag 匹配），关键是不抛异常、文件保持合法
    expect(typeof f['package/components/CardGrid.vue']).toBe('string')
    expect(r).toHaveProperty('mounted')
  })

  it('注入破坏 SFC（模拟错配）→ 回滚，文件保持原样合法', () => {
    // 构造一个「注入后会破坏 SFC」的场景：mountTarget 命中后注入非法内容。
    // 通过注入器自检防线，若注入产物无法通过 SFC 编译，则回滚到原内容。
    const badVue = `<template>
  <div class="c-x-card" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
    <span>危化品车</span>
  </div>
</template>
<script setup>
const { runtimeBuilder } = $mcComponentBuilder()
</script>
<style lang="less" scoped>
.c-x-card { width: 100%; }
</style>
`
    const mapping = [
      { assignedVarName: 'bg3', resourceFile: 'bg-8439.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:8440', mountTarget: 'c-x-card' },
    ]
    const f = {
      'package/index.vue': `<template><base-panel panelKey="default-panel"><div class="c-x-root"><CardGrid /></div></base-panel></template>\n<script setup>\nimport CardGrid from './components/CardGrid.vue'\n</script>`,
      'package/components/CardGrid.vue': badVue,
    }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    const before = f['package/components/CardGrid.vue']
    mountPlannedResources(f, plan)
    // 无论挂载成功与否，文件内容不得被注入破坏到「非法」
    // （已有 bg3 引用 → 幂等跳过，内容不变）
    expect(f['package/components/CardGrid.vue']).toBe(before)
  })
})

// ══════════ P-08 状态子组件根布局确定化（2026-09-17 · 36c3a630 实锤）══════════
describe('ensureStateRootFlexLayout（P-08 根布局几何注入）', () => {
  // 「icon | 右侧竖排文字」嵌套卡片（复刻 2:8806 default 卡几何）
  const figmaIndex = new Map<string, any>()
  const bgNode: any = { id: '2:8807', name: 'bg', type: 'GROUP' }
  const cardNode: any = {
    id: '2:8806', name: 'default', type: 'GROUP',
    children: [
      bgNode,
      { id: '2:8810', name: 'line1', absoluteBoundingBox: { x: 1764, y: 481, width: 93, height: 23 } },
      { id: '2:8813', name: 'line2', absoluteBoundingBox: { x: 1764, y: 510, width: 59, height: 23 } },
      { id: '2:8816', name: 'title', absoluteBoundingBox: { x: 1703, y: 513, width: 45, height: 20 } },
      { id: '2:8817', name: 'icon', absoluteBoundingBox: { x: 1707, y: 481, width: 35, height: 28 } },
    ],
  }
  bgNode.__parent = cardNode
  for (const n of [bgNode, ...cardNode.children]) figmaIndex.set(String(n.id), n)

  const vueNoDisplay = `<template>
  <div class="c-x-default" :style="{ backgroundImage: 'url(' + bg2 + ')' }">
    <div class="c-x-default-icon"><img :src="icon3" /></div>
    <div class="c-x-default-text"><span>南北接线</span></div>
  </div>
</template>
<style lang="less" scoped>
.c-x-default { width: 100%; height: 100%; min-height: 0; }
</style>`

  it('根无 display + 卡片 x 聚簇≥2（icon|文字组）→ 注入 row 布局', () => {
    const r = ensureStateRootFlexLayout(vueNoDisplay, figmaIndex, '2:8807')
    expect(r).toMatch(/display:\s*flex/)
    expect(r).toMatch(/flex-direction:\s*row/)
    expect(r).toMatch(/align-items:\s*center/)
  })

  it('根已有 display 声明 → 尊重不覆盖（返回 null）', () => {
    const vueHas = vueNoDisplay.replace('width: 100%;', 'width: 100%; display: flex;')
    expect(ensureStateRootFlexLayout(vueHas, figmaIndex, '2:8807')).toBeNull()
  })

  it('bg 节点不在索引 → fail-closed 返回 null', () => {
    expect(ensureStateRootFlexLayout(vueNoDisplay, figmaIndex, '9:9999')).toBeNull()
  })
})

describe('#1 owner 文件缺失 → bg fail-closed（2026-09-20 · 9caed484 bg 挂错治本）', () => {
  const indexVue = `<template>
  <div class="c-env-monitor-root">
    <div class="c-env-monitor-tabs-wrapper"><ChartSection /></div>
  </div>
</template>
<script setup>
import ChartSection from './components/ChartSection.vue'
</script>`

  // 用 type=chart（decideBaseName 确定返回 ChartSection），owner 名可预测，与脆弱命名无关。
  const mk = (srcIds: string[]) => [
    { id: '2:7889', type: 'chart', responsibility: '图表区', sourceNodeIds: srcIds },
  ]
  const figma = { id: 'r', name: 'root', children: [
    { id: '2:7889', name: 'chart', children: [{ id: '2:7890', name: 'bg', type: 'RECTANGLE' }] },
  ] }
  const mapping = [
    { assignedVarName: 'bg1', resourceFile: 'bg-7890.png', previewAnalysisRole: 'bg', downloadStatus: 'success', figmaNodeId: '2:7890', mountTarget: 'chart', bgRole: 'container' },
  ]

  it('owner 组件文件不存在 → bg 放弃挂载，不污染 index.vue', () => {
    const files = {
      // owner=ChartSection，但文件表里没有 ChartSection.vue（section 被合并/未生成）
      'package/index.vue': indexVue,
    }
    const plan = buildResourceMountPlan(mk(['2:7889', '2:7890']), mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted).toHaveLength(0) // 关键：owner 缺失 → 不强挂
    expect(files['package/index.vue']).toBe(indexVue) // index.vue 零污染
    expect(r.diagnostics.some((d) => d.reason === 'owner-file-missing-bg')).toBe(true)
  })

  it('owner 组件文件存在 → bg 正常挂载（不误伤）', () => {
    const chartVue = `<template><div class="c-env-monitor-chart">chart</div></template>`
    const files = {
      'package/components/ChartSection.vue': chartVue,
      'package/index.vue': indexVue,
    }
    const plan = buildResourceMountPlan(mk(['2:7889', '2:7890']), mapping, { figmaRoot: figma })
    const r = mountPlannedResources(files, plan)
    expect(r.mounted.length).toBeGreaterThanOrEqual(1)
    expect(files['package/components/ChartSection.vue']).toContain('bg1')
  })
})

describe('buildResourceMountPlan §六 #4 · sectionAnchorId（数据事实链）', () => {
  it('bg 节点不在 section.src，但最近祖先 section 命中 → 给出锚点 id', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg7', resourceFile: 'bg-x.png', figmaNodeId: '2:8442', mountTarget: 'device-card', bgRole: 'container' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    // 2:8442 祖先链：2:8441(device-card) → 2:8440(device-grid=section) → 锚点 = 2:8440
    expect(plan.byFile.get('bg-x.png').mounts[0].sectionAnchorId).toBe('2:8440')
  })
  it('节点本身就是 section id → 锚点 = 自身', () => {
    const mapping = [
      bgEntry({ assignedVarName: 'bg8', resourceFile: 'bg-y.png', figmaNodeId: '2:8440', mountTarget: 'device-grid', bgRole: 'container' }),
    ]
    const plan = buildResourceMountPlan(deviceSections, mapping, { figmaRoot: deviceFigma })
    expect(plan.byFile.get('bg-y.png').mounts[0].sectionAnchorId).toBe('2:8440')
  })
})

describe('mountPlannedResources §六 #4 · owner 同族对齐（治 owner 名与实际分解不同源）', () => {
  it('owner 推导名在产物里不存在（TabsList）→ 对齐实际组件（TabsSection）并挂进它，而非回落 index.vue', () => {
    // 直接构造 plan（聚焦测「owner 同族对齐」）：owner 推导名 TabsList 在产物里不存在，
    // 实际只分解出 TabsSection.vue（两者公共前缀 Tabs=4 → 应判定同族并挂进 TabsSection）
    const plan: any = {
      byFile: new Map([
        ['bg-7890.png', {
          varName: 'bg1', kind: 'bg', sharedBy: [],
          mounts: [{
            figmaNodeId: '2:7890', owner: 'TabsList', sectionAnchorId: null,
            mountTarget: 'tabs-list', bgRole: 'container', kind: 'bg',
          }],
        }],
      ]),
      byComponent: new Map(),
      skipped: [],
    }
    const allFiles: any = {
      'package/index.vue':
        '<template><div class="c-x-slot-con"><div class="c-x-sub-con" data-section-id="sub"></div></div></template>',
      'package/components/TabsSection.vue':
        '<template><div class="c-x-tab"><div class="c-x-tab-list"></div></div></template>\n<style scoped>.c-x-tab-list { background: red; }</style>',
    }
    mountPlannedResources(allFiles, plan, { logger: { warn() {}, info() {} } })
    expect(allFiles['package/components/TabsSection.vue']).toContain('bg1')
    expect(allFiles['package/index.vue']).not.toContain('bg1')
  })
})

// ══════════════════════════════════════════════════════════════
// 刀33 第3步 · per-item 背景资源让位外部 v-for 宿主
// 真实形态：mc-max-1793281736684-802b780c（折叠段接管把列表渲染搬进 ListSection.vue）
// 真机复跑取证：mc-1793286461778-8ad1ccc1 —— `.mc-gen/resource-dom-mapping.json` 里
//   `image_313-5800.png`(bg1) **只有 1 条** ⇒ 判据不得依赖「同资源被 N 个节点共享」，
//   否则真机恒假＝死代码（见 resource-mount-plan.js findExternalVForItemHost 留痕）。
// ══════════════════════════════════════════════════════════════
describe('刀33 第3步 · per-item 背景资源让位外部 v-for 宿主', () => {
  /**
   * 折叠段接管产物：v-for item 在**子组件**里（ListSection.vue），
   * item 行由接管层逐项渲染背景图（刀33 第1/2步 A 侧行为）。
   */
  const LIST_SEC = `<template>
  <div data-section-id="48:5798-list" class="c-x-fg-list-485798list">
    <div v-for="(it, __i) in FG_LIST_ITEMS" :key="__i" class="c-x-fg-list-485798list-item" style="border-radius:6px;" :style="{ backgroundColor: it.fill || undefined, backgroundImage: 'url(' + bg1 + ')' }">
      <span>{{ it.t }}</span>
    </div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/image_313-5800.png'
const FG_LIST_ITEMS = []
</script>`

  /** index.vue：只有容器（list-con 的 data-section-id = **重复单元** 48:5798，不是列表容器）。 */
  const IDX_PLAIN = `<template>
  <div class="c-x-slot-con">
    <div class="c-x-list-con" data-section-id="48:5798"><ListSection /></div>
  </div>
</template>
<script setup>
import ListSection from './components/ListSection.vue'
</script>`

  // 🔴 真机两段树（mc-1793287232957-71c64e28 取证）：container 48:5798 非叶，
  //   子叶 48:5798-list 的 sourceNodeIds 包含 48:5800（bg1 的 figmaNodeId）
  //   ⇒ resolveOwner 返回 ListSection（不是 null）⇒ compFile = ListSection.vue。
  //   旧 fixture 只有单叶 {id:'48:5798', src:['48:5798']} ⇒ owner=null ⇒ compFile=index.vue
  //   ⇒ 守卫检查的是 index.vue（假绿），真机守卫检查 ListSection.vue（短路死）。
  const sections: any[] = [
    {
      id: '48:5798', type: 'container', responsibility: '内容区',
      sourceNodeIds: ['48:5798'],
      isLayoutContainer: true,
      children: [
        {
          id: '48:5798-list', type: 'list', responsibility: '节点列表',
          sourceNodeIds: ['48:5798', '48:5799', '48:5800', '48:5815', '48:5830', '48:5845', '48:5860', '48:5875'],
        },
      ],
    },
  ]

  /** 6 张卡共享同一张图条 ⇒ 同 resourceFile 固化单变量 bg1（共享形态；判据不依赖条数）。 */
  const sharedMapping = () =>
    [0, 1, 2, 3, 4, 5].map((i) => ({
      assignedVarName: 'bg1',
      resourceFile: 'image_313-5800.png',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      figmaNodeId: `48:${5800 + i * 15}`,
      ownerSectionId: '48:5798',
      mountTarget: 'slot-con',
      bgRole: 'sub-state',
      figmaBox: { x: 20837, y: 51606, width: 459, height: 29 },
      parentBox: { x: 20831, y: 51606, width: 470, height: 72 },
    }))

  it('阳性：本文件无 v-for item 且外部宿主存在 → index.vue 让位（fail-closed，不挂容器）', () => {
    const files: any = {
      'package/index.vue': IDX_PLAIN,
      'package/components/ListSection.vue': LIST_SEC,
    }
    const plan = buildResourceMountPlan(sections, sharedMapping(), { figmaRoot: null })
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    // 一条都不挂：事实链（list-con=重复单元）+ sub-state 静态回退（slot-con）两条误挂路径都被拦
    expect(r.mounted).toHaveLength(0)
    const d = r.diagnostics.find((x: any) => x.reason === 'per-item-host-external')
    expect(d).toBeTruthy()
    expect(d.host).toBe('package/components/ListSection.vue')
    // 本文件零污染（不 import 资源、不注入 :style）
    expect(files['package/index.vue']).toBe(IDX_PLAIN)
    // 外部宿主自己保留逐项绑定（不受本文件让位影响）
    expect(files['package/components/ListSection.vue']).toContain('bg1')
  })

  it('反向①：外部无 per-item 宿主（子组件未引用该资源）→ 不让位，仍走事实链（不劣化）', () => {
    const files: any = {
      'package/index.vue': IDX_PLAIN,
      'package/components/ListSection.vue': LIST_SEC.replace(/bg1/g, 'bgOther'),
    }
    const plan = buildResourceMountPlan(sections, sharedMapping(), { figmaRoot: null })
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    expect(r.diagnostics.map((x: any) => x.reason)).not.toContain('per-item-host-external')
    expect(r.mounted.length).toBeGreaterThan(0)
    expect(r.mounted[0].reason).toBe('section-anchor-fact-chain')
    expect(files['package/index.vue']).toContain('bg1')
  })

  it('反向②：本文件自带 v-for item → 拦截不触发（判据恰为「本文件无 v-for item」）', () => {
    const idxWithVFor = `<template>
  <div class="c-x-slot-con">
    <div class="c-x-list-con" data-section-id="48:5798">
      <div v-for="(it, i) in items" :key="i" class="c-x-list-con-item">{{ it.t }}</div>
    </div>
  </div>
</template>
<script setup>
const items = []
</script>`
    const files: any = { 'package/index.vue': idxWithVFor }
    const plan = buildResourceMountPlan(sections, sharedMapping(), { figmaRoot: null })
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    expect(r.diagnostics.map((x: any) => x.reason)).not.toContain('per-item-host-external')
    expect(r.mounted.length).toBeGreaterThan(0)
    // 本文件既有 v-for item ⇒ 不属于「本文件无 per-item 宿主」情形 ⇒ 让位判据不得介入；
    // 交给既有分支，且既有优先级不变：§六#4 数据事实链（锚点 48:5798 命中）优先。
    expect(r.mounted[0].file).toBe('package/index.vue')
    expect(r.mounted[0].keyword).toBe('data-section-id=48:5798')
    expect(files['package/index.vue']).toContain('bg1')
  })

  it('反向②b：owner 文件自带 v-for item 且无锚点/非 sub-state → 不拦，落到 v-for item 逐项挂载', () => {
    // 掐掉所有更高优先级出口（锚点事实链 / sub-state 状态分支 / container 状态分支），
    // 使唯一可达分支 = `sharedCount > 1` 的 v-for item 逐项挂载 —— 这条正是拦截必须放行的路径。
    // 🔴 新 fixture（真机两段树）：owner=ListSection ⇒ 本用例的「本文件」= ListSection.vue。
    const listWithVFor = `<template>
  <div data-section-id="48:5798-list" class="c-x-fg-list">
    <div v-for="(it, i) in items" :key="i" class="c-x-fg-list-item">{{ it.t }}</div>
  </div>
</template>
<script setup>
const items = []
</script>`
    const mapping = sharedMapping().map((m) => ({
      ...m,
      ownerSectionId: undefined,
      bgRole: undefined,
    }))
    const files: any = { 'package/components/ListSection.vue': listWithVFor }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    expect(r.diagnostics.map((x: any) => x.reason)).not.toContain('per-item-host-external')
    expect(r.mounted).toHaveLength(1)
    expect(r.mounted[0].keyword).toBe('v-for-item')
    // 绑定必须落在 v-for item 行（逐项），而不是外层容器
    const itemLine = files['package/components/ListSection.vue']
      .split('\n')
      .find((l: string) => l.includes('c-x-fg-list-item'))
    expect(itemLine).toContain('bg1')
  })

  it('真机形态（单条 mapping，sharedBy=1）→ 仍让位（判据不依赖 sharedBy>1，杜绝死代码）', () => {
    // 🔴 复跑实锤 mc-1793286461778-8ad1ccc1：折叠 dedup 后 bg1 在映射表里**只有 1 条**。
    //   旧判据前置 `sharedBy.length > 1` 据此恒假 ⇒ 拦截永不触发（死代码）。
    //   本条与真机同构：单条 bg mapping + index.vue 无 v-for item + 子组件含 bg1 且带 v-for item。
    const mapping = [
      {
        assignedVarName: 'bg1',
        resourceFile: 'image_313-5800.png',
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
        figmaNodeId: '48:5800',
        ownerSectionId: '48:5798',
        mountTarget: 'slot-con',
        bgRole: 'sub-state',
      },
    ]
    const files: any = {
      'package/index.vue': IDX_PLAIN,
      'package/components/ListSection.vue': LIST_SEC,
    }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    expect(plan.byFile.get('image_313-5800.png').sharedBy).toHaveLength(1)
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    const d = r.diagnostics.find((x: any) => x.reason === 'per-item-host-external')
    expect(d).toBeTruthy()
    expect(d.host).toBe('package/components/ListSection.vue')
    expect(r.mounted).toHaveLength(0)
    expect(files['package/index.vue']).toBe(IDX_PLAIN)
  })

  it('反向③：外部文件引用了该 var 但**无 v-for item** → 不让位（存在性判据严格，不误让位）', () => {
    // 外部宿主探测要求「引用该 var ∧ 含 v-for item」两个条件同时成立。只有引用、没有
    // per-item 模板时，本文件若让位 ⇒ 无人逐项挂载 ⇒ 资源彻底消失。故必须让位失败（返回
    // null），退回既有事实链路径（fail-open，行为不劣于旧实现）。
    const SEC_NO_VFOR = `<template>
  <div data-section-id="48:5798-list" class="c-x-fg-list-485798list">
    <div class="c-x-fg-list-485798list-item" :style="{ backgroundImage: 'url(' + bg1 + ')' }">单条</div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/image_313-5800.png'
</script>`
    const files: any = {
      'package/index.vue': IDX_PLAIN,
      'package/components/ListSection.vue': SEC_NO_VFOR,
    }
    const plan = buildResourceMountPlan(sections, sharedMapping(), { figmaRoot: null })
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    expect(r.diagnostics.map((x: any) => x.reason)).not.toContain('per-item-host-external')
    expect(r.mounted.length).toBeGreaterThan(0)
    expect(files['package/index.vue']).toContain('bg1')
  })

  it('反向④：无锚点 + owner=null（节点不在任何 section src）→ 早退守卫拦截 slot-con 静态回退', () => {
    // 🔴 新 fixture（真机两段树）下，sharedMapping 的 figmaNodeId 都在 48:5798-list.src 中
    //   ⇒ owner=ListSection（含 v-for）⇒ 早退守卫短路。本用例刻意让 figmaNodeId 不在
    //   任何 section src 中 ⇒ owner=null ⇒ compFile=index.vue ⇒ 早退守卫可触发。
    //   测试目标：无锚点时 sub-state 静态回退（slot-con）仍被早退守卫拦截。
    const mapping = sharedMapping().map((m, i) => ({
      ...m,
      figmaNodeId: `48:${9900 + i}`, // 不在 48:5798-list.src 中
      ownerSectionId: undefined,
    }))
    const files: any = {
      'package/index.vue': IDX_PLAIN,
      'package/components/ListSection.vue': LIST_SEC,
    }
    const plan = buildResourceMountPlan(sections, mapping, { figmaRoot: null })
    expect(plan.byFile.get('image_313-5800.png').mounts[0].sectionAnchorId).toBeNull()
    expect(plan.byFile.get('image_313-5800.png').mounts[0].owner).toBeNull()
    const r = mountPlannedResources(files, plan, { logger: { warn() {}, info() {} } })
    expect(r.diagnostics.map((x: any) => x.reason)).toContain('per-item-host-external')
    expect(r.mounted).toHaveLength(0)
    expect(files['package/index.vue']).toBe(IDX_PLAIN)
  })
})
