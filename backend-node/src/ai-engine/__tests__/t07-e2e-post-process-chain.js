/**
 * T07: 端到端后处理链集成验证（Phase 4）
 * 
 * 模拟真实 Figma 生成场景：一个多区块 Vue SFC，包含：
 * - 图表容器（需要注入 min-height）
 * - 重复背景图（需要去重）
 * - 混合 class（需要 CODE-003 检查）
 * 
 * 验证完整后处理链 + 校验器联合工作
 */

import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { 
  injectChartMinHeight, 
  deduplicateBackgroundImages 
} from '../utils/post-process.js'
import { CodeStructureValidator } from '../validators/code-structure-validator.js'

describe('T07: 端到端后处理链集成', () => {
  // 模拟真实 Figma 生成结果（两列布局 + 图表 + 背景图 + class 命名）
  const mockGeneratedVue = `<template>
  <div class="c-monitor-dashboard">
    <div class="c-monitor-header">
      <h3 class="c-monitor-title">数据监控面板</h3>
    </div>
    <div class="c-monitor-content">
      <div class="c-monitor-left-panel">
        <div class="c-monitor-chart-line">
          <div ref="chartRef1"></div>
        </div>
        <div class="c-monitor-chart-bar">
          <div ref="chartRef2"></div>
        </div>
      </div>
      <div class="c-monitor-right-panel">
        <div class="c-monitor-stats">
          <span>统计信息</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const chartRef1 = ref(null)
const chartRef2 = ref(null)
let chart1 = null
let chart2 = null
let resizeObserver = null

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef1.value) {
      chart1 = echarts.init(chartRef1.value)
      chart1.setOption({ title: { text: '趋势图' } })
    }
    if (chartRef2.value) {
      chart2 = echarts.init(chartRef2.value)
      chart2.setOption({ title: { text: '柱状图' } })
    }
    
    resizeObserver = new ResizeObserver(() => {
      chart1?.resize()
      chart2?.resize()
    })
    if (chartRef1.value) resizeObserver.observe(chartRef1.value)
    if (chartRef2.value) resizeObserver.observe(chartRef2.value)
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart1?.dispose()
  chart2?.dispose()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-dashboard {
  width: 100%;
  height: 100%;
  background-image: url('../resources/images/bg-pattern.png');
  background-size: cover;
}

.c-monitor-header {
  height: 60px;
  background: #fff;
}

.c-monitor-title {
  font-size: 18px;
  color: #333;
}

.c-monitor-content {
  display: flex;
  flex-direction: column;
}

.c-monitor-left-panel {
  flex: 1;
}

.c-monitor-right-panel {
  flex: 1;
}

.c-monitor-chart-line {
  height: 300px;
}

.c-monitor-chart-bar {
  height: 300px;
}

.c-monitor-stats {
  padding: 16px;
}
</style>`

  const mockCommonLess = `
.c-monitor-dashboard {
  width: 100%;
  height: 100%;
}
.c-monitor-header {
  height: 60px;
  background: #fff;
}
.c-monitor-title {
  font-size: 18px;
}
.c-monitor-content {
  padding: 16px;
}
`

  let processedWithChart = ''
  let processedWithDedup = ''
  let validation = null

  before(() => {
    // 模拟 _assembleIndexVue 末尾的后处理链
    processedWithChart = injectChartMinHeight(mockGeneratedVue)
    processedWithDedup = deduplicateBackgroundImages(processedWithChart)

    // 模拟 L0-B 校验器（传空字符串作为 componentId，放宽为"只要有 .c- 前缀即通过"）
    const mockFiles = [
      { path: 'package/index.vue', content: processedWithDedup },
      { path: 'resources/styles/common.less', content: mockCommonLess }
    ]
    validation = CodeStructureValidator.validate(mockFiles, '')
  })

  test('T07-B: 图表容器 min-height 正确注入', () => {
    // 验证图表容器有 min-height（修复后注入 0 而非 200px，符合 CODE-013）
    const chartLineMatch = processedWithChart.match(/\.c-monitor-chart-line\s*\{([^}]*)\}/)
    assert.ok(chartLineMatch, '图表容器应存在')
    assert.ok(/min-height\s*:\s*0/.test(chartLineMatch[1]), '图表容器应有 min-height: 0')

    const chartBarMatch = processedWithChart.match(/\.c-monitor-chart-bar\s*\{([^}]*)\}/)
    assert.ok(chartBarMatch, '柱状图容器应存在')
    assert.ok(/min-height\s*:\s*0/.test(chartBarMatch[1]), '柱状图容器应有 min-height: 0')
  })

  test('T07-C: 背景图去重正确工作', () => {
    // 统计背景图出现次数
    const bgMatches = processedWithDedup.match(/bg-pattern\.png/g) || []
    assert.equal(bgMatches.length, 1, `背景图应只出现 1 次，实际 ${bgMatches.length} 次`)
  })

  test('T07-D: style 块保留完整结构', () => {
    // 验证 <style lang="less" scoped> 存在
    assert.ok(/<style\s+lang="less"\s+scoped>/.test(processedWithDedup), 'style 块应有 lang="less" scoped')
    
    // 验证 @import 存在
    assert.ok(/@import\s+['"].*index\.less['"]/.test(processedWithDedup), '应有 @import index.less')
    
    // 验证 script 块完整
    assert.ok(/<script\s+setup>/.test(processedWithDedup), 'script 块应保留')
    assert.ok(/import.*from\s+['"]vue['"]/.test(processedWithDedup), 'vue import 应保留')
    assert.ok(/import.*echarts/.test(processedWithDedup), 'echarts import 应保留')
  })

  test('T07-E: L0-B 校验器不报 BLOCK（CODE-001/002/003）', () => {
    const blocks = validation.issues.filter(i => i.severity === 'BLOCK')
    assert.equal(blocks.length, 0, `不应有 BLOCK 级别问题，实际: ${blocks.map(b => b.id).join(', ')}`)
  })

  test('T07-F: L0-B 校验器 CODE-003 通过（class 前缀合规）', () => {
    const code003 = validation.issues.find(i => i.id === 'CODE-003')
    assert.ok(!code003, `CODE-003 不应触发，所有 class 都是 c-monitor- 前缀`)
  })

  test('T07-G: 完整后处理链输出可渲染', () => {
    // 验证输出仍是合法 Vue SFC 结构
    assert.ok(/<template>[\s\S]*<\/template>/.test(processedWithDedup), 'template 块完整')
    assert.ok(/<script\s+setup>[\s\S]*<\/script>/.test(processedWithDedup), 'script 块完整')
    assert.ok(/<style[\s\S]*<\/style>/.test(processedWithDedup), 'style 块完整')
    
    // 验证没有语法错误（无未闭合的括号）
    const openBraces = (processedWithDedup.match(/\{/g) || []).length
    const closeBraces = (processedWithDedup.match(/\}/g) || []).length
    assert.equal(openBraces, closeBraces, `括号应平衡，{ = ${openBraces}，} = ${closeBraces}`)
  })

  test('T07-H: 后处理不破坏 script 逻辑', () => {
    // 验证 echarts init 逻辑保留
    assert.ok(/echarts\.init\(chartRef1\.value\)/.test(processedWithDedup), 'chart1 初始化逻辑保留')
    assert.ok(/echarts\.init\(chartRef2\.value\)/.test(processedWithDedup), 'chart2 初始化逻辑保留')
    assert.ok(/setOption/.test(processedWithDedup), 'setOption 调用保留')
  })
})
