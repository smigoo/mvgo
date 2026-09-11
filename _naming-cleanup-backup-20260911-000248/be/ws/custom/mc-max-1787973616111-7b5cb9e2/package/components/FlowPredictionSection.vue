<template>
  <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-flow-prediction-section">
    <!-- 区域标题和Tab切换 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-header">
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title-group" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '426px 91px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <img v-if="icon3" :src="icon3" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-title-icon" alt="" />
        <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title">流量预测</span>
      </div>
      
      <!-- 预测类型Tab切换 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-prediction-tabs">
        <div
          v-for="tab in predictionTabs"
          :key="tab.value"
          :class="['c-monitor-prediction-tab', { active: activePredictionTab === tab.value }]"
          @click="activePredictionTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-body">
      <!-- 图例 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-legend">
        <div
          v-for="legend in legendItems"
          :key="legend.name"
          :class="['c-monitor-legend-item', { active: legendState[legend.key] }]"
          @click="toggleLegend(legend.name, legend.key)"
        >
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-line" :style="{ background: legend.color }"></span>
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-text">{{ legend.name }}</span>
        </div>
      </div>

      <!-- ECharts容器 -->
      <div ref="chartRef" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-container"></div>

      <!-- 时间轴准确率标签 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-accuracy-labels">
        <span
          v-for="(label, index) in displayAccuracyLabels"
          :key="index"
          class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-accuracy-label"
          :class="{ empty: !label }"
        >
          {{ label }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'

import { ref, computed, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  predictionData: {
    type: Object,
    default: () => ({
      xAxisData: [],
      accuracyLabels: [],
      series: []
    })
  },
  activeLocation: {
    type: String,
    default: 'tunnel'
  }
})

// 资源变量（系统注入）

// 预测类型Tab
const predictionTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' },
  { label: '节假日预测', value: 'holiday' }
])

const activePredictionTab = ref('tunnel')

// 图例状态
const legendState = ref({
  actual: true,
  predicted: true
})

const legendItems = ref([
  { name: '实际流量', key: 'actual', color: '#00cccc' },
  { name: '预测流量', key: 'predicted', color: '#3385ff' }
])

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 准确率标签（根据Tab动态变化）
const displayAccuracyLabels = computed(() => {
  if (activePredictionTab.value === 'tunnel' || activePredictionTab.value === 'bridge') {
    return props.predictionData?.accuracyLabels || []
  }
  return ['', '', '', '', '']
})

// 切换图例
const toggleLegend = (name, key) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      }
    },
    legend: {
      show: false,
      data: ['实际流量', '预测流量']
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.predictionData?.xAxisData || ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 5000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: props.predictionData?.series?.[0]?.data || [2800, 3200, 3500, null, null],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
        },
        lineStyle: {
          color: '#00cccc',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: props.predictionData?.series?.[1]?.data || [null, null, 3500, 3800, 4200],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1
        },
        lineStyle: {
          color: '#3385ff',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
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

// 监听数据变化
watch(() => props.predictionData, () => {
  updateChart()
}, { deep: true })

// 监听Tab切换
watch(activePredictionTab, (newTab) => {
  console.log('[FlowPrediction] Tab切换:', newTab)
  updateChart()
})

// 窗口大小改变
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>