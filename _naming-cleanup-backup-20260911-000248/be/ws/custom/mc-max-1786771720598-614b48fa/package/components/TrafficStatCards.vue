<template>
  <div class="c-traffic-stat-cards">
    <!-- 当日总流量 -->
    <div class="c-traffic-stat-section">
      <div class="c-traffic-section-header">
        <div class="c-traffic-section-title-wrapper">
          <span class="c-traffic-section-icon"></span>
          <span class="c-traffic-section-title">当日总流量</span>
        </div>
        <div class="c-traffic-stat-selector">
          <span>24小时</span>
          <span class="c-traffic-stat-arrow">▼</span>
        </div>
      </div>
      <div class="c-traffic-daily-body" :style="{ backgroundImage: `url(${bgm_2})` }">
        <div class="c-traffic-stat-card">
          <span class="c-traffic-stat-label">江阴靖江长江隧道</span>
          <span class="c-traffic-stat-value c-traffic-stat-value--tunnel">34,620</span>
        </div>
        <div class="c-traffic-stat-card">
          <span class="c-traffic-stat-label">江阴大桥</span>
          <span class="c-traffic-stat-value c-traffic-stat-value--bridge">82,379</span>
        </div>
      </div>
      
      <!-- 隧道柱状图 -->
      <div class="c-traffic-chart-section">
        <div class="c-traffic-chart-header">
          <span class="c-traffic-chart-header-icon"></span>
          <span class="c-traffic-chart-header-title">江阴靖江长江隧道</span>
        </div>
        <div class="c-traffic-chart-wrapper">
          <div ref="tunnelChartRef" class="c-traffic-chart"></div>
        </div>
      </div>

      <!-- 大桥柱状图 -->
      <div class="c-traffic-chart-section">
        <div class="c-traffic-chart-header">
          <span class="c-traffic-chart-header-icon"></span>
          <span class="c-traffic-chart-header-title">江阴大桥</span>
        </div>
        <div class="c-traffic-chart-wrapper">
          <div ref="bridgeChartRef" class="c-traffic-chart"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bgm_2 from '../../resources/images/bg-_m-34.png'

import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 图表 Refs ---
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let resizeObserver = null

// --- Mock 数据 ---
const mockBarData = {
  tunnel: {
    beijing: [100, 120, 80, 90, 150, 200, 300, 400, 500, 450, 400, 350, 300, 250, 200, 825, 300, 250, 200, 150, 100, 80, 60, 50, 40],
    shanghai: [110, 130, 90, 100, 160, 210, 310, 410, 510, 460, 410, 360, 310, 260, 210, 831, 310, 260, 210, 160, 110, 90, 70, 60, 50]
  },
  bridge: {
    beijing: [200, 220, 180, 190, 250, 300, 400, 500, 600, 550, 500, 450, 400, 350, 300, 825, 400, 350, 300, 250, 200, 180, 160, 150, 140],
    shanghai: [210, 230, 190, 200, 260, 310, 410, 510, 610, 560, 510, 460, 410, 360, 310, 831, 410, 360, 310, 260, 210, 190, 170, 160, 150]
  }
}

// --- 图表更新函数 ---
const updateTunnelChart = () => {
  if (!tunnelChart) return
  tunnelChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 20, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: Array.from({length: 25}, (_, i) => i), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { 
        name: '北京方向', 
        type: 'bar', 
        data: mockBarData.tunnel.beijing, 
        barWidth: 4, 
        barGap: '20%',
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d7' }
          ]),
          borderRadius: [2, 2, 0, 0],
          shadowColor: 'rgba(31, 231, 232, 0.4)',
          shadowBlur: 2
        } 
      },
      { 
        name: '上海方向', 
        type: 'bar', 
        data: mockBarData.tunnel.shanghai, 
        barWidth: 4,
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0],
          shadowColor: 'rgba(25, 144, 255, 0.4)',
          shadowBlur: 2
        } 
      }
    ]
  }, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  bridgeChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 20, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: Array.from({length: 25}, (_, i) => i), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { 
        name: '北京方向', 
        type: 'bar', 
        data: mockBarData.bridge.beijing, 
        barWidth: 4, 
        barGap: '20%',
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d7' }
          ]),
          borderRadius: [2, 2, 0, 0],
          shadowColor: 'rgba(31, 231, 232, 0.4)',
          shadowBlur: 2
        } 
      },
      { 
        name: '上海方向', 
        type: 'bar', 
        data: mockBarData.bridge.shanghai, 
        barWidth: 4,
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0],
          shadowColor: 'rgba(25, 144, 255, 0.4)',
          shadowBlur: 2
        } 
      }
    ]
  }, true)
}

// --- 图表初始化函数 ---
const initTunnelChart = () => {
  if (!tunnelChartRef.value || tunnelChart) return
  tunnelChart = echarts.init(tunnelChartRef.value)
  updateTunnelChart()
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value || bridgeChart) return
  bridgeChart = echarts.init(bridgeChartRef.value)
  updateBridgeChart()
}

// --- 窗口 Resize ---
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

// --- 生命周期 ---
onMounted(() => {
  initTunnelChart()
  initBridgeChart()

  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })

  const elements = [tunnelChartRef.value, bridgeChartRef.value].filter(Boolean)
  elements.forEach(el => resizeObserver.observe(el))

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-traffic-stat-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.c-traffic-stat-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>