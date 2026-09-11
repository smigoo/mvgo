<template>
  <div class="c-monitor-distribution-root">
    <div class="c-monitor-distribution-card" :style="{ backgroundImage: `url(${bgm_3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-distribution-header">
        <img :src="icon4" class="c-monitor-distribution-icon" />
        <span class="c-monitor-distribution-title">江阴靖江长江隧道</span>
      </div>
      <div class="c-monitor-distribution-body">
        <div ref="tunnelChartRef" class="c-monitor-distribution-chart"></div>
        <div class="c-monitor-distribution-data">
          <div class="c-monitor-distribution-item">
            <span class="c-monitor-distribution-label">客车</span>
            <span class="c-monitor-distribution-value c-monitor-distribution-value--blue">22,350</span>
          </div>
          <div class="c-monitor-distribution-item">
            <span class="c-monitor-distribution-label">货车</span>
            <span class="c-monitor-distribution-value c-monitor-distribution-value--orange">16,270</span>
          </div>
        </div>
      </div>
    </div>

    <div class="c-monitor-distribution-card" :style="{ backgroundImage: `url(${bgm_4})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-distribution-header">
        <img :src="icon5" class="c-monitor-distribution-icon" />
        <span class="c-monitor-distribution-title">江阴大桥</span>
      </div>
      <div class="c-monitor-distribution-body">
        <div ref="bridgeChartRef" class="c-monitor-distribution-chart"></div>
        <div class="c-monitor-distribution-data">
          <div class="c-monitor-distribution-item">
            <span class="c-monitor-distribution-label">客车</span>
            <span class="c-monitor-distribution-value c-monitor-distribution-value--blue">66,109</span>
          </div>
          <div class="c-monitor-distribution-item">
            <span class="c-monitor-distribution-label">货车</span>
            <span class="c-monitor-distribution-value c-monitor-distribution-value--orange">16,270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  timeTab: {
    type: String,
    default: '24h'
  }
})

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[MonitorDistribution] $mcComponentBuilder 失败:', e)
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const getChartOption = (passenger, truck) => {
  return {
    tooltip: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: [{ value: 1, itemStyle: { color: '#56597c' } }],
        label: { show: false },
        silent: true,
        animation: false
      },
      {
        type: 'pie',
        radius: ['75%', '95%'],
        data: [
          { value: passenger, name: '客车', itemStyle: { color: '#2ba0ff' } },
          { value: truck, name: '货车', itemStyle: { color: '#ffa22f' } }
        ],
        label: { show: false },
        startAngle: 90
      }
    ]
  }
}

const updateCharts = () => {
  if (tunnelChart) {
    tunnelChart.setOption(getChartOption(22350, 16270), true)
  }
  if (bridgeChart) {
    bridgeChart.setOption(getChartOption(66109, 16270), true)
  }
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateCharts()
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateCharts()
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateCharts()
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateCharts()
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

watch(() => props.timeTab, () => {
  updateCharts()
})

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>