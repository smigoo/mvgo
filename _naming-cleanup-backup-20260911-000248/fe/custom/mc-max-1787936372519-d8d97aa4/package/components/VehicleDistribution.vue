<template>
  <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-vehicle-distribution">
    <!-- 标题栏 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-section-header">
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-wrapper">
        <img :src="icon2" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-icon" alt="" />
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-text">车型分布</span>
      </div>
    </div>

    <!-- 双卡片内容区 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道卡片 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-vehicle-card" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-card-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-container" />
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stats-row">
          <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-dot-blue"></span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-label">客车</span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-value">22350</span>
          </div>
          <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-dot-orange"></span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-label">货车</span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-vehicle-card" :style="{ backgroundImage: `url(${bg4})` }">
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-card-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-container" />
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stats-row">
          <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-dot-blue"></span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-label">客车</span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-value">0<!-- 🎯 待接入(36109) --></span>
          </div>
          <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-dot-orange"></span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-label">货车</span>
            <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-stat-value">16270</span>
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

import { ref, onMounted, onUnmounted, watch, defineProps} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ componentProps: { type: Object, default: () => ({}) }
})

// 资源变量（系统注入）

// 图表实例
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 隧道车型数据
const tunnelData = [ { name: '客车', value: 22350 }, { name: '货车', value: 16270 }
]

// 大桥车型数据
const bridgeData = [ { name: '客车', value: 36109 }, { name: '货车', value: 16270 }
]

// 初始化隧道图表
const initTunnelChart = () => { if (!tunnelChartRef.value) return
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
const initBridgeChart = () => { if (!bridgeChartRef.value) return
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
const updateTunnelChart = () => { if (!tunnelChart) return
const option = { color: ['rgba(25, 144, 255, 1)', 'rgba(255, 139, 0, 1)'], tooltip: { trigger: 'item', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12 }, formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: tunnelData,
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

// 更新大桥图表
const updateBridgeChart = () => { if (!bridgeChart) return
const option = { color: ['rgba(25, 144, 255, 1)', 'rgba(255, 139, 0, 1)'], tooltip: { trigger: 'item', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12 }, formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: bridgeData,
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

// 监听图表容器
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口大小变化处理
const handleResize = () => { tunnelChart?.resize()
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

<style scoped lang="less">
@color-text-primary: #409EFF;

@import '../../resources/styles/index.less';

.c-monitor-vehicle-distribution {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 16px;
  font-weight: 500;
  color: @color-text-primary;
}

.c-monitor-vehicle-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  padding: 16px;
  box-sizing: border-box;
  min-height: 0;}

.c-monitor-card-label {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  text-align: center;
  margin-bottom: 8px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-stats-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 12px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-stat-dot-blue {
  background: rgba(25, 144, 255, 1);
}

.c-monitor-stat-dot-orange {
  background: rgba(255, 139, 0, 1);
}

.c-monitor-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-stat-value {
  font-size: 14px;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
</style>