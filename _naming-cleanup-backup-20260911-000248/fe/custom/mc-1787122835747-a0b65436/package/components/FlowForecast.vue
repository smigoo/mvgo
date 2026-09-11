<template>
  <div class="c-flow-forecast-root">
    <div class="c-flow-forecast-header">
      <div class="c-flow-forecast-title-group">
        <span class="c-flow-forecast-title-icon"></span>
        <span class="c-flow-forecast-title">流量预测</span>
      </div>

      <div class="c-flow-forecast-tabs">
        <span
          v-for="tab in tabList"
          :key="tab.key"
          :class="['c-flow-forecast-tab', { 'is-active': activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </span>
      </div>

      <a-button
        type="link"
        class="c-flow-forecast-holiday-link"
        @click="handleHolidayPrediction"
      >
        节假日预测&gt;
      </a-button>
    </div>

    <div class="c-flow-forecast-chart-wrap">
      <div ref="chartRef" class="c-flow-forecast-chart"></div>
      <div class="c-flow-forecast-accuracy">
        <span>准确率98%</span>
        <span>准确率96%</span>
        <span>准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- $mcComponentBuilder 初始化（try-catch 兜底，子组件不深度依赖） ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[FlowForecast] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
}

const activeTab = ref('tunnel')
const tabList = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

// Mock 数据：仅用于静态预览，接入 componentApi 后可替换为真实接口数据
const forecastDataMap = {
  tunnel: {
    actual: [3010, 3180, 3360, 3240, 3020, 2860],
    predicted: [3010, 3180, 3360, 3400, 3280, 3150]
  },
  bridge: {
    actual: [3250, 3420, 3580, 3460, 3280, 3120],
    predicted: [3250, 3420, 3580, 3660, 3480, 3350]
  }
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleHolidayPrediction = () => {
  // 交互链接预留；当前设计稿未声明跳转目标，不臆造跳转逻辑
}

const updateChart = () => {
  if (!chart) return

  const currentData = forecastDataMap[activeTab.value] || forecastDataMap.tunnel

  chart.setOption({
    color: ['#3b82f6', '#52c41a'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#e6edf4',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const list = params.map((item) => {
          return `${item.marker}${item.seriesName}：${item.value}辆`
        }).join('<br/>')
        return `${params[0].axisValue}<br/>${list}`
      }
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 6,
      icon: 'roundRect',
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      top: 28,
      left: 44,
      right: 12,
      bottom: 26,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLine: {
        lineStyle: {
          color: '#c7d9e9'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 11
      },
      axisLabel: {
        color: '#666666',
        fontSize: 11
      },
      splitLine: {
        lineStyle: {
          color: '#e6edf4',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: currentData.actual,
        lineStyle: {
          width: 2,
          color: '#3b82f6'
        },
        itemStyle: {
          color: '#3b82f6',
          borderColor: '#ffffff',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.14)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: currentData.predicted,
        lineStyle: {
          width: 2,
          color: '#52c41a'
        },
        itemStyle: {
          color: '#52c41a',
          borderColor: '#ffffff',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.14)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.02)' }
            ]
          }
        }
      }
    ]
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return

  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }

  chartObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    const width = entry?.contentRect?.width || 0
    const height = entry?.contentRect?.height || 0

    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })

  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

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
  runtimeBuilder = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-flow-forecast-root {
  width: 100%;
  min-width: 0;
  height: 174px;
  flex: 0 0 174px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-flow-forecast-header {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
}

.c-flow-forecast-title-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.c-flow-forecast-title-icon {
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
  transform: rotate(45deg);
  flex-shrink: 0;
}

.c-flow-forecast-title {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-flow-forecast-tabs {
  margin-left: auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-flow-forecast-tab {
  min-width: 68px;
  height: 22px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1px solid rgba(172, 196, 225, 1);
  border-radius: 11px;
  background: #6680a0;
  color: #ffffff;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.c-flow-forecast-tab.is-active {
  border-color: rgba(199, 224, 255, 1);
  background: #1990ff;
  font-weight: 500;
  color: #ffffff;
}

.c-flow-forecast-holiday-link {
  margin-left: 10px;
  flex-shrink: 0;
  padding: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  color: #1990ff;
}

.c-flow-forecast-holiday-link :deep(.ant-btn) {
  padding: 0;
  font-size: 12px;
  line-height: 18px;
  color: #1990ff;
}

.c-flow-forecast-chart-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.c-flow-forecast-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-flow-forecast-accuracy {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 21px;
  pointer-events: none;

  span {
    font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
    font-size: 12px;
    font-weight: 500;
    line-height: 12px;
    text-align: center;
    color: #52c41a;
    white-space: nowrap;
  }
}
</style>