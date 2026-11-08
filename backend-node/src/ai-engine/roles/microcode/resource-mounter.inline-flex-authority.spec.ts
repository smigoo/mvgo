/**
 * 🧱 规则⑥ 边界单测（2026-11-08 · mc-1794130136557-0596cb3c 实锤）
 *
 * 病灶：确定性装配写的是**同层归一** `flex`（h/Σh，Σ=1），而 `sectionHeights` 是
 * **avg=1 量纲**（0.218/0.473/2.308）。规则⑥ 用后者覆盖前者 ⇒ 产物出现
 * `flex: 0.218 / 0.473 / 0.769`（前两段被覆盖、第三段保留装配值）⇒ 归一后 15%/32%/52%，
 * 真值应 7%/16%/77% ⇒ 统计条被拉到 121px、卡片区只剩 205px（4 行放不下）。
 *
 * 边界：`ctx.indexTemplateSource === 'deterministic-template'` ⇒ 规则⑥ 整条跳过；
 * 其他来源（LLM 自由发挥的 template）行为逐字不变。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

import { fixSectionHeightsForResource } from './resource-mounter.js'

const INDEX_VUE = `<template>
  <div class="c-demo-slot-con">
    <StatsSection style="flex: 0.073 1 0;min-height:0;" />
    <TabsSection style="flex: 0.157 1 0;min-height:0;" />
    <GridSection style="flex: 0.770 1 0;min-height:0;" />
  </div>
</template>
<script setup>
import StatsSection from './components/StatsSection.vue'
import TabsSection from './components/TabsSection.vue'
import GridSection from './components/GridSection.vue'
</script>
`

const FILES = {
  'package/index.vue': INDEX_VUE,
  'package/components/StatsSection.vue': '<template><div class="c-demo-stats">x</div></template>',
  'package/components/TabsSection.vue': '<template><div class="c-demo-tabs">x</div></template>',
  'package/components/GridSection.vue': '<template><div class="c-demo-grid">x</div></template>',
}

/** avg=1 量纲系数（与 planner applyFigmaHeightGrow 同口径） */
const SECTION_HEIGHTS = {
  'c-demo-stats': 0.218,
  'c-demo-tabs': 0.473,
  'c-demo-grid': 2.308,
}

const logger = { debug() {}, info() {}, warn() {} }

function run(extraCtx) {
  return fixSectionHeightsForResource(
    INDEX_VUE,
    { path: 'package/index.vue', files: FILES, sectionHeights: SECTION_HEIGHTS, logger, ...extraCtx },
    { logger },
  )
}

describe('规则⑥ 与确定性装配的量纲边界', () => {
  test('装配产出（deterministic-template）⇒ 内联 flex 逐字保留，不被 avg=1 系数覆盖', () => {
    const out = run({ indexTemplateSource: 'deterministic-template' })
    expect(out).toContain('flex: 0.073 1 0')
    expect(out).toContain('flex: 0.157 1 0')
    expect(out).toContain('flex: 0.770 1 0')
    expect(out).not.toContain('flex: 2.308')
  })

  test('LLM 模板（无装配来源）⇒ 仍按 sectionHeights 权威化（既有行为不变）', () => {
    const out = run({})
    expect(out).toContain('flex: 2.308 1 0')
  })

  test('显式非装配来源同样保持既有行为', () => {
    const out = run({ indexTemplateSource: 'llm' })
    expect(out).toContain('flex: 2.308 1 0')
  })
})
