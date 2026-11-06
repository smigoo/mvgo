/**
 * Phase 2 方案7: 样式隔离策略测试
 * 测试自动修复子组件尺寸约束功能
 *
 * P3': 伪造 series 阈值线检测与改写
 */

import { describe, it, expect } from '@jest/globals'
import { autoFixSubComponentSize, rewriteFakeThresholdSeries } from '../post-process.js'

describe('Phase 2 方案7: 样式隔离策略', () => {
  describe('autoFixSubComponentSize', () => {
    it('自动注入 width: 100%; height: 100%', () => {
      const vueContent = `
<template>
  <div class="c-stat-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-stat-card {
  padding: 12px;
  background: #fff;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).toContain('width: 100%')
      expect(result).toContain('height: 100%')
    })

    it('移除子组件根元素的 margin', () => {
      const vueContent = `
<template>
  <div class="c-stat-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-stat-card {
  padding: 12px;
  margin: 16px;
  background: #fff;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).not.toContain('margin:')
      expect(result).toContain('width: 100%')
      expect(result).toContain('height: 100%')
    })

    it('保持已有的 width 和 height', () => {
      const vueContent = `
<template>
  <div class="c-stat-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-stat-card {
  width: 100%;
  height: 100%;
  padding: 12px;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      // 应该保持原样，不重复注入
      const widthCount = (result.match(/width:\s*100%/g) || []).length
      const heightCount = (result.match(/height:\s*100%/g) || []).length
      expect(widthCount).toBe(1)
      expect(heightCount).toBe(1)
    })

    it('同时注入尺寸和移除 margin', () => {
      const vueContent = `
<template>
  <div class="c-card">
    <div>卡片内容</div>
  </div>
</template>
<style scoped>
.c-card {
  margin: 20px;
  padding: 16px;
  border: 1px solid #ddd;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).not.toContain('margin:')
      expect(result).toContain('width: 100%')
      expect(result).toContain('height: 100%')
      expect(result).toContain('padding: 16px')
      expect(result).toContain('border: 1px solid #ddd')
    })

    it('处理没有 <style> 块的情况', () => {
      const vueContent = `
<template>
  <div class="c-card">
    <div>卡片内容</div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
</script>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).toBe(vueContent) // 保持原样
    })

    it('处理没有根元素 class 的情况', () => {
      const vueContent = `
<template>
  <div>
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-card {
  padding: 12px;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).toBe(vueContent) // 保持原样
    })

    it('处理多个 class 的情况（只处理第一个）', () => {
      const vueContent = `
<template>
  <div class="c-card active">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-card {
  padding: 12px;
  margin: 10px;
}
.active {
  border: 2px solid blue;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).not.toContain('margin:')
      expect(result).toContain('width: 100%')
      expect(result).toContain('height: 100%')
      // .active 样式应保持不变
      expect(result).toContain('.active')
      expect(result).toContain('border: 2px solid blue')
    })

    it('移除各种形式的 margin', () => {
      const vueContent = `
<template>
  <div class="c-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-card {
  margin-top: 10px;
  margin-bottom: 20px;
  padding: 12px;
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)
      expect(result).not.toContain('margin-top')
      expect(result).not.toContain('margin-bottom')
      expect(result).toContain('padding: 12px')
    })

    it('处理 null/undefined 输入', () => {
      expect(autoFixSubComponentSize(null)).toBeNull()
      expect(autoFixSubComponentSize(undefined)).toBeUndefined()
      expect(autoFixSubComponentSize('')).toBe('')
    })

    it('综合测试：复杂子组件', () => {
      const vueContent = `
<template>
  <div class="c-traffic-chart">
    <div class="chart-header">流量趋势</div>
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)

onMounted(() => {
  // 初始化图表
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-traffic-chart {
  margin: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;

  .chart-header {
    font-size: 16px;
    margin-bottom: 12px;
  }

  .chart-container {
    min-height: 300px;
  }
}
</style>
      `

      const result = autoFixSubComponentSize(vueContent)

      // 验证修复结果
      expect(result).not.toContain('margin: 24px')
      expect(result).toContain('width: 100%')
      expect(result).toContain('height: 100%')
      expect(result).toContain('padding: 16px')
      expect(result).toContain('background: rgba(255, 255, 255, 0.05)')

      // 验证子元素样式保持不变
      expect(result).toContain('.chart-header')
      expect(result).toContain('margin-bottom: 12px')
      expect(result).toContain('.chart-container')
      expect(result).toContain('min-height: 300px')
    })
  })
})

describe("P3': 伪造 series 阈值线检测与改写", () => {
  describe('rewriteFakeThresholdSeries', () => {
    it('检测并改写伪造的阈值线 series（恒值 data + 阈值类名称）', () => {
      const code = `
const option = {
  series: [
    {
      name: '实际流量',
      type: 'line',
      data: [100, 120, 150, 180, 200]
    },
    {
      name: '阈值',
      type: 'line',
      data: [150, 150, 150, 150, 150]
    }
  ]
}
      `
      const result = rewriteFakeThresholdSeries(code)
      
      // 应该移除伪造的阈值 series
      expect(result).not.toContain("name: '阈值'")
      // 应该在第一个 series 中注入 markLine
      expect(result).toContain('markLine')
      expect(result).toContain('yAxis: 150')
    })

    it('检测"平均线"类名称', () => {
      const code = `
series: [
  { name: '销量', type: 'bar', data: [10, 20, 30] },
  { name: '平均值', type: 'line', data: [20, 20, 20] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      expect(result).not.toContain("name: '平均值'")
      expect(result).toContain('markLine')
    })

    it('检测"预警线"类名称', () => {
      const code = `
series: [
  { name: '温度', type: 'line', data: [25, 28, 32] },
  { name: '预警线', type: 'line', data: [30, 30, 30] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      expect(result).not.toContain("name: '预警线'")
      expect(result).toContain('markLine')
    })

    it('不改写非恒值 data 的 series', () => {
      const code = `
series: [
  { name: '流量', type: 'line', data: [100, 120, 150] },
  { name: '阈值', type: 'line', data: [150, 160, 170] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      // data 不是恒值，不应改写
      expect(result).toContain("name: '阈值'")
      expect(result).not.toContain('markLine')
    })

    it('不改写没有阈值类名称的 series', () => {
      const code = `
series: [
  { name: '北京', type: 'line', data: [100, 120, 150] },
  { name: '上海', type: 'line', data: [80, 90, 110] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      // 没有阈值类名称，不应改写
      expect(result).toContain("name: '北京'")
      expect(result).toContain("name: '上海'")
      expect(result).not.toContain('markLine')
    })

    it('处理多个伪造阈值 series', () => {
      const code = `
series: [
  { name: '实际值', type: 'line', data: [10, 20, 30] },
  { name: '阈值', type: 'line', data: [25, 25, 25] },
  { name: '平均线', type: 'line', data: [20, 20, 20] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      expect(result).not.toContain("name: '阈值'")
      expect(result).not.toContain("name: '平均线'")
      // 应该注入两条 markLine
      const markLineCount = (result.match(/markLine/g) || []).length
      expect(markLineCount).toBeGreaterThanOrEqual(2)
    })

    it('处理空输入', () => {
      expect(rewriteFakeThresholdSeries('')).toBe('')
      expect(rewriteFakeThresholdSeries(null)).toBeNull()
      expect(rewriteFakeThresholdSeries(undefined)).toBeUndefined()
    })

    it('保留已有 markLine 的 series', () => {
      const code = `
series: [
  { 
    name: '流量', 
    type: 'line', 
    data: [100, 120, 150],
    markLine: { data: [{ yAxis: 130 }] }
  },
  { name: '阈值', type: 'line', data: [130, 130, 130] }
]
      `
      const result = rewriteFakeThresholdSeries(code)
      // 移除伪造 series
      expect(result).not.toContain("name: '阈值'")
      // 已有 markLine 应保留（不重复注入）
      expect(result).toContain('markLine')
    })
  })
})
