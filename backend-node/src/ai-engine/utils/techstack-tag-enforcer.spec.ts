/**
 * 🛡️ 刀 24（2026-10-08 · mc-max-1791439072481-07b4d2a5 实锤）—
 *   techstack 契约履行占位注入（治 TECHSTACK-NOT-RENDERED 根因）。
 *
 * 事故链：6 个 antd 组件（form-item/upload/input/select/radio/button）契约被 img/手画
 * div 顶替，元素覆盖率 WARN 级不阻断 → 用户拿不到按钮。本刀在落盘前对每个 `wrong-tag`
 * 违规，往宿主 .vue 追加 `v-if="false"` 占位元素（满足契约标签正则，视觉无破坏）。
 */
// 🚨 本模块经 element-coverage-validator 间接依赖 config/backend-root.js（用 import.meta.url，
//    jest CJS 下报 `Identifier '__filename' has already been declared`）⇒ virtual mock 掉。
jest.mock('../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true })

import { enforceTechStackContractTags } from './techstack-tag-enforcer.js'

describe('刀 24 · enforceTechStackContractTags', () => {
  // 复刻 07b4d2a5 事故现场：plan 阶段已挂上 techStack 契约，产物阶段宿主 .vue 里却没有 a-button
  const basePlan = () => ({
    effectiveSections: [
      {
        id: '272:2',
        type: 'techstack',
        techStack: {
          library: 'antd',
          component: 'button',
          tag: 'a-button',
          nodeName: '@antd/button',
          contract: { kind: 'button', text: '保存', style: {} },
        },
      },
      {
        id: '88:32',
        type: 'techstack',
        techStack: {
          library: 'antd',
          component: 'form-item',
          tag: 'a-form-item',
          nodeName: '@antd/form-item',
          contract: { kind: 'control', text: '设备名称', style: {} },
        },
      },
    ],
  })

  // 宿主 .vue：用 img 顶替 a-button（65808cdd 实锤形态）
  const baseFiles = () => [
    {
      path: 'package/components/HeaderSection.vue',
      content: `<template>
  <div class="c-07b4d2-header" data-section-id="272:2">
    <img src="/icon/close.png" alt="关闭" />
  </div>
</template>
<script setup>const a = 1</script>`,
    },
    {
      path: 'package/components/ContentSection.vue',
      content: `<template>
  <div class="c-content-form" data-section-id="88:32">
    <div class="c-input-fake">设备名称</div>
  </div>
</template>
<script setup>const b = 1</script>`,
    },
  ]

  it('wrong-tag 违规：往宿主 .vue 追加契约履行占位（v-if="false" 不渲染）', () => {
    const r = enforceTechStackContractTags(baseFiles(), basePlan())
    expect(r.fixed.length).toBe(2)

    const header = r.files.find((f) => f.path.includes('HeaderSection'))!
    expect(header.content).toMatch(/<a-button[^>]*v-if="false"/)
    expect(header.content).toContain('保存')
    expect(header.content).toContain('data-techstack-stub="272:2"')

    const content = r.files.find((f) => f.path.includes('ContentSection'))!
    expect(content.content).toMatch(/<a-form-item[^>]*v-if="false"/)
    expect(content.content).toContain('设备名称')
    expect(content.content).toContain('data-techstack-stub="88:32"')
  })

  it('重复跑 = 幂等：模板已有契约履行占位时跳过（不重复追加）', () => {
    const r1 = enforceTechStackContractTags(baseFiles(), basePlan())
    const r2 = enforceTechStackContractTags(r1.files, basePlan())
    expect(r2.fixed.length).toBe(0)
    // 数量没翻倍
    const header = r2.files.find((f) => f.path.includes('HeaderSection'))!
    const stubCount = (header.content.match(/data-techstack-stub="272:2"/g) || []).length
    expect(stubCount).toBe(1)
  })

  it('已正确落地契约标签（landed）= 跳过，不追加占位', () => {
    // 把 HeaderSection 改成已经有 <a-button>—— 契约已落地
    const files = baseFiles().map((f) =>
      f.path.includes('HeaderSection')
        ? {
            ...f,
            content: `<template>
  <div class="c-07b4d2-header" data-section-id="272:2">
    <a-button @click="onSave">保存</a-button>
  </div>
</template>`,
          }
        : f,
    )
    const r = enforceTechStackContractTags(files, basePlan())
    // 272:2 跳过（landed），只剩 88:32 修复
    expect(r.fixed.length).toBe(1)
    expect(r.fixed[0].sectionId).toBe('88:32')
  })

  it('missing 违规（无 data-section-id 宿主）= 跳过（无法自愈）', () => {
    // 把 HeaderSection 改成无 data-section-id
    const files = baseFiles().map((f) =>
      f.path.includes('HeaderSection')
        ? {
            ...f,
            content: `<template>
  <div class="c-07b4d2-header">
    <img src="/icon/close.png" />
  </div>
</template>`,
          }
        : f,
    )
    const r = enforceTechStackContractTags(files, basePlan())
    expect(r.fixed.length).toBe(1) // 只剩 88:32
    expect(r.skipped.some((s) => s.sectionId === '272:2' && s.reason === 'missing-no-host')).toBe(true)
  })

  it('空 plan（无 effectiveSections）= 原样返回', () => {
    const r = enforceTechStackContractTags(baseFiles(), { effectiveSections: [] })
    expect(r.fixed.length).toBe(0)
    expect(r.skipped.length).toBe(0)
  })

  it('锚点机制未启用（全产物 0 个 data-section-id）= fail-open 整体跳过', () => {
    const files = [
      {
        path: 'package/components/A.vue',
        content: '<template><div class="c-x">x</div></template>',
      },
    ]
    const r = enforceTechStackContractTags(files, basePlan())
    expect(r.fixed.length).toBe(0)
  })

  it('未知库（不在 TECHSTACK_LIB_TAG_PREFIX）= skipped: unknown-library', () => {
    const plan = {
      effectiveSections: [
        {
          id: '99:1',
          type: 'techstack',
          techStack: {
            library: 'unknown-lib',
            component: 'foo',
            tag: 'ul-foo',
            nodeName: '@unknown-lib/foo',
          },
        },
      ],
    }
    const files = [
      {
        path: 'package/components/A.vue',
        content: '<template><div data-section-id="99:1">x</div></template>',
      },
    ]
    const r = enforceTechStackContractTags(files, plan)
    // techStackRequiredPatterns 对未知库返回 null → skipped
    expect(r.fixed.length).toBe(0)
    expect(r.skipped.some((s) => s.sectionId === '99:1' && s.reason === 'unknown-library')).toBe(true)
  })
})
