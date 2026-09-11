<template>
  <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-section">
    <!-- 区域标题 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-header">
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title-wrapper">
        <img :src="icon2" class="c-monitor-section-icon" alt="" />
        <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title">车型分布</span>
      </div>
    </div>

    <!-- 车型分布内容区 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-content">
      <!-- 江阴靖江长江隧道车型分布 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card">
        <!-- 背景装饰 -->
        <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
        
        <!-- 内容 -->
        <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card-content">
          <!-- 地点标签 -->
          <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location">
            <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location-bar"></span>
            <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location-text">{{ tunnelVehicleData.label }}</span>
          </div>

          <!-- 环形图 -->
          <div ref="tunnelChartRef" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-chart"></div>

          <!-- 统计数值 -->
          <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stats">
            <div
              v-for="item in tunnelVehicleData.pieData"
              :key="item.name"
              class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-item"
            >
              <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-label">{{ item.name }}</span>
              <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-value" :style="{ color: item.color }">
                {{ item.value.toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥车型分布 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card">
        <!-- 背景装饰 -->
        <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card-bg" :style="{ backgroundImage: `url(${bg4})` }"></div>
        
        <!-- 内容 -->
        <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-card-content">
          <!-- 地点标签 -->
          <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location">
            <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location-bar"></span>
            <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-location-text">{{ bridgeVehicleData.label }}</span>
          </div>

          <!-- 环形图 -->
          <div ref="bridgeChartRef" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-chart"></div>

          <!-- 统计数值 -->
          <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stats">
            <div
              v-for="item in bridgeVehicleData.pieData"
              :key="item.name"
              class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-item"
            >
              <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-label">{{ item.name }}</span>
              <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-vehicle-stat-value" :style="{ color: item.color }">
                {{ item.value.toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  tunnelVehicleData: {
    type: Object,
    default: () => ({
      label: '江阴靖江长江隧道',
      pieData: []
    })
  },
  bridgeVehicleData: {
    type: Object,
    default: () => ({
      label: '江阴大桥',
      pieData: []
    })
  },
  activeLocation: {
    type: String,
    default: 'tunnel'
  }
})

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

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
      formatter: (params) => {
        return `${params.name}<br/>${params.value} 辆 (${params.percent}%)`
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 0,
          borderColor: '#fff',
          borderWidth: 0
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: false
          }
        },
        labelLine: {
          show: false
        },
        data: props.tunnelVehicleData.pieData.map(item => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: item.color
          }
        }))
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
      formatter: (params) => {
        return `${params.name}<br/>${params.value} 辆 (${params.percent}%)`
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 0,
          borderColor: '#fff',
          borderWidth: 0
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: false
          }
        },
        labelLine: {
          show: false
        },
        data: props.bridgeVehicleData.pieData.map(item => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: item.color
          }
        }))
      }
    ]
  }
  
  bridgeChart.setOption(option, true)
}

// 监听图表容器
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 监听数据变化
watch(
  () => props.tunnelVehicleData,
  () => {
    updateTunnelChart()
  },
  { deep: true }
)

watch(
  () => props.bridgeVehicleData,
  () => {
    updateBridgeChart()
  },
  { deep: true }
)

// 窗口尺寸变化处理
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
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