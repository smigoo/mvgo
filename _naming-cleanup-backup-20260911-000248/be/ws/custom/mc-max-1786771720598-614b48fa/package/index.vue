<template>
  <base-panel panelKey="default-panel">
    <div class="c-traffic-monitor-root">
      <!-- Header -->
      <div class="c-traffic-monitor-header">
        <div class="c-traffic-monitor-header-left">
          <span class="c-traffic-monitor-header-icon"></span>
          <span class="c-traffic-monitor-header-title">流量监测</span>
        </div>
        <span class="c-traffic-monitor-header-tip">*数据实时更新</span>
      </div>

      <!-- Slot 1: 当日总流量 -->
      <TrafficStatCards />

      <!-- Slot 2: 车型分布 -->
      <div class="c-traffic-vehicle-section">
        <div class="c-traffic-section-header">
          <div class="c-traffic-section-title-wrapper">
            <span class="c-traffic-section-icon"></span>
            <span class="c-traffic-section-title">车型分布</span>
          </div>
        </div>
        <div class="c-traffic-vehicle-body">
          <!-- 隧道车型 -->
          <div class="c-traffic-vehicle-card" :style="{ backgroundImage: `url(${bgm_3})` }">
            <div class="c-traffic-vehicle-title-wrapper" :style="{ backgroundImage: `url(${bg3})` }">
              <span class="c-traffic-vehicle-title">江阴靖江长江隧道</span>
            </div>
            <div class="c-traffic-vehicle-content">
              <div class="c-traffic-vehicle-stat">
                <span class="c-traffic-vehicle-stat-label">客车</span>
                <span class="c-traffic-vehicle-stat-value blue">22350</span>
              </div>
              <div class="c-traffic-vehicle-chart-wrapper">
                <div ref="tunnelPieRef" class="c-traffic-vehicle-chart"></div>
                <img :src="icon4" class="c-traffic-vehicle-center-icon" />
              </div>
              <div class="c-traffic-vehicle-stat">
                <span class="c-traffic-vehicle-stat-label">货车</span>
                <span class="c-traffic-vehicle-stat-value orange">16270</span>
              </div>
            </div>
          </div>
          <!-- 大桥车型 -->
          <div class="c-traffic-vehicle-card" :style="{ backgroundImage: `url(${bgm_4})` }">
            <div class="c-traffic-vehicle-title-wrapper" :style="{ backgroundImage: `url(${bg5})` }">
              <span class="c-traffic-vehicle-title">江阴大桥</span>
            </div>
            <div class="c-traffic-vehicle-content">
              <div class="c-traffic-vehicle-stat">
                <span class="c-traffic-vehicle-stat-label">客车</span>
                <span class="c-traffic-vehicle-stat-value blue">66109</span>
              </div>
              <div class="c-traffic-vehicle-chart-wrapper">
                <div ref="bridgePieRef" class="c-traffic-vehicle-chart"></div>
                <img :src="icon5" class="c-traffic-vehicle-center-icon" />
              </div>
              <div class="c-traffic-vehicle-stat">
                <span class="c-traffic-vehicle-stat-label">货车</span>
                <span class="c-traffic-vehicle-stat-value orange">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Slot 3: 流量预测 -->
      <TrafficTrendChart />
    </div>
  </base-panel>
</template>

<script setup>
import bg3 from '../resources/images/bg-3475.png'
import icon4 from '../resources/images/icon-3441.png'
import bg5 from '../resources/images/bg-3525.png'
import icon5 from '../resources/images/icon-3573.png'
import bgm_3 from '../resources/images/bg-_m-36.png'
import bgm_4 from '../resources/images/bg-_m-35.png'

import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import TrafficStatCards from './components/TrafficStatCards.vue'
import TrafficTrendChart from './components/TrafficTrendChart.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[traffic-monitor] $mcComponentBuilder 失败:', e)
}

// --- 图表 Refs ---
const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)
let tunnelPie = null
let bridgePie = null
let resizeObserver = null

// --- Mock 数据 ---
const mockPieData = {
  tunnel: [
    { value: 22350, name: '客车', itemStyle: { color: '#1399ff' } },
    { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
  ],
  bridge: [
    { value: 66109, name: '客车', itemStyle: { color: '#1399ff' } },
    { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
  ]
}

// --- 图表更新函数 ---
const updateTunnelPie = () => {
  if (!tunnelPie) return
  tunnelPie.setOption({
    series: [{ 
      type: 'pie', 
      radius: ['55%', '75%'], 
      center: ['50%', '50%'], 
      data: mockPieData.tunnel, 
      label: { show: false }, 
      itemStyle: { borderColor: '#fff', borderWidth: 2 } 
    }]
  }, true)
}

const updateBridgePie = () => {
  if (!bridgePie) return
  bridgePie.setOption({
    series: [{ 
      type: 'pie', 
      radius: ['55%', '75%'], 
      center: ['50%', '50%'], 
      data: mockPieData.bridge, 
      label: { show: false }, 
      itemStyle: { borderColor: '#fff', borderWidth: 2 } 
    }]
  }, true)
}

// --- 图表初始化函数 ---
const initTunnelPie = () => {
  if (!tunnelPieRef.value || tunnelPie) return
  tunnelPie = echarts.init(tunnelPieRef.value)
  updateTunnelPie()
}

const initBridgePie = () => {
  if (!bridgePieRef.value || bridgePie) return
  bridgePie = echarts.init(bridgePieRef.value)
  updateBridgePie()
}

// --- 窗口 Resize ---
const handleResize = () => {
  if (tunnelPie) tunnelPie.resize()
  if (bridgePie) bridgePie.resize()
}

// --- 生命周期 ---
onMounted(() => {
  initTunnelPie()
  initBridgePie()

  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })

  const elements = [tunnelPieRef.value, bridgePieRef.value].filter(Boolean)
  elements.forEach(el => resizeObserver.observe(el))

  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'traffic-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  tunnelPie?.dispose()
  bridgePie?.dispose()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>