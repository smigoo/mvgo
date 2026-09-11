<template>
  <div class="c-monitor-section vehicle-type-distribution">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon2" class="c-monitor-title-icon" alt="" />
        <span class="c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <!-- 内容区域：两列布局 -->
    <div class="c-monitor-section-body vehicle-type-body" :style="{ backgroundImage: `url(${bg2})` }">
      <!-- 左侧：江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-card tunnel-card">
        <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-monitor-vehicle-chart" />
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value passenger">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value truck">16270</span>
          </div>
        </div>
      </div>

      <!-- 右侧：江阴大桥 -->
      <div class="c-monitor-vehicle-card bridge-card">
        <div class="c-monitor-vehicle-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-monitor-vehicle-chart" />
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-stat-label">客车</span>
            <span class="c-monitor-stat-value passenger">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-stat-label">货车</span>
            <span class="c-monitor-stat-value truck">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 图表容器引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 更新隧道车型分布图表
const updateTunnelChart = () => {
  if (!tunnelChart) return
  
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          { value: 22350, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#ff8648' } }
        ]
      }
    ]
  }
  
  tunnelChart.setOption(option, true)
}

// 更新大桥车型分布图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          { value: 66109, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#ff8648' } }
        ]
      }
    ]
  }
  
  bridgeChart.setOption(option, true)
}

// 初始化隧道图表
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

// 初始化大桥图表
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

// 监听容器引用
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口大小变化处理
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

.vehicle-type-distribution {
  flex: 220 1 0;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vehicle-type-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-vehicle-label {
  font-size: 14px;
  color: #333333;
  font-weight: 500;
  text-align: center;
}

.c-monitor-vehicle-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-vehicle-stats {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding-top: 8px;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-stat-value {
  font-size: 14px;
  font-weight: 600;
  
  &.passenger {
    color: #1890ff;
  }
  
  &.truck {
    color: #ff8648;
  }
}
</style>