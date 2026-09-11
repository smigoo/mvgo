<template>
  <div class="c-monitor-traffic-prediction">
    <div class="c-monitor-traffic-prediction-header">
      <div class="c-monitor-traffic-prediction-title">
        <span class="c-monitor-traffic-prediction-icon"></span>
        <span class="c-monitor-traffic-prediction-title-text">流量预测</span>
      </div>
      <div class="c-monitor-traffic-prediction-controls">
        <div class="c-monitor-traffic-prediction-tabs">
          <span
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-traffic-prediction-tab-item', { active: currentTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </span>
        </div>
        <span class="c-monitor-traffic-prediction-link">节假日预测 &gt;</span>
      </div>
    </div>
    <div class="c-monitor-traffic-prediction-body">
      <div class="c-monitor-traffic-prediction-chart-area">
        <div class="c-monitor-traffic-prediction-legend">
          <span
            class="c-monitor-traffic-prediction-legend-item"
            :class="{ inactive: !legendState.actual }"
            @click="toggleLegend('实际流量')"
          >
            <i class="c-monitor-traffic-prediction-legend-line actual"></i>
            <i class="c-monitor-traffic-prediction-legend-dot actual"></i>
            <span>实际流量</span>
          </span>
          <span
            class="c-monitor-traffic-prediction-legend-item"
            :class="{ inactive: !legendState.forecast }"
            @click="toggleLegend('预测流量')"
          >
            <i class="c-monitor-traffic-prediction-legend-line forecast"></i>
            <i class="c-monitor-traffic-prediction-legend-dot forecast"></i>
            <span>预测流量</span>
          </span>
        </div>
        <div ref="chartRef" class="c-monitor-traffic-prediction-chart-container"></div>
        <div class="c-monitor-traffic-prediction-accuracy">
          <span>准确率98%</span>
          <span>准确率96%</span>
          <span>准确率92%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[流量预测] $mcComponentBuilder 初始化失败:', e)
}

// Tab 切换
const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]
const currentTab = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, forecast: true })

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（对应两个地点的实际流量与预测流量）
const mockDataMap = {
  tunnel: {
    actual: [1200, 1500, 1800, 1650, 1400],
    forecast: [1250, 1550, 1780, 1700, 1500]
  },
  bridge: {
    actual: [2600, 2900, 3100, 2850, 2700],
    forecast: [2650, 2950, 3050, 2900, 2800]
  }
}

const categoryLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = mockDataMap[currentTab.value]
  const option = {
    legend: { show: false }, // 使用自定义 DOM 图例
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e0e6ed',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params : [params]
        if (!p.length) return ''
        let html = `<div style="font-weight:500;margin-bottom:4px;">${p[0].name}</div>`
        p.forEach((item) => {
          html += `<div style="display:flex;justify-content:space-between;gap:12px;">
            <span>${item.seriesName}</span>
            <span style="font-weight:600;">${item.value} 辆</span>
          </div>`
        })
        return html
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categoryLabels,
      boundaryGap: false,
      axisLabel: { color: '#666666', fontSize: 12, interval: 0 },
      axisLine: { lineStyle: { color: '#d9e2ec' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: { color: '#666666', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e8eef5', type: 'dashed' } },
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -30] },
      nameLocation: 'end'
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#1890ff' },
        itemStyle: { color: '#ffffff', borderColor: '#1890ff', borderWidth: 1 },
        areaStyle: {
          opacity: 0.15,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#1890ff' },
            { offset: 1, color: 'rgba(24,144,255,0)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#52c41a' },
        itemStyle: { color: '#ffffff', borderColor: '#52c41a', borderWidth: 1 },
        areaStyle: {
          opacity: 0.15,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#52c41a' },
            { offset: 1, color: 'rgba(82,196,26,0)' }
          ])
        }
      }
    ]
  }

  chart.setOption(option, true)
}

// 初始化图表
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// Tab 切换
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}

// 图例联动
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '实际流量') {
    legendState.value.actual = !legendState.value.actual
  } else if (name === '预测流量') {
    legendState.value.forecast = !legendState.value.forecast
  }
}

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

.c-monitor-traffic-prediction {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

/* Header 区域 */
.c-monitor-traffic-prediction-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 30px;
  min-width: 0;
  margin-bottom: 4px;
}

.c-monitor-traffic-prediction-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-traffic-prediction-icon {
  width: 18px;
  height: 18px;
  display: inline-block;
  background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
  transform: rotate(45deg);
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-traffic-prediction-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
}

.c-monitor-traffic-prediction-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.c-monitor-traffic-prediction-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-traffic-prediction-tab-item {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 12px;
  border-radius: 20px;
  font-size: 14px;
  line-height: 21px;
  cursor: pointer;
  border: 1px solid rgba(172, 196, 225, 1);
  background: #6680a0;
  color: #ffffff;
  transition: all 0.3s;
  white-space: nowrap;

  &.active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    font-weight: 500;
  }

  &:hover {
    opacity: 0.85;
  }
}

.c-monitor-traffic-prediction-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}

/* Body 区域 */
.c-monitor-traffic-prediction-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-traffic-prediction-chart-area {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 图例（右上角浮层） */
.c-monitor-traffic-prediction-legend {
  position: absolute;
  top: 4px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 5;
}

.c-monitor-traffic-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #333333;
  transition: opacity 0.2s;
  user-select: none;

  &.inactive {
    opacity: 0.35;
  }

  .c-monitor-traffic-prediction-legend-line {
    width: 14px;
    height: 2px;
    display: inline-block;

    &.actual {
      background: #1890ff;
    }
    &.forecast {
      background: #52c41a;
    }
  }

  .c-monitor-traffic-prediction-legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;

    &.actual {
      background: #1890ff;
    }
    &.forecast {
      background: #52c41a;
    }
  }
}

.c-monitor-traffic-prediction-chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

/* 底部准确率文字 */
.c-monitor-traffic-prediction-accuracy {
  flex-shrink: 0;
  height: 18px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: #52c41a;
  margin-top: 2px;
  padding: 0 10px;
}
</style>