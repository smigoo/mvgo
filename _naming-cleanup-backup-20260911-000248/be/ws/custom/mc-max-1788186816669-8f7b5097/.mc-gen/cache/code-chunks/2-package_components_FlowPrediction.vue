<template>
  <div class="c-monitor-section c-monitor-flow-prediction">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon3" class="c-monitor-title-icon" alt="" />
        <span>流量预测</span>
      </div>
      <div class="c-monitor-section-actions">
        <div class="c-monitor-tabs">
          <span 
            v-for="tab in tabs" 
            :key="tab.value"
            class="c-monitor-tab-item"
            :class="{ active: activeTab === tab.value }"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </span>
        </div>
        <a href="#" class="c-monitor-link">节假日预测 &gt;</a>
      </div>
    </div>
    <div class="c-monitor-section-body" :style="{ backgroundImage: 'url(' + bg4 + ')' }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
      <div class="c-monitor-chart-legend">
        <span class="c-monitor-legend-item">
          <i class="c-monitor-legend-line c-monitor-legend-line-blue"></i>
          实际流量
        </span>
        <span class="c-monitor-legend-item">
          <i class="c-monitor-legend-line c-monitor-legend-line-green"></i>
          预测流量
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明
const icon3 = ref('')
const bg4 = ref('')

const chartRef = ref(null)
let chart = null
let chartObserver = null

const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activeTab = ref('tunnel')

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.15)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
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
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: { show: true, fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLabel: { show: true, fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.08)' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [2800, 3200, 3500, null, null],
        smooth: true,
        itemStyle: { color: '#1890ff' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: [null, null, 3500, 3600, 3400],
        smooth: true,
        itemStyle: { color: '#52c41a' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          lineStyle: {
            color: '#ff9800',
            type: 'dashed'
          },
          data: [{ yAxis: 3000 }],
          label: {
            formatter: '建议分流',
            position: 'end',
            fontSize: 10
          }
        }
      }
    ]
  }
  chart.setOption(option, true)
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
    const { width, height } = entries[0].contentRect
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
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
