<template>
  <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-distribution">
    <!-- 区域标题 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-header">
      <img :src="icon2" class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-icon" alt="icon" />
      <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-section-title">车型分布</span>
    </div>

    <!-- 两列布局 -->
    <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-grid">
      <!-- 左侧：江阴靖江长江隧道 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-card">
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-chart"></div>
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stats">
          <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-dot-passenger"></span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-value">22350</span>
          </div>
          <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-dot-truck"></span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-label">货车</span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-value">16270</span>
          </div>
        </div>
      </div>

      <!-- 右侧：江阴大桥 -->
      <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-card">
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-chart"></div>
        <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stats">
          <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-dot-passenger"></span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-value">66109</span>
          </div>
          <div class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-dot-truck"></span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-label">货车</span>
            <span class="c-mc-max-1787923891329-6921ec8a-c-monitor-vehicle-stat-value">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'

import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// 资源变量（由系统注入）

// 图表引用
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
    color: ['rgba(24,144,255,1)', 'rgba(255,125,0,1)'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 22350, name: '客车' },
          { value: 16270, name: '货车' }
        ]
      }
    ]
  }
  tunnelChart.setOption(option, true)
}

// 更新大桥图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  const option = {
    color: ['rgba(24,144,255,1)', 'rgba(255,125,0,1)'],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: 66109, name: '客车' },
          { value: 16270, name: '货车' }
        ]
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

// 窗口 resize 处理
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

.c-monitor-vehicle-distribution {
  width: 100%;
  flex: 174 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 24px;
}

.c-monitor-vehicle-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.c-monitor-vehicle-card {
  background: rgba(255, 255, 255, 1);
  border-radius: 4px;
  padding: 12px;
  overflow: hidden;
}

.c-monitor-vehicle-label {
  font-size: 14px;
  color: rgba(102, 102, 102, 1);
  text-align: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-vehicle-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
  flex-shrink: 0;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-vehicle-stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-vehicle-stat-dot-passenger {
  background: rgba(24, 144, 255, 1);
}

.c-monitor-vehicle-stat-dot-truck {
  background: rgba(255, 125, 0, 1);
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  color: rgba(102, 102, 102, 1);
}

.c-monitor-vehicle-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
}
</style>