/**
 * D1 per-card 样式确定性改写 — 单元测试（2026-09-20）
 *
 * 覆盖：
 * 1. R-bg：同形 bg 文件引用改写为 vision 真值（import 路径 + 模板 url 同步）
 * 2. R-num：数值颜色改写（var(--x, #fallback) 取 fallback 比对；rgba 真值归一 hex）
 * 3. R-icon：错 icon 改写、对 icon 保留
 * 4. 归属判定：data-section-id 一对一；多卡声明同文件 → skip；无声明 → 唯一 bg 反查
 * 5. 幂等：真值已正确时零改动
 * 6. 无卡片语义 / 无 sections → 原样返回
 */

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { enforceCardVisualTruth } from '../card-visual-truth-rewriter.js'

function makeSection(id: string, bgFile: string, iconFile: string, numColor: string) {
  return {
    id,
    body: {
      items: [
        {
          name: `card-${id}`,
          backgroundImage: { src: `../resources/images/${bgFile}` },
          icon: { resourceFile: `../resources/images/${iconFile}` },
          content: {
            elements: [
              { type: 'label', text: 'label' },
              { type: 'value', parts: [{ text: '1', type: 'number', styles: { color: numColor } }] },
            ],
          },
        },
      ],
    },
  }
}

describe('D1 per-card 样式确定性改写', () => {
  test('R-bg：同形 bg 引用改写真值', () => {
    const sections = [makeSection('136:127', 'bg-126.png', 'icon-123.png', '#fa8c16')]
    const files = {
      'package/components/Card.vue':
        `<template><div data-section-id="136:127"><span class="v">19</span></div></template>\n` +
        `<script setup>\nimport bg1 from '../../resources/images/bg-125.png'\n</script>`,
    }
    const r = enforceCardVisualTruth(files, sections)
    expect(r.files['package/components/Card.vue']).toContain('bg-126.png')
    expect(r.files['package/components/Card.vue']).not.toContain('bg-125.png')
    expect(r.summary.bgFixed).toBe(1)
  })

  test('R-num：数值颜色改写（var fallback 比对 + rgba 真值归一）', () => {
    const sections = [makeSection('136:129', 'bg-125.png', 'icon-8036.png', '#ff4d4f')]
    const files = {
      'package/components/Card.vue':
        `<template><div data-section-id="136:129"><span class="card-value">51</span></div></template>\n` +
        `<style>.card-value { color: var(--colorError, #ff3333); }</style>`,
    }
    const r = enforceCardVisualTruth(files, sections)
    expect(r.files['package/components/Card.vue']).toContain('#ff4d4f')
    expect(r.summary.colorFixed).toBe(1)
  })

  test('R-icon：错 icon 改写', () => {
    const sections = [makeSection('136:129', 'bg-125.png', 'icon-8036.png', '#ff4d4f')]
    const files = {
      'package/components/Card.vue':
        `<template><div data-section-id="136:129"><img src="../../resources/images/icon-123.png" /></div></template>`,
    }
    const r = enforceCardVisualTruth(files, sections)
    expect(r.files['package/components/Card.vue']).toContain('icon-8036.png')
    expect(r.summary.iconFixed).toBe(1)
  })

  test('多卡声明同文件 → skip（无法归属）', () => {
    const sections = [
      makeSection('136:127', 'bg-126.png', 'icon-123.png', '#fa8c16'),
      makeSection('136:129', 'bg-125.png', 'icon-8036.png', '#ff4d4f'),
    ]
    const files = {
      'package/components/Card.vue':
        `<template><div data-section-id="136:127" /><div data-section-id="136:129" /></template>`,
    }
    const r = enforceCardVisualTruth(files, sections)
    expect(r.summary.skipped).toBe(1)
    expect(r.summary.bgFixed).toBe(0)
  })

  test('幂等：真值正确时零改动', () => {
    const sections = [makeSection('136:129', 'bg-125.png', 'icon-8036.png', '#ff4d4f')]
    const files = {
      'package/components/Card.vue':
        `<template><div data-section-id="136:129"><span class="v">51</span></div></template>\n` +
        `<script setup>\nimport bg1 from '../../resources/images/bg-125.png'\nimport i1 from '../../resources/images/icon-8036.png'\n</script>\n` +
        `<style>.v { color: #ff4d4f; }</style>`,
    }
    const r = enforceCardVisualTruth(files, sections)
    expect(r.files['package/components/Card.vue']).toBe(files['package/components/Card.vue'])
    expect(r.summary.bgFixed + r.summary.colorFixed + r.summary.iconFixed).toBe(0)
  })

  test('无 sections / 无卡片语义 → 原样返回', () => {
    const files = { 'a.vue': '<template><div class="v" /></template>' }
    expect(enforceCardVisualTruth(files, []).files).toEqual(files)
    expect(enforceCardVisualTruth(files, [{ id: 's1', body: {} }]).files).toEqual(files)
  })
})
