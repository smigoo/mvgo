# 图例交互约束（必须）

> 当预览图中存在图表自定义图例（如"北京方向"/"上海方向"）时，必须实现点击图例切换系列显示的功能。

## 🔴 自定义图例必须与图表联动

**如果预览图中存在图表图例，必须实现点击图例切换系列显示的功能。**

实现要求：
1. 用 `ref` 维护每个系列的显示状态：`const legendState = ref({ beijing: true, shanghai: true })`
2. 点击图例时调用 `chart.dispatchAction({ type: 'legendToggleSelect', name: seriesName })`
3. 图例 DOM 的激活样式与 legendState 绑定：`:class="{ active: legendState.beijing }"`
4. **禁止使用 ECharts 内置 legend 组件替代自定义图例**（除非设计稿明确使用内置图例）

正确实现示例：
```vue
<template>
  <div class="chart-legend">
    <span 
      class="legend-item" 
      :class="{ active: legendState.beijing }" 
      @click="toggleLegend('北京方向')"
    >
      <i class="dot dark-blue"></i>北京方向
    </span>
    <span 
      class="legend-item" 
      :class="{ active: legendState.shanghai }" 
      @click="toggleLegend('上海方向')"
    >
      <i class="dot light-blue"></i>上海方向
    </span>
  </div>
  <div class="chart-body">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 切换图例
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  chart.setOption({
    legend: { data: ['北京方向', '上海方向'] },
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    // ... 其他配置
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })

onMounted(() => { initChart() })
onUnmounted(() => { chart?.dispose() })
</script>
```

## 禁止的行为

1. ❌ 图例是静态 DOM，没有点击事件
2. ❌ 图例点击后图表不响应
3. ❌ 使用 ECharts 内置 legend 组件替代自定义图例（除非设计稿明确使用）
