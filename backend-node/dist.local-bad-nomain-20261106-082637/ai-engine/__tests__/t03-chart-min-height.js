/**
 * T03: 图表容器 min-height 注入测试
 * #577：主图/紧凑图区分兜底，避免小环图/卡片内图被 160px 撑裂。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { injectChartMinHeight, inferChartMinHeight } from '../utils/post-process.js'

test('T03-A: 普通 chart 容器自动注入主图 min-height: 160px', () => {
  const mockCode = `<template>
  <div class="c-monitor-chart-container" ref="chartRef"></div>
</template>

<style lang="less" scoped>
.c-monitor-chart-container {
  width: 100%;
  flex: 1;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  assert.ok(
    result.includes('min-height: 160px'),
    '普通 chart 容器应自动注入主图兜底 min-height: 160px'
  )
})

test('T03-B: 已有 min-height 时不重复注入', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-chart-container {
  min-height: 300px;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  const minHeightCount = (result.match(/min-height/g) || []).length
  assert.strictEqual(minHeightCount, 1, '不应重复注入 min-height')
})

test('T03-C: 非 chart 容器不注入', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-header {
  width: 100%;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  assert.ok(
    !result.includes('min-height'),
    '非 chart 容器不应注入 min-height'
  )
})

test('T03-D: 多个 chart 容器分别注入', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-chart1 {
  flex: 1;
}
.c-monitor-chart2 {
  flex: 1;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  const minHeightCount = (result.match(/min-height:\s*160px/g) || []).length
  assert.strictEqual(minHeightCount, 2, '多个普通 chart 容器应分别注入 160px')
})

test('T03-E: donut/mini/compact chart 使用紧凑兜底 100px', () => {
  assert.strictEqual(inferChartMinHeight('c-panel-donut-chart', ''), 100)
  assert.strictEqual(inferChartMinHeight('chart-mini-gauge', ''), 100)
  assert.strictEqual(inferChartMinHeight('c-panel-main-chart', ''), 160)

  const mockCode = `<style lang="less" scoped>
.c-traffic-donut-chart {
  flex: 0.77 1 0;
}
.chart-mini-trend {
  flex: 0 0 auto;
}
</style>`
  const result = injectChartMinHeight(mockCode)
  assert.ok(result.includes('min-height: 100px'), '紧凑图应注入 100px')
  assert.ok(!result.includes('min-height: 160px'), '紧凑图不应被 160px 撑裂')
})

test('T03-F: 非图表容器（title/legend/icon/section 根）不注入 min-height', () => {
  // 🛡️ R4-a（2026-09-15）：chart-title/chart-legend/chart-bridge 等是图表「标题/图例/
  // section 根」而非 echarts 挂载容器，此前被 `chart[\w-]*` 全量匹配误注 160px 撑裂布局。
  const mockCode = `<style lang="less" scoped>
.c-traffic-monitor-chart-bridge {
  display: flex;
  flex-direction: column;
}
.c-traffic-monitor-chart-title {
  display: flex;
  align-items: center;
}
.c-traffic-monitor-chart-title-icon {
  width: 3px;
}
.c-traffic-monitor-chart-title-text {
  font-size: 14px;
}
.c-traffic-monitor-chart-legend {
  gap: 4px;
}
.c-traffic-monitor-chart-legend-item {
  opacity: 1;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  assert.ok(!result.includes('min-height'), '标题/图例/图标/section 根不应注入 min-height')
})

test('T03-G: 真图表容器（-chart-container / chart 结尾）仍正常注入', () => {
  const mockCode = `<style lang="less" scoped>
.c-traffic-monitor-chart-container {
  flex: 1 1 0;
}
.c-traffic-monitor-flow-chart {
  width: 100%;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  assert.ok(result.includes('min-height: 160px'), '真图表容器应注入主图 160px')
  const count = (result.match(/min-height:\s*160px/g) || []).length
  assert.strictEqual(count, 2, '两个真图表容器应分别注入 160px')
})

test('T03-H: min-height:0 不算保护，且后置 0 值块不得反杀（真机 mc-1789446004258-677a6725）', () => {
  // 🛡️ T2-C/T2-D（2026-09-15）：真机 ChartSection 形态 —— LLM 按 chart-standards 示例写
  // `min-width:0; min-height:0`，旧守卫 `/min-height/` 当已保护 → 跳过注入；
  // 兜底块又建在 @import 后（顶部）→ 后置 0 值块级联反杀 → 图表不显示。
  // 真机产物三个块：兜底块(160) + section 块(0) + LLM 原始块(0)，后者在文件末尾。
  const mockCode = `<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-container {
  min-height: 160px;
}

.c-env-monitor-chart-section {  width: 100%;
min-height: 0}

.c-env-monitor-chart-container {min-width: 0;
  min-height: 0}
</style>`

  const result = injectChartMinHeight(mockCode)

  // 取出该 class 的全部规则块，断言无一残留 0 值（否则级联反杀兜底值）
  const blocks = result.match(/\.c-env-monitor-chart-container\s*\{[^}]*\}/g) || []
  assert.ok(blocks.length >= 1, '应能取出图表容器规则块')
  for (const b of blocks) {
    assert.ok(
      !/min-height\s*:\s*(?:0|0px|auto)\b/.test(b),
      `图表容器块不得残留 min-height:0（会反杀兜底值）：${b}`,
    )
  }
  assert.ok(
    result.includes('min-height: 160px'),
    'min-height:0 必须被视作未保护并注入兜底值',
  )
  // 非图表容器（section 根）不在黑名单外，不应被误改
  assert.ok(
    /\.c-env-monitor-chart-section\s*\{[^}]*min-height:\s*0/.test(result),
    '图表 section 根仍是普通布局容器，其 min-height:0 应保留',
  )
})

test('T03-I: 已有非零 min-height 仍尊重不覆盖', () => {
  const mockCode = `<style lang="less" scoped>
.c-monitor-chart-container {
  min-height: 240px;
}
</style>`

  const result = injectChartMinHeight(mockCode)

  assert.ok(result.includes('min-height: 240px'), '真实 Figma 尺寸应保留')
  assert.ok(!result.includes('160px'), '不应覆盖已有非零 min-height')
})
