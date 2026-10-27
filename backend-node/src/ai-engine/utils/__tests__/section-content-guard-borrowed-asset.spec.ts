/**
 * 🛡️ 刀 10（2026-10-27 · mc-max-1793096891762-ad8939a5 实锤）：借用资源守卫的
 * 「祖先视觉包含」豁免。
 *
 * 事故链：刀 4 接管叶 `36:1726`（Mask group，与直接父级 `36:1725` bbox 全等）按真值
 * 借用父级图片 img-1725.png 渲染（import img1 + :src="img1"）⇒ 内容守卫判「借用」
 * ⇒ healBorrowedEvidence 剪 import + 摘 :src ⇒ 产物图片丢失（空白框）。
 *
 * 判据：资源归属节点是本 section 锚点的祖先 ∧ 归属节点 bbox 包含锚点 bbox ⇒ 合法（视觉包含）。
 * 反向：兄弟/他处 subtree 的资源照判借用；合成 sid（不在 Figma 树）不适用豁免。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（同 code-structure-validator.spec 惯例）。
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
import { checkSectionExclusiveEvidence } from '../section-content-guard.js'
// @ts-ignore js 模块无类型声明
import { assignSectionComponentNames } from '../section-tree.js'

const box = (x: number, y: number, w: number, h: number) => ({
  absoluteBoundingBox: { x, y, width: w, height: h },
})

/** 实锤复刻：801:3 > 36:1725(img) > 36:1726(Mask) > 36:1729(image)，兄弟 36:1900 区块 */
const FIGMA = {
  id: '36:1693', type: 'FRAME', name: 'root', ...box(0, 0, 603, 555),
  children: [
    {
      id: '801:3', type: 'GROUP', name: 'slot-icon', ...box(28, 35, 547, 493),
      children: [
        {
          id: '36:1725', type: 'GROUP', name: 'img', ...box(28, 35, 98, 98),
          children: [
            {
              id: '36:1726', type: 'GROUP', name: 'Mask group', ...box(28, 35, 98, 98),
              children: [
                { id: '36:1729', type: 'RECTANGLE', name: 'image 473932', ...box(28, 35, 98, 98) },
              ],
            },
          ],
        },
        { id: '36:1724', type: 'TEXT', name: 'GD-Robot-04', characters: 'GD-Robot-04', ...box(147, 50, 147, 24) },
      ],
    },
    {
      id: '36:1900', type: 'FRAME', name: 'other-block', ...box(28, 300, 547, 100),
      children: [
        { id: '36:1901', type: 'TEXT', name: '说明', characters: '说明文字', ...box(28, 300, 60, 16) },
      ],
    },
  ],
}

function buildPlan() {
  return {
    effectiveSections: [
      {
        id: '801:3', type: 'body', isLayoutContainer: true,
        sourceNodeIds: ['801:3', '36:1725', '36:1726', '36:1729', '36:1724'],
        children: [
          { id: '36:1726', type: 'body', sourceNodeIds: ['36:1726', '36:1729'] },
          { id: '36:1900', type: 'body', sourceNodeIds: ['36:1900', '36:1901'] },
        ],
      },
    ],
  }
}

const MAPPING = [
  {
    figmaNodeId: '36:1725',
    resourceFile: '../resources/images/img-1725.png',
    ownerSectionId: '801:3',
    assignedVarName: 'img1',
    downloadStatus: 'success',
  },
]

function vueContent() {
  return `<template>
  <div class="c-x-fg-icon-361726">
    <img :src="img1" alt="" style="width:98px;height:98px;" />
  </div>
</template>
<script setup>
import img1 from '../../resources/images/img-1725.png'
</script>`
}

function filesFor(): { path: string; content: string }[] {
  const plan = buildPlan()
  const nameOf = assignSectionComponentNames(plan.effectiveSections as any)
  const leafName = nameOf.get('36:1726')
  const otherName = nameOf.get('36:1900')
  expect(leafName).toBeTruthy()
  expect(otherName).toBeTruthy()
  return [
    { path: `package/components/${leafName}.vue`, content: vueContent() },
    { path: `package/components/${otherName}.vue`, content: `<template><div>说明文字</div></template>` },
  ]
}

describe('刀 10 借用资源·祖先视觉包含豁免', () => {
  it('阳性（实锤复刻）：父级图片由同 bbox Mask 叶接管组件渲染 ⇒ 不判借用', () => {
    const r = checkSectionExclusiveEvidence({
      files: filesFor(),
      plan: buildPlan(),
      figmaRoot: FIGMA,
      resourceDomMapping: MAPPING,
    })
    expect(r.borrowedAssetIssues).toHaveLength(0)
  })

  it('反向：兄弟区块引用该图片 ⇒ 照判借用（豁免不误放）', () => {
    const plan = buildPlan()
    const nameOf = assignSectionComponentNames(plan.effectiveSections as any)
    const files = filesFor()
    // 把 img 引用挪到兄弟区块组件里
    files[1] = {
      path: files[1].path,
      content: `<template><div><img :src="img1" /></div></template>
<script setup>
import img1 from '../../resources/images/img-1725.png'
</script>`,
    }
    // 叶子组件不再引用
    files[0] = { path: files[0].path, content: `<template><div>仅文字</div></template>` }
    const r = checkSectionExclusiveEvidence({
      files, plan, figmaRoot: FIGMA, resourceDomMapping: MAPPING,
    })
    expect(r.borrowedAssetIssues).toHaveLength(1)
    expect(r.borrowedAssetIssues[0].resource).toBe('img-1725.png')
    expect(r.borrowedAssetIssues[0].sectionId).toBe('36:1900')
  })

  it('反向：祖先归属但 bbox 不包含锚点 ⇒ 不适用豁免（照判借用）', () => {
    // 把资源挂到 801:3 的兄弟容器（是 36:1726 的「非祖先」不够，改成：资源节点是祖先
    // 但 bbox 小于锚点 ⇒ 不构成视觉包含）。构造：img 节点 bbox 只有 10x10，Mask 叶 98x98。
    const figma2 = JSON.parse(JSON.stringify(FIGMA))
    figma2.children[0].children[0].absoluteBoundingBox = { x: 28, y: 35, width: 10, height: 10 }
    const r = checkSectionExclusiveEvidence({
      files: filesFor(),
      plan: buildPlan(),
      figmaRoot: figma2,
      resourceDomMapping: [
        { ...MAPPING[0], figmaNodeId: '36:1725' },
      ],
    })
    expect(r.borrowedAssetIssues).toHaveLength(1)
  })
})
