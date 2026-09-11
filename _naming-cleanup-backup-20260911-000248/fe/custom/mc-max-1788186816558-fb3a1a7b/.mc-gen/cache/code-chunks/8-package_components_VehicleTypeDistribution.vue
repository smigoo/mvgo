<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">车型分布</span>
      </div>
      <img :src="icon2" class="c-monitor-info-icon" alt="info" />
    </div>

    <!-- 车型卡片容器 -->
    <div class="c-monitor-vehicle-cards">
      <!-- 隧道车型卡片 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-card-content">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value tunnel-passenger">22350</span>
            </div>
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value tunnel-freight">16270</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 大桥车型卡片 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-card-content">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value bridge-passenger">66109</span>
            </div>
            <div class="c-monitor-vehicle-stat-item">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value bridge-freight">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

defineOptions({ name: 'VehicleTypeDistribution' })

// 资源引用
const icon2 = 'icon2'
const bg4 = 'bg4'

// 图表引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 初始化隧道车型饼图
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

// 初始化大桥车型饼图
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

// 更新隧道车型饼图
const updateTunnelChart = () => {
  if (!tunnelChart) return

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: [
          { value: 22350, name: '客车', itemStyle: { color: '#559EFF' } },
          { value: 16270, name: '货车', itemStyle: { color: '#FF8B67' } }
        ],
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }

  tunnelChart.setOption(option, true)
}

// 更新大桥车型饼图
const updateBridgeChart = () => {
  if (!bridgeChart) return

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: [
          { value: 66109, name: '客车', itemStyle: { color: '#559EFF' } },
          { value: 16270, name: '货车', itemStyle: { color: '#FF8B67' } }
        ],
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }

  bridgeChart.setOption(option, true)
}

// 监听 ref 变化
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口调整处理
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

.c-monitor-vehicle-distribution {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-info-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}

.c-monitor-vehicle-cards {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  overflow: hidden;
}

.c-monitor-vehicle-card-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 12px;
}

.c-monitor-vehicle-chart {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-monitor-vehicle-stat-label {
  font-size: calc(@fontSize * 1);
  color: rgba(255, 255, 255, 0.8);
  line-height: 18px;
}

.c-monitor-vehicle-stat-value {
  font-size: calc(@fontSize * 1);
  font-weight: 600;
  line-height: 18px;
}

.c-monitor-vehicle-stat-value.tunnel-passenger,
.c-monitor-vehicle-stat-value.bridge-passenger {
  color: #559EFF;
}

.c-monitor-vehicle-stat-value.tunnel-freight,
.c-monitor-vehicle-stat-value.bridge-freight {
  color: #FF8B67;
}
</style>