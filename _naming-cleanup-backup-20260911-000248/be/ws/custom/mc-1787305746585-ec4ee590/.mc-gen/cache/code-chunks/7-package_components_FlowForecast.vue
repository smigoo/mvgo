<template>
  <div class="c-monitor-forecast">
    <!-- 标题行：流量预测 + Tab 切换 + 节假日预测链接 -->
    <div class="c-monitor-forecast-header">
      <div class="c-monitor-forecast-title">
        <img :src="icon3" class="c-monitor-forecast-title-icon" alt="标题图标" />
        <span class="c-monitor-forecast-title-text">流量预测</span>
      </div>
      <div class="c-monitor-forecast-tabs">
        <div
          v-for="tab in forecastTabs"
          :key="tab.key"
          :class="['c-monitor-forecast-tab', { 'c-monitor-forecast-tab--active': activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </div>
      </div>
      <a class="c-monitor-forecast-link" href="javascript:void(0)">节假日预测 &gt;</a>
    </div>

    <!-- 图表区块 -->
    <div class="c-monitor-forecast-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-forecast-legend">
        <div
          class="c-monitor-forecast-legend-item"
          :class="{ 'c-monitor-forecast-legend-item--active': legendState.actual }"
          @click="toggleLegend('实际流量')"
        >
          <span class="c-monitor-forecast-legend-line c-monitor-forecast-legend-line--actual"></span>
          <span class="c-monitor-forecast-legend-dot c-monitor-forecast-legend-dot--actual"></span>
          <span class="c-monitor-forecast-legend-text">实际流量</span>
        </div>
        <div
          class="c-monitor-forecast-legend-item"
          :class="{ 'c-monitor-forecast-legend-item--active': legendState.forecast }"
          @click="toggleLegend('预测流量')"
        >
          <span class="c-monitor-forecast-legend-line c-monitor-forecast-legend-line--forecast"></span>
          <span class="c-monitor-forecast-legend-dot c-monitor-forecast-legend-dot--forecast"></span>
          <span class="c-monitor-forecast-legend-text">预测流量</span>
        </div>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-forecast-chart"></div>

      <!-- 准确率文字 -->
      <div class="c-monitor-forecast-accuracy">
        <span class="c-monitor-forecast-accuracy-item">准确率98%</span>
        <span class="c-monitor-forecast-accuracy-item">准确率96%</span>
        <span class="c-monitor-forecast-accuracy-item">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化（try-catch 包裹，防止框架未就绪导致组件不可见）===
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[c-monitor-flow-forecast] $mcComponentBuilder 失败:', e)
}
// === Tab 切换状态 ===
const activeTab = ref('tunnel')

const forecastTabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]
// === 图例状态 ===
const legendState = reactive({
  actual: true,
  forecast: true
})
// === 图表引用 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null
// === Mock 数据（隧道/大桥切换时更新）===
const xAxisLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

const dataMap = {
  tunnel: {
    actual: [2100, 2800, 3200, 2900, 2400],
    forecast: [2100, 2800, 3200, 3100, 2550]
  },
  bridge: {
    actual: [2600, 3100, 3400, 3150, 2650],
    forecast: [2600, 3100, 3400, 3300, 2750]
  }
}
// === 图例切换 ===
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '实际流量') {
    legendState.actual = !legendState.actual
  } else if (name === '预测流量') {
    legendState.forecast = !legendState.forecast
  }
}
// === 更新图表配置 ===
const updateChart = () => {
  if (!chart) return

  const currentData = dataMap[activeTab.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.08)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN, Roboto, sans-serif'
      },
      formatter: (params) => {
        const parts = params.map((p) => {
          return `${p.marker}${p.seriesName}: ${p.value} 辆`
        })
        return `${params[0].name}<br/>${parts.join('<br/>')}`
      }
    },
    grid: {
      left: 44,
      right: 16,
      top: 12,
      bottom: 24,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: xAxisLabels,
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.2)' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto, sans-serif',
        interval: 0,
        margin: 8
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.06)' }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 10,
        fontFamily: 'Roboto, sans-serif',
        formatter: (value) => {
          const labels = ['4000', '3000', '2000', '1000', '0']
          return labels.includes(String(value)) ? value : ''
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: currentData.actual,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1
        },
        lineStyle: {
          color: '#3385ff',
          width: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51,133,255,0.25)' },
            { offset: 1, color: 'rgba(51,133,255,0.02)' }
          ])
        },
        emphasis: { focus: 'none' }
      },
      {
        name: '预测流量',
        type: 'line',
        data: currentData.forecast,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
        },
        lineStyle: {
          color: '#00cccc',
          width: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0,204,204,0.25)' },
            { offset: 1, color: 'rgba(0,204,204,0.02)' }
          ])
        },
        emphasis: { focus: 'none' }
      }
    ]
  }

  chart.setOption(option, true)
}
// === 初始化图表 ===
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}
// === 监听 chartRef 变化（处理 base-panel 渲染过程中销毁重建 slot DOM）===
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})
// === Tab 切换联动 ===
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}
// === 监听 activeTab 变化，更新图表数据 ===
watch(activeTab, () => {
  updateChart()
})
// === 窗口 resize 处理 ===
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>