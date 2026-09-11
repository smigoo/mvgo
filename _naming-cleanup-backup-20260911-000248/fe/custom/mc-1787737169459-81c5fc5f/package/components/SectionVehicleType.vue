<template>
  <section class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-section">
    <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-header">
      <img :src="icon6" class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-header-icon" alt="车型分布" />
      <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-title">车型分布</span>
    </div>

    <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card">
        <div
          class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card-top"
          :style="{ backgroundImage: `url(${bg2})` }"
        >
          <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card-name">江阴靖江长江隧道</span>
          <div ref="tunnelChartRef" class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stats">
          <div
            class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat"
            :class="{ 'c-monitor-vehicle-stat--inactive': !legendStates.tunnel.passenger }"
            @click="toggleLegend('tunnel', 'passenger')"
          >
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value--passenger">22350</span>
          </div>
          <div
            class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat"
            :class="{ 'c-monitor-vehicle-stat--inactive': !legendStates.tunnel.freight }"
            @click="toggleLegend('tunnel', 'freight')"
          >
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-label">货车</span>
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value--freight">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card">
        <div
          class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card-top"
          :style="{ backgroundImage: `url(${bg4})` }"
        >
          <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-card-name">江阴大桥</span>
          <div ref="bridgeChartRef" class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-chart"></div>
        </div>
        <div class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stats">
          <div
            class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat"
            :class="{ 'c-monitor-vehicle-stat--inactive': !legendStates.bridge.passenger }"
            @click="toggleLegend('bridge', 'passenger')"
          >
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value--passenger">66109</span>
          </div>
          <div
            class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat"
            :class="{ 'c-monitor-vehicle-stat--inactive': !legendStates.bridge.freight }"
            @click="toggleLegend('bridge', 'freight')"
          >
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-label">货车</span>
            <span class="c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value c-mc-max-1787736422136-74deb182-c-monitor-vehicle-stat-value--freight">16270</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import icon6 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'

import { onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

const charts = {}
const observers = {}

const chartData = {
  'c-monitor-tunnel': {
    passenger: { name: '客车', value: 22350, color: '#2ba0ff' },
    freight: { name: '货车', value: 16270, color: '#ffa22f' }
  },
  'c-monitor-bridge': {
    passenger: { name: '客车', value: 66109, color: '#2ba0ff' },
    freight: { name: '货车', value: 16270, color: '#ffa22f' }
  }
}

const legendStates = reactive({
  'c-monitor-tunnel': { passenger: true, freight: true },
  'c-monitor-bridge': { passenger: true, freight: true }
})

const updatePieChart = (chartKey) => {
  const chart = charts[chartKey]
  if (!chart) return

  const dataMap = chartData[chartKey]
  const seriesData = [
    { name: '客车', value: dataMap.passenger.value, itemStyle: { color: dataMap.passenger.color } },
    { name: '货车', value: dataMap.freight.value, itemStyle: { color: dataMap.freight.color } }
  ]

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderColor: 'rgba(255, 255, 255, 0.25)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: '{b}：{c} 辆'
    },
    legend: {
      show: false,
      data: ['客车', '货车']
    },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { scale: false },
      data: seriesData
    }]
  }, true)
}

const initPieChart = (chartKey, el) => {
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(el)
    charts[chartKey] = chart
    updatePieChart(chartKey)
    return
  }

  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !charts[chartKey]) {
      observer.disconnect()
      const chart = echarts.init(el)
      charts[chartKey] = chart
      updatePieChart(chartKey)
    }
  })
  observer.observe(el)
  observers[chartKey] = observer
}

const toggleLegend = (chartKey, type) => {
  const chart = charts[chartKey]
  if (!chart) return

  const name = type === 'passenger' ? '客车' : '货车'
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendStates[chartKey][type] = !legendStates[chartKey][type]
}

const handleResize = () => {
  if (charts.tunnel) charts.tunnel.resize()
  if (charts.bridge) charts.bridge.resize()
}

watch(tunnelChartRef, (ref) => {
  if (ref && !charts.tunnel) initPieChart('tunnel', ref)
})

watch(bridgeChartRef, (ref) => {
  if (ref && !charts.bridge) initPieChart('bridge', ref)
})

onMounted(() => {
  if (tunnelChartRef.value && !charts.tunnel) initPieChart('tunnel', tunnelChartRef.value)
  if (bridgeChartRef.value && !charts.bridge) initPieChart('bridge', bridgeChartRef.value)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (charts.tunnel) charts.tunnel.dispose()
  if (charts.bridge) charts.bridge.dispose()
  if (observers.tunnel) observers.tunnel.disconnect()
  if (observers.bridge) observers.bridge.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-section {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.c-monitor-vehicle-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
}

.c-monitor-vehicle-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: block;
}

.c-monitor-vehicle-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-vehicle-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 3px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-vehicle-card-top {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  overflow: hidden;
}

.c-monitor-vehicle-card-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-vehicle-chart {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  margin-top: 2px;
}

.c-monitor-vehicle-stats {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  min-height: 36px;
  padding: 2px 4px 0;
}

.c-monitor-vehicle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: opacity 0.2s ease;
  flex: 1;
  min-width: 0;
  min-height: 0;}

.c-monitor-vehicle-stat--inactive {
  opacity: 0.42;
}

.c-monitor-vehicle-stat-label {
  font-family: 'Alibaba PuHuiTi', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
}

.c-monitor-vehicle-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 18px;
  white-space: nowrap;
}

.c-monitor-vehicle-stat-value--passenger {
  color: #1399ff;
}

.c-monitor-vehicle-stat-value--freight {
  color: #ff6a00;
}
</style>