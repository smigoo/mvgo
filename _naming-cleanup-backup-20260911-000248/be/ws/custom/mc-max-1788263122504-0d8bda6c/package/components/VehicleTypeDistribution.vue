<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- 标题行 -->
    <div class="c-monitor-vtd-header">
      <div class="c-monitor-vtd-title-group">
        <div class="c-monitor-vtd-icon"></div>
        <span class="c-monitor-vtd-title">车型分布</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="c-monitor-vtd-body">
      <!-- 隧道车型分布卡片 -->
      <div class="c-monitor-vtd-card">
        <div
          class="c-monitor-vtd-card-bg"
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-monitor-vtd-card-content">
            <!-- 标题 -->
            <div
              class="c-monitor-vtd-card-title-wrapper"
              :style="{ backgroundImage: `url(${bg3})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <span class="c-monitor-vtd-card-title">江阴靖江长江隧道</span>
            </div>

            <!-- 图表区 -->
            <div class="c-monitor-vtd-chart-area">
              <div ref="tunnelChartRef" class="c-monitor-vtd-chart"></div>
            </div>

            <!-- 数据标签 -->
            <div class="c-monitor-vtd-stats">
              <div class="c-monitor-vtd-stat-item">
                <span class="c-monitor-vtd-stat-label">客车</span>
                <span class="c-monitor-vtd-stat-value c-monitor-vtd-stat-value-blue">22350</span>
              </div>
              <div class="c-monitor-vtd-stat-item">
                <span class="c-monitor-vtd-stat-label">货车</span>
                <span class="c-monitor-vtd-stat-value c-monitor-vtd-stat-value-orange">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 大桥车型分布卡片 -->
      <div class="c-monitor-vtd-card">
        <div
          class="c-monitor-vtd-card-bg"
          :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-monitor-vtd-card-content">
            <!-- 标题 -->
            <div
              class="c-monitor-vtd-card-title-wrapper"
              :style="{ backgroundImage: `url(${bg5})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <span class="c-monitor-vtd-card-title">江阴大桥</span>
            </div>

            <!-- 图表区 -->
            <div class="c-monitor-vtd-chart-area">
              <div ref="bridgeChartRef" class="c-monitor-vtd-chart"></div>
            </div>

            <!-- 数据标签 -->
            <div class="c-monitor-vtd-stats">
              <div class="c-monitor-vtd-stat-item">
                <span class="c-monitor-vtd-stat-label">客车</span>
                <span class="c-monitor-vtd-stat-value c-monitor-vtd-stat-value-blue">66109</span>
              </div>
              <div class="c-monitor-vtd-stat-item">
                <span class="c-monitor-vtd-stat-label">货车</span>
                <span class="c-monitor-vtd-stat-value c-monitor-vtd-stat-value-orange">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-_m-36.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg4 from '../../resources/images/bg-_m-35.png'
import bg5 from '../../resources/images/bg-3525.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

const updateTunnelChart = () => {
  if (!tunnelChart) return
  const option = {
    color: ['#1890FF', '#FF7A45'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: tunnelData
      }
    ]
  }
  tunnelChart.setOption(option, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    color: ['#1890FF', '#FF7A45'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: bridgeData
      }
    ]
  }
  bridgeChart.setOption(option, true)
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateBridgeChart()
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
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

const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
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