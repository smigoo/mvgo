<template>
  <div class="c-traffic-trend-root">
    <!-- 江阴靖江长江隧道流量 -->
    <div class="c-traffic-trend-section">
      <div class="c-traffic-trend-section-header">
        <span class="c-traffic-trend-section-title">江阴靖江长江隧道</span>
      </div>
      <div class="c-traffic-trend-chart-wrapper">
        <div ref="tunnelChartRef" class="c-traffic-trend-chart"></div>
      </div>
    </div>

    <!-- 江阴大桥流量 -->
    <div class="c-traffic-trend-section">
      <div class="c-traffic-trend-section-header">
        <span class="c-traffic-trend-section-title">江阴大桥</span>
      </div>
      <div class="c-traffic-trend-chart-wrapper">
        <div ref="bridgeChartRef" class="c-traffic-trend-chart"></div>
      </div>
    </div>

    <!-- 车型分布 -->
    <div class="c-traffic-trend-section">
      <div class="c-traffic-trend-section-header">
        <img :src="icon3" class="c-traffic-trend-section-icon" />
        <span class="c-traffic-trend-section-title">车型分布</span>
      </div>
      <div class="c-traffic-trend-vehicle-cards">
        <!-- 隧道车型 -->
        <div class="c-traffic-trend-vehicle-card" :style="{ backgroundImage: `url(${bgm_3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
          <div class="c-traffic-trend-vehicle-title-wrapper" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
            <span class="c-traffic-trend-vehicle-title">江阴靖江长江隧道</span>
          </div>
          <div class="c-traffic-trend-vehicle-content">
            <div class="c-traffic-trend-vehicle-stat">
              <span class="c-traffic-trend-vehicle-label">客车</span>
              <span class="c-traffic-trend-vehicle-value blue">22350</span>
            </div>
            <div class="c-traffic-trend-vehicle-chart-wrapper">
              <div ref="tunnelPieRef" class="c-traffic-trend-vehicle-chart"></div>
              <img :src="icon4" class="c-traffic-trend-vehicle-center-icon" />
            </div>
            <div class="c-traffic-trend-vehicle-stat">
              <span class="c-traffic-trend-vehicle-label">货车</span>
              <span class="c-traffic-trend-vehicle-value orange">16270</span>
            </div>
          </div>
        </div>
        <!-- 大桥车型 -->
        <div class="c-traffic-trend-vehicle-card" :style="{ backgroundImage: `url(${bgm_4})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
          <div class="c-traffic-trend-vehicle-title-wrapper" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
            <span class="c-traffic-trend-vehicle-title">江阴大桥</span>
          </div>
          <div class="c-traffic-trend-vehicle-content">
            <div class="c-traffic-trend-vehicle-stat">
              <span class="c-traffic-trend-vehicle-label">客车</span>
              <span class="c-traffic-trend-vehicle-value blue">66109</span>
            </div>
            <div class="c-traffic-trend-vehicle-chart-wrapper">
              <div ref="bridgePieRef" class="c-traffic-trend-vehicle-chart"></div>
              <img :src="icon5" class="c-traffic-trend-vehicle-center-icon" />
            </div>
            <div class="c-traffic-trend-vehicle-stat">
              <span class="c-traffic-trend-vehicle-label">货车</span>
              <span class="c-traffic-trend-vehicle-value orange">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 流量预测 -->
    <div class="c-traffic-trend-section">
      <div class="c-traffic-trend-section-header">
        <span class="c-traffic-trend-section-title">流量预测</span>
        <div class="c-traffic-trend-tabs">
          <span 
            v-for="tab in predictTabs" 
            :key="tab.key" 
            :class="['c-traffic-trend-tab-item', { 'is-active': activePredictTab === tab.key }]"
            @click="activePredictTab = tab.key"
          >
            {{ tab.label }}
          </span>
        </div>
        <span class="c-traffic-trend-holiday-link">节假日预测 ></span>
      </div>
      <div class="c-traffic-trend-chart-wrapper">
        <div ref="predictChartRef" class="c-traffic-trend-chart"></div>
      </div>
      <div class="c-traffic-trend-accuracy">
        <span>准确率98%</span>
        <span>准确率96%</span>
        <span>准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[TrafficTrendChart] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const activePredictTab = ref('tunnel')
const predictTabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

// --- 图表 Refs ---
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)
const predictChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelPie = null
let bridgePie = null
let predictChart = null
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

const mockAreaData = {
  tunnel: {
    actual: [1000, 1200, 1500, 1800, 2000],
    predict: [1100, 1300, 1600, 1900, 2200]
  },
  bridge: {
    actual: [2000, 2200, 2500, 2800, 3000],
    predict: [2100, 2300, 2600, 2900, 3200]
  }
}

// --- 图表更新函数 ---
const updateTunnelChart = () => {
  if (!tunnelChart) return
  tunnelChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 30, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: Array.from({length: 25}, (_, i) => i), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { name: '北京方向', type: 'bar', data: mockBarData.tunnel.beijing, itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] }, barWidth: 4, barGap: '20%' },
      { name: '上海方向', type: 'bar', data: mockBarData.tunnel.shanghai, itemStyle: { color: '#87cefa', borderRadius: [2, 2, 0, 0] }, barWidth: 4 }
    ]
  }, true)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  bridgeChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 30, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: Array.from({length: 25}, (_, i) => i), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { name: '北京方向', type: 'bar', data: mockBarData.bridge.beijing, itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] }, barWidth: 4, barGap: '20%' },
      { name: '上海方向', type: 'bar', data: mockBarData.bridge.shanghai, itemStyle: { color: '#87cefa', borderRadius: [2, 2, 0, 0] }, barWidth: 4 }
    ]
  }, true)
}

const updateTunnelPie = () => {
  if (!tunnelPie) return
  tunnelPie.setOption({
    series: [{ type: 'pie', radius: ['55%', '75%'], center: ['50%', '50%'], data: mockPieData.tunnel, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }]
  }, true)
}

const updateBridgePie = () => {
  if (!bridgePie) return
  bridgePie.setOption({
    series: [{ type: 'pie', radius: ['55%', '75%'], center: ['50%', '50%'], data: mockPieData.bridge, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2 } }]
  }, true)
}

const updatePredictChart = () => {
  if (!predictChart) return
  const data = mockAreaData[activePredictTab.value]
  predictChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['实际流量', '预测流量'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 30, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'], boundaryGap: false, axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { name: '实际流量', type: 'line', smooth: true, data: data.actual, lineStyle: { color: '#3385ff', width: 2 }, itemStyle: { color: '#3385ff' }, areaStyle: { color: 'rgba(51, 133, 255, 0.15)' } },
      { name: '预测流量', type: 'line', smooth: true, data: data.predict, lineStyle: { color: '#00cccc', width: 2 }, itemStyle: { color: '#00cccc' }, areaStyle: { color: 'rgba(0, 204, 204, 0.15)' } }
    ]
  }, true)
}

// --- 图表初始化函数 ---
const initTunnelChart = () => {
  if (!tunnelChartRef.value || tunnelChart) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
  }
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value || bridgeChart) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateBridgeChart()
  }
}

const initTunnelPie = () => {
  if (!tunnelPieRef.value || tunnelPie) return
  const { clientWidth, clientHeight } = tunnelPieRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelPie = echarts.init(tunnelPieRef.value)
    updateTunnelPie()
  }
}

const initBridgePie = () => {
  if (!bridgePieRef.value || bridgePie) return
  const { clientWidth, clientHeight } = bridgePieRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgePie = echarts.init(bridgePieRef.value)
    updateBridgePie()
  }
}

const initPredictChart = () => {
  if (!predictChartRef.value || predictChart) return
  const { clientWidth, clientHeight } = predictChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    predictChart = echarts.init(predictChartRef.value)
    updatePredictChart()
  }
}

// --- 监听 Ref 变化 ---
watch(tunnelChartRef, (newRef) => { if (newRef && !tunnelChart) initTunnelChart() })
watch(bridgeChartRef, (newRef) => { if (newRef && !bridgeChart) initBridgeChart() })
watch(tunnelPieRef, (newRef) => { if (newRef && !tunnelPie) initTunnelPie() })
watch(bridgePieRef, (newRef) => { if (newRef && !bridgePie) initBridgePie() })
watch(predictChartRef, (newRef) => { if (newRef && !predictChart) initPredictChart() })

// --- 监听 Tab 切换 ---
watch(activePredictTab, () => {
  updatePredictChart()
})

// --- 窗口 Resize ---
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
  if (tunnelPie) tunnelPie.resize()
  if (bridgePie) bridgePie.resize()
  if (predictChart) predictChart.resize()
}

// --- 生命周期 ---
onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  initTunnelPie()
  initBridgePie()
  initPredictChart()

  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })

  const elements = [tunnelChartRef.value, bridgeChartRef.value, tunnelPieRef.value, bridgePieRef.value, predictChartRef.value].filter(Boolean)
  elements.forEach(el => resizeObserver.observe(el))

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelPie?.dispose()
  bridgePie?.dispose()
  predictChart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-traffic-trend-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.c-traffic-trend-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.c-traffic-trend-section-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-traffic-trend-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255,255,255,0.8);
  position: relative;
  padding-left: 12px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 12px;
    background: linear-gradient(#388dff, #388dff);
    border-radius: 6px;
  }
}

.c-traffic-trend-section-icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
}

.c-traffic-trend-chart-wrapper {
  width: 100%;
  height: 130px;
  min-width: 0;
}

.c-traffic-trend-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

// 车型分布
.c-traffic-trend-vehicle-cards {
  display: flex;
  gap: 12px;
  width: 100%;
}

.c-traffic-trend-vehicle-card {
  flex: 1;
  min-width: 0;
  height: 114px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.c-traffic-trend-vehicle-title-wrapper {
  width: 130px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.c-traffic-trend-vehicle-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-traffic-trend-vehicle-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

.c-traffic-trend-vehicle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-traffic-trend-vehicle-label {
  font-size: 12px;
  color: #333333;
}

.c-traffic-trend-vehicle-value {
  font-size: 18px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;

  &.blue {
    color: #1399ff;
  }

  &.orange {
    color: #ff6a00;
  }
}

.c-traffic-trend-vehicle-chart-wrapper {
  width: 52px;
  height: 52px;
  position: relative;
  flex-shrink: 0;
}

.c-traffic-trend-vehicle-chart {
  width: 100%;
  height: 100%;
}

.c-traffic-trend-vehicle-center-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  pointer-events: none;
}

// 流量预测
.c-traffic-trend-tabs {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

.c-traffic-trend-tab-item {
  padding: 4px 12px;
  font-size: 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  background: #6680a0;
  color: #ffffff;
  border: 0.73px solid rgba(172,196,225,1);

  &.is-active {
    background: #1990ff;
    border-color: rgba(199,224,255,1);
    font-weight: 500;
  }
}

.c-traffic-trend-holiday-link {
  font-size: 12px;
  color: #1990ff;
  margin-left: auto;
  cursor: pointer;
}

.c-traffic-trend-accuracy {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 8px;
  
  span {
    font-size: 12px;
    font-weight: 500;
    color: #333333;
  }
}
</style>