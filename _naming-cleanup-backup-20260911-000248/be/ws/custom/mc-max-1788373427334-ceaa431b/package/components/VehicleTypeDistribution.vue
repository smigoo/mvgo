<template>
  <div class="c-monitor-vehicle-section">
    <!-- 标题栏 -->
    <div class="c-monitor-vehicle-header">
      <div class="c-monitor-vehicle-title-wrapper">
        <div class="c-monitor-vehicle-title-icon"></div>
        <span class="c-monitor-vehicle-title-text">车型分布</span>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="c-monitor-vehicle-content" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-card-header">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-card-body">
          <!-- 环形图 -->
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
          
          <!-- 图例数据 -->
          <div class="c-monitor-vehicle-legend">
            <div 
              class="c-monitor-vehicle-legend-item"
              :class="{ active: tunnelLegendState.passenger }"
              @click="toggleTunnelLegend('客车')"
            >
              <div class="c-monitor-vehicle-legend-dot" style="background: #1890ff;"></div>
              <span class="c-monitor-vehicle-legend-label">客车</span>
              <span class="c-monitor-vehicle-legend-value">22350</span>
            </div>
            <div 
              class="c-monitor-vehicle-legend-item"
              :class="{ active: tunnelLegendState.truck }"
              @click="toggleTunnelLegend('货车')"
            >
              <div class="c-monitor-vehicle-legend-dot" style="background: #ff9966;"></div>
              <span class="c-monitor-vehicle-legend-label">货车</span>
              <span class="c-monitor-vehicle-legend-value">16270</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-vehicle-card">
        <div class="c-monitor-vehicle-card-header">江阴大桥</div>
        <div class="c-monitor-vehicle-card-body">
          <!-- 环形图 -->
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
          
          <!-- 图例数据 -->
          <div class="c-monitor-vehicle-legend">
            <div 
              class="c-monitor-vehicle-legend-item"
              :class="{ active: bridgeLegendState.passenger }"
              @click="toggleBridgeLegend('客车')"
            >
              <div class="c-monitor-vehicle-legend-dot" style="background: #1890ff;"></div>
              <span class="c-monitor-vehicle-legend-label">客车</span>
              <span class="c-monitor-vehicle-legend-value">66109</span>
            </div>
            <div 
              class="c-monitor-vehicle-legend-item"
              :class="{ active: bridgeLegendState.truck }"
              @click="toggleBridgeLegend('货车')"
            >
              <div class="c-monitor-vehicle-legend-dot" style="background: #ff9966;"></div>
              <span class="c-monitor-vehicle-legend-label">货车</span>
              <span class="c-monitor-vehicle-legend-value">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-_m-35.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelChartObserver = null
let bridgeChartObserver = null

// 图例状态
const tunnelLegendState = ref({ passenger: true, truck: true })
const bridgeLegendState = ref({ passenger: true, truck: true })

// 隧道图表数据
const tunnelData = ref([
  { value: 22350, name: '客车' },
  { value: 16270, name: '货车' }
])

// 大桥图表数据
const bridgeData = ref([
  { value: 66109, name: '客车' },
  { value: 16270, name: '货车' }
])

// 初始化隧道图表
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
    return
  }
  
  tunnelChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelChartObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  })
  tunnelChartObserver.observe(tunnelChartRef.value)
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
  
  bridgeChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeChartObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
    }
  })
  bridgeChartObserver.observe(bridgeChartRef.value)
}

// 更新隧道图表
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
    legend: {
      show: false
    },
    series: [
      {
        name: '车型分布',
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
        data: tunnelData.value,
        color: ['#1890ff', '#ff9966']
      }
    ]
  }
  
  tunnelChart.setOption(option, true)
}

// 更新大桥图表
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
    legend: {
      show: false
    },
    series: [
      {
        name: '车型分布',
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
        data: bridgeData.value,
        color: ['#1890ff', '#ff9966']
      }
    ]
  }
  
  bridgeChart.setOption(option, true)
}

// 切换隧道图例
const toggleTunnelLegend = (name) => {
  tunnelChart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '客车' ? 'passenger' : 'truck'
  tunnelLegendState.value[key] = !tunnelLegendState.value[key]
}

// 切换大桥图例
const toggleBridgeLegend = (name) => {
  bridgeChart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '客车' ? 'passenger' : 'truck'
  bridgeLegendState.value[key] = !bridgeLegendState.value[key]
}

// 监听 chartRef
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口缩放处理
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
  tunnelChartObserver?.disconnect()
  bridgeChartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-section {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-vehicle-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-vehicle-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-vehicle-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-vehicle-title-text {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-vehicle-content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;}

.c-monitor-vehicle-card-header {
  flex-shrink: 0;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  margin-bottom: 8px;
}

.c-monitor-vehicle-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-vehicle-chart {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
}

.c-monitor-vehicle-legend {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;}

.c-monitor-vehicle-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-vehicle-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-vehicle-legend-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: #333333;
  line-height: 18px;
}

.c-monitor-vehicle-legend-value {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 600;
  color: #333333;
  line-height: 18px;
  margin-left: auto;
}
</style>