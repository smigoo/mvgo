<template>
  <div class="c-monitor-vehicle-distribution">
    <header class="c-monitor-vehicle-header">
      <img :src="icon2" alt="" class="c-monitor-vehicle-title-icon" />
      <span class="c-monitor-vehicle-title">车型分布</span>
    </header>
    <div class="c-monitor-vehicle-body">
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '191px 80px', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-monitor-vehicle-card-label">江阴靖江长江隧道</span>
        <div ref="tunnelPieRef" class="c-monitor-vehicle-pie" />
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--passenger">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--truck">16270</span>
          </div>
        </div>
      </div>
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '191px 81px', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <span class="c-monitor-vehicle-card-label">江阴大桥</span>
        <div ref="bridgePieRef" class="c-monitor-vehicle-pie" />
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--passenger">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat">
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--truck">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelPieData = [
  { name: '客车', value: 22350, itemStyle: { color: '#1990ff' } },
  { name: '货车', value: 16270, itemStyle: { color: '#ff8b00' } }
]

const bridgePieData = [
  { name: '客车', value: 66109, itemStyle: { color: '#1990ff' } },
  { name: '货车', value: 16270, itemStyle: { color: '#ff8b00' } }
]

const buildPieOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(25, 144, 255, 0.25)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#333333', fontSize: 12 },
    formatter: (params) => `${params.name}：${params.value} 辆（${params.percent}%）`
  },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['68%', '95%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      data
    }
  ]
})

const initTunnelChart = () => {
  if (!tunnelPieRef.value) return
  const { clientWidth, clientHeight } = tunnelPieRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelPieRef.value)
    tunnelChart.setOption(buildPieOption(tunnelPieData))
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelPieRef.value)
      tunnelChart.setOption(buildPieOption(tunnelPieData))
    }
  })
  tunnelObserver.observe(tunnelPieRef.value)
}

const initBridgeChart = () => {
  if (!bridgePieRef.value) return
  const { clientWidth, clientHeight } = bridgePieRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgePieRef.value)
    bridgeChart.setOption(buildPieOption(bridgePieData))
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgePieRef.value)
      bridgeChart.setOption(buildPieOption(bridgePieData))
    }
  })
  bridgeObserver.observe(bridgePieRef.value)
}

watch(tunnelPieRef, (el) => {
  if (el && !tunnelChart) initTunnelChart()
})

watch(bridgePieRef, (el) => {
  if (el && !bridgeChart) initBridgeChart()
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

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>