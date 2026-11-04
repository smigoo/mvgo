/**
 * 🛡️ 刀 57（2026-11-04 · mc-max-1793759563964-878b3ef1 实锤）：借用资源处置的
 * 「对象字面量字段值」形态。
 *
 * 事故链：`CardGrid.vue`（section `2:8437`，设备卡片网格）把 header/switch 的图标
 * （`Frame-8856.png` owner `2:8419` 等）借来渲染，引用形态**全部**是数据数组的
 * 对象字段值：
 *   `{ label: '摄像机', value: '(2/484)', icon: icon1 }`
 *
 * 而 healBorrowedEvidence 的 `removeResourceRefs` 旧版只认两种形态
 * （①`:style` 内对象顶层属性、②`:attr="var"` 整属性）⇒ 本形态返回 null ⇒ 逐条 continue
 * ⇒ **静默 0 处置**：借用图标照渲、import 剪不掉（`touched` 为空 ⇒ `pruneUnmounted` 不跑）
 * ⇒ 产物撞发布前 RES-UNREF 缺口。
 *
 * ⚠️ 离线探针实锤：`checkSectionExclusiveEvidence` 算出 3 条 `borrowedAssetIssues`，
 *    同参调 `healBorrowedEvidence` 返回 `healed.asset = []` 且 5 个文件逐字节未变。
 */
// 同 section-content-guard-borrowed-asset.spec 惯例：backend-root.js 在 ts-jest CJS 下
// 与模块包装器参数撞名 ⇒ 工厂 mock 绕过。
jest.mock('../../../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })

import { describe, it, expect } from '@jest/globals'
// @ts-ignore js 模块无类型声明
import { checkSectionExclusiveEvidence, healBorrowedEvidence } from '../section-content-guard.js'
// @ts-ignore js 模块无类型声明
import { pruneUnmountedResourceImports } from '../resource-import-guard.js'
// @ts-ignore js 模块无类型声明
import { assignSectionComponentNames } from '../section-tree.js'

const box = (x: number, y: number, w: number, h: number) => ({
  absoluteBoundingBox: { x, y, width: w, height: h },
})

/** 实锤复刻：`2:8417 > [2:8419(header) > 2:8856(icon)] + [2:8437(grid) > 2:8438(card)]` */
const FIGMA = {
  id: '2:8417', type: 'FRAME', name: 'cp-设备监测', ...box(0, 0, 340, 300),
  children: [
    {
      id: '2:8419', type: 'FRAME', name: 'header', ...box(0, 0, 340, 42),
      children: [
        { id: '2:8856', type: 'RECTANGLE', name: 'Frame', ...box(12, 12, 16, 16) },
      ],
    },
    {
      id: '2:8437', type: 'FRAME', name: 'card-grid', ...box(0, 50, 340, 240),
      children: [
        { id: '2:8438', type: 'FRAME', name: 'card', ...box(12, 60, 100, 100) },
      ],
    },
  ],
}

function buildPlan() {
  return {
    effectiveSections: [
      {
        id: '2:8417', type: 'layout', isLayoutContainer: true,
        sourceNodeIds: ['2:8417'],
        children: [
          {
            id: '2:8419', type: 'body',
            sourceNodeIds: ['2:8419', '2:8856'],
            children: [],
          },
          {
            id: '2:8437', type: 'body',
            sourceNodeIds: ['2:8437', '2:8438'],
            children: [],
          },
        ],
      },
    ],
  }
}

/** 资源归属 header（`2:8419`），却被 grid（`2:8437`）的组件引用 ⇒ 借用。 */
const MAPPING = [
  {
    figmaNodeId: '2:8856',
    resourceFile: '../resources/images/Frame-8856.png',
    ownerSectionId: '2:8419',
    assignedVarName: 'icon1',
    downloadStatus: 'success',
  },
]

const HEADER = `<template>
  <div data-section-id="2:8419" class="c-device-monitor-header">
    <span>设备监测</span>
  </div>
</template>`

/** grid 组件：对象数组字段值形态引用借用资源（实锤复刻 CardGrid.vue）。 */
function gridContent(): string {
  return `<template>
  <div data-section-id="2:8437" class="c-device-monitor-card-grid">
    <div v-for="(item, index) in deviceList" :key="index" class="card">
      <img :src="item.icon" :alt="item.label" />
      <span class="label">{{ item.label }}</span>
      <span class="value">{{ item.value }}</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import icon1 from '../../resources/images/Frame-8856.png'

const deviceList = ref([
  { label: '摄像机', value: '(2/484)', icon: icon1 },
  { label: '风速风向仪', value: '(1/484)', icon: icon1 },
])
</script>`
}

function nameOf(): Map<string, string> {
  return assignSectionComponentNames(buildPlan().effectiveSections as any)
}

function filesFor(grid: string): { path: string; content: string }[] {
  const names = nameOf()
  const headerName = names.get('2:8419')
  const gridName = names.get('2:8437')
  expect(headerName).toBeTruthy()
  expect(gridName).toBeTruthy()
  return [
    { path: `package/components/${headerName}.vue`, content: HEADER },
    { path: `package/components/${gridName}.vue`, content: grid },
  ]
}

function runHeal(grid: string) {
  const files = filesFor(grid)
  const res = healBorrowedEvidence({
    files,
    plan: buildPlan(),
    figmaRoot: FIGMA,
    resourceDomMapping: MAPPING,
    pruneUnmounted: pruneUnmountedResourceImports,
  })
  return { files, res }
}

describe('刀 57 借用资源·对象字面量字段值形态', () => {
  it('前置：检测端确实判出 1 条 borrowedAssetIssue（证明病灶是「有检测、无处置」）', () => {
    const r = checkSectionExclusiveEvidence({
      files: filesFor(gridContent()),
      plan: buildPlan(),
      figmaRoot: FIGMA,
      resourceDomMapping: MAPPING,
    })
    expect(r.borrowedAssetIssues).toHaveLength(1)
    expect(r.borrowedAssetIssues[0].resource).toBe('Frame-8856.png')
    expect(r.borrowedAssetIssues[0].sectionId).toBe('2:8437')
  })

  it('阳性：`icon: icon1` 字段被确定性删除 ⇒ healed.asset 非空（不再静默 0 处置）', () => {
    const { res } = runHeal(gridContent())
    expect(res.healed.asset).toHaveLength(1)
    expect(res.healed.asset[0].var).toBe('icon1')

    const grid = res.files.find((f) => f.path.endsWith('.vue') && f.content.includes('data-section-id="2:8437"'))
    expect(grid).toBeTruthy()
    expect(grid!.content).not.toContain('icon: icon1')
    // 同行的其它字段必须原样保留（不误伤）
    expect(grid!.content).toContain("label: '摄像机'")
    expect(grid!.content).toContain("value: '(2/484)'")
    expect(grid!.content).toContain("label: '风速风向仪'")
  })

  it('阳性：引用删净后，未挂载的 import 被就地剪掉（消除 RES-UNREF）', () => {
    const { res } = runHeal(gridContent())
    const grid = res.files.find((f) => f.content.includes('data-section-id="2:8437"'))!
    expect(grid.content).not.toContain("import icon1 from")
    // 剪 import 不得伤及其它 import
    expect(grid.content).toContain("import { ref } from 'vue'")
  })

  it('反向：字符串字面量里的同名（`label: \'icon1\'`）不算引用 ⇒ 不误删', () => {
    // 两行数据都只把 icon1 当作**字符串内容**出现（真引用已不存在）
    const grid = gridContent().replace(
      `  { label: '摄像机', value: '(2/484)', icon: icon1 },
  { label: '风速风向仪', value: '(1/484)', icon: icon1 },`,
      `  { label: 'icon1', value: '(2/484)' },
  { label: '风速风向仪', value: '(1/484)' },`,
    )
    const { res } = runHeal(grid)
    expect(res.healed.asset).toHaveLength(0)
    const out = res.files.find((f) => f.content.includes('data-section-id="2:8437"'))!
    expect(out.content).toContain("label: 'icon1'")
    expect(out.content).toContain("import icon1 from")
  })

  it('反向：值含嵌套字面量时只处理内层、不整块删外层字段', () => {
    const grid = gridContent().replace(
      "{ label: '摄像机', value: '(2/484)', icon: icon1 },",
      "{ label: '摄像机', meta: { icon: icon1 } },",
    )
    const { res } = runHeal(grid)
    expect(res.healed.asset).toHaveLength(1)
    const out = res.files.find((f) => f.content.includes('data-section-id="2:8437"'))!
    // 外层字段 `meta:` 保留（只清空了内层对象）
    expect(out.content).toContain('meta: {')
    expect(out.content).not.toContain('icon: icon1')
  })
})
