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
