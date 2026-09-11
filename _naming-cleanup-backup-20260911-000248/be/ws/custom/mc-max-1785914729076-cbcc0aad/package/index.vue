<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1785914729076-cbcc0aad-main" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 环境指标卡片 -->
      <div class="c-mc-max-1785914729076-cbcc0aad-stats-grid">
        <div class="c-mc-max-1785914729076-cbcc0aad-stat-item">
          <img :src="icon1" class="c-mc-max-1785914729076-cbcc0aad-stat-icon" />
          <div class="c-mc-max-1785914729076-cbcc0aad-stat-text">
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-label">温度</span>
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-value">24.5<small>℃</small></span>
          </div>
        </div>
        <div class="c-mc-max-1785914729076-cbcc0aad-stat-item">
          <img :src="icon2" class="c-mc-max-1785914729076-cbcc0aad-stat-icon" />
          <div class="c-mc-max-1785914729076-cbcc0aad-stat-text">
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-label">湿度</span>
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-value">65<small>%</small></span>
          </div>
        </div>
      </div>

      <!-- 趋势图表 -->
      <div class="c-mc-max-1785914729076-cbcc0aad-chart-section">
        <div class="c-mc-max-1785914729076-cbcc0aad-chart-header">
          <span class="c-mc-max-1785914729076-cbcc0aad-section-title">24小时环境趋势</span>
        </div>
        <div class="c-mc-max-1785914729076-cbcc0aad-chart-wrapper">
          <div ref="chartRef" class="c-mc-max-1785914729076-cbcc0aad-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/g-7883.png'
import icon2 from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)
  const tempData = Array.from({ length: 24 }, () => (20 + Math.random() * 10).toFixed(1))
  const humData = Array.from({ length: 24 }, () => (50 + Math.random() * 30).toFixed(1))

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    legend: {
      data: ['温度', '湿度'],
      textStyle: { color: 'rgba(255,255,255,0.8)' },
      top: 0,
      right: 0
    },
    grid: {
      left: 10,
      right: 10,
      top: 40,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)' }
    },
    yAxis: [
      {
        type: 'value',
        name: '℃',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      },
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      }
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        data: tempData,
        itemStyle: { color: '#ff7a45' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255, 122, 69, 0.3)' },
              { offset: 1, color: 'rgba(255, 122, 69, 0.0)' }
            ]
          }
        }
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: humData,
        itemStyle: { color: '#1890ff' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.0)' }
            ]
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

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785914729076-cbcc0aad-onload', {
      componentId: 'mc-max-1785914729076-cbcc0aad',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>