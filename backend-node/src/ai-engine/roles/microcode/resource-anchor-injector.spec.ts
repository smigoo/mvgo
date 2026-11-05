/**
 * 🛡️ α3（2026-11-05 · `c-env-monitor-c324a730` 实锤）：资源宿主锚点补标单测。
 *
 * fixture 全部取自真机：
 *   - sections 树 = `.checkpoint/analysis.json` 的 effectiveSections（89:41 → body.children
 *     [89:42, chart-container]；89:42.children = [2:7889, 89:43, 2:7949]）
 *   - 模板 = 挂载前 chunk `5-package_components_MainSection.vue` 的结构
 *     （`.c-env-monitor-main` 下 [sub-t, chart]；sub-t 下 [tab, tabs-icon, num]）
 */
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { injectResourceAnchors } from './resource-anchor-injector.js'
import {
  buildResourceMountPlan,
  mountPlannedResources,
  findTagBySectionAnchor,
} from './resource-mount-plan.js'

const bgEntry = (over: any) => ({
  previewAnalysisRole: 'bg',
  downloadStatus: 'success',
  ...over,
})

const sections: any[] = [
  {
    id: '89:41',
    type: 'body',
    elementCount: 11,
    sourceNodeIds: ['89:41', '89:42'],
    figmaBox: { x: 1495, y: 898, width: 380, height: 145 },
    body: {
      layout: 'vertical',
      children: [
        {
          id: '89:42',
          name: 'Tab切换栏',
          role: 'tabs',
          layout: 'horizontal',
          bgPlaceholder: 'section-bg-89-42',
          children: [
            {
              id: '2:7889',
              name: 'Tab列表',
              role: 'tab-list',
              layout: 'horizontal',
              bgResource: '../resources/images/bg-7890.png',
              children: [
                { id: '2:7890', name: '一氧化碳', role: 'tab', type: 'tab', active: true },
                { id: '2:7891', name: '能见度', role: 'tab' },
                { id: '2:7892', name: '洞内照明', role: 'tab' },
                { id: '2:7893', name: '洞外光强', role: 'tab' },
              ],
            },
            { id: '89:43', name: '图标按钮组', role: 'icon-group', children: [] },
            { id: '2:7949', name: '数量角标', role: 'badge' },
          ],
        },
        { id: 'chart-container', name: '一氧化碳浓度图表', role: 'chart', type: 'area' },
      ],
    },
  },
]

const mapping = [
  bgEntry({
    assignedVarName: 'bg1',
    resourceFile: '../resources/images/bg-7890.png',
    figmaNodeId: '2:7890',
    ownerSectionId: '2:7889',
    ancestorIds: ['2:7889', '89:42', '89:41', '2:7879'],
    mountTarget: 'tabs-list',
    bgRole: 'container',
    figmaBox: { x: 1495, y: 903, width: 295, height: 27 },
    parentBox: { x: 1495, y: 903, width: 295, height: 27 },
  }),
]

const MAIN_VUE = `<template>
  <div class="c-env-monitor-main" data-section-id="89:41">
    <div class="c-env-monitor-sub-t">
      <div class="c-env-monitor-tab">
        <div v-for="tab in tabs" :key="tab.value" class="c-env-monitor-tab-item">
          <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
        </div>
      </div>
      <div class="c-env-monitor-tabs-icon">
        <img :src="icon2" />
      </div>
      <div class="c-env-monitor-num"><span>6</span></div>
    </div>
    <div class="c-env-monitor-chart"><div ref="chartRef"></div></div>
  </div>
</template>
<script setup>
const tabs = []
</script>
`

const allFilesOf = () => ({
  'package/index.vue':
    '<template>\n  <div class="c-env-monitor-slot-con"></div>\n</template>\n',
  'package/components/MainSection.vue': MAIN_VUE,
})

describe('injectResourceAnchors（α3 结构对位补标）', () => {
  it('阳性：2:7889 补标到 .c-env-monitor-tab（真机形态）', () => {
    const files = allFilesOf()
    const stats = injectResourceAnchors(files, sections, mapping)
    expect(stats.injected).toBe(1)
    expect(stats.skippedCountMismatch).toBe(0)
    const main = files['package/components/MainSection.vue']
    expect(main).toContain('<div class="c-env-monitor-tab" data-resource-anchor="2:7889">')
    // 不污染 data-section-id（红线：code-generator.js:776）
    expect(main.match(/data-section-id=/g)).toHaveLength(1)
  })

  it('幂等：已补标/已有锚点 → skippedAnchored，不重复注入', () => {
    const files = allFilesOf()
    injectResourceAnchors(files, sections, mapping)
    const once = files['package/components/MainSection.vue']
    const stats2 = injectResourceAnchors(files, sections, mapping)
    expect(stats2.injected).toBe(0)
    expect(stats2.skippedAnchored).toBe(1)
    expect(files['package/components/MainSection.vue']).toBe(once)
  })

  it('数量不等（LLM 加了 wrapper）→ skippedCountMismatch 弃权', () => {
    const files = allFilesOf()
    files['package/components/MainSection.vue'] = MAIN_VUE.replace(
      '    <div class="c-env-monitor-chart">',
      '    <div class="c-env-monitor-chart-wrap"><div class="inner"></div></div>\n    <div class="c-env-monitor-chart">',
    )
    const stats = injectResourceAnchors(files, sections, mapping)
    expect(stats.injected).toBe(0)
    expect(stats.skippedCountMismatch).toBe(1)
  })

  it('语义零交集（落笔层对位到无关元素）→ skippedSemanticMiss 弃权', () => {
    const files = allFilesOf()
    // 把 tab 换成与 2:7889(role=tab-list) 无词集交集的 class
    files['package/components/MainSection.vue'] = MAIN_VUE.replace(
      '<div class="c-env-monitor-tab">',
      '<div class="c-env-monitor-zone">',
    )
    const stats = injectResourceAnchors(files, sections, mapping)
    expect(stats.injected).toBe(0)
    expect(stats.skippedSemanticMiss).toBe(1)
  })

  it('owner 不在 section 树 → skippedNoRoot', () => {
    const files = allFilesOf()
    const stats = injectResourceAnchors(files, sections, [
      bgEntry({
        assignedVarName: 'bg9',
        resourceFile: 'bg-x.png',
        ownerSectionId: '9:9999',
        downloadStatus: 'success',
      }),
    ])
    expect(stats.injected).toBe(0)
    expect(stats.skippedNoRoot).toBe(1)
  })
})

describe('findTagBySectionAnchor 次优先级识别 data-resource-anchor', () => {
  it('data-section-id miss 时落到 data-resource-anchor', () => {
    const html = '<div><div class="tab" data-resource-anchor="2:7889"></div></div>'
    const tag = findTagBySectionAnchor(html, '2:7889')
    expect(tag).toContain('class="tab"')
  })

  it('data-section-id 优先于 data-resource-anchor（既有行为不变）', () => {
    const html =
      '<div class="sec" data-section-id="2:7889"></div><div class="res" data-resource-anchor="2:7889"></div>'
    const tag = findTagBySectionAnchor(html, '2:7889')
    expect(tag).toContain('class="sec"')
  })
})

describe('α3 端到端：补标 → 计划 → 挂载（bg1 落到 tab 栏，不再 fail-closed）', () => {
  it('bg1 经 data-resource-anchor 精确挂到 .c-env-monitor-tab，段根零改动', () => {
    const files = allFilesOf()
    const stats = injectResourceAnchors(files, sections, mapping)
    expect(stats.injected).toBe(1)

    // 与生产同口径收集锚点（microcode-engineer._mountPlannedResources 的双属性正则）
    const productAnchorIds = new Set<string>()
    for (const c of Object.values(files)) {
      for (const m of String(c).matchAll(/data-(?:section-id|resource-anchor)="([^"]+)"/g)) {
        productAnchorIds.add(m[1])
      }
    }
    const plan = buildResourceMountPlan(sections, mapping, { productAnchorIds })
    const m = plan.byFile.get('../resources/images/bg-7890.png').mounts[0]
    expect(m.sectionAnchorId).toBe('2:7889')
    expect(m.anchorPromotionRejected).toBe(false)

    const before = files['package/components/MainSection.vue']
    const { mounted } = mountPlannedResources(files, plan, {})
    const after = files['package/components/MainSection.vue']

    expect(mounted.map((x: any) => x.var)).toContain('bg1')
    // bg1 绑定落在 tab 栏元素上（data-resource-anchor 所在标签），不在段根
    expect(after).toMatch(/class="c-env-monitor-tab" data-resource-anchor="2:7889"[^>]*bg1|bg1[^>]*class="c-env-monitor-tab" data-resource-anchor="2:7889"/s)
    // 段根没有被挂 bg1（旧实锤的错挂形态）
    const rootTag = after.slice(after.indexOf('c-env-monitor-main'), after.indexOf('>', after.indexOf('c-env-monitor-main')) + 1)
    expect(rootTag).not.toContain('bg1')
    void before
  })
})
