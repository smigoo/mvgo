<template>
  <div class="c-stat-cards-root">
    <!-- 子标题区域 -->
    <div class="c-stat-cards-subheader">
      <div class="c-stat-cards-title-group">
        <img :src="icon3" class="c-stat-cards-title-icon" />
        <span class="c-stat-cards-title">当日总流量</span>
      </div>
      <div class="c-stat-cards-select-wrapper">
        <a-select v-model:value="timeRange" class="c-stat-cards-select" :bordered="false">
          <a-select-option value="24h">24小时</a-select-option>
        </a-select>
      </div>
    </div>

    <!-- 数据展示区 -->
    <div 
      class="c-stat-cards-data-row" 
      :style="{ 
        backgroundImage: `url(${bgm_2})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-stat-cards-data-item">
        <span class="c-stat-cards-data-label">江阴靖江长江隧道</span>
        <span class="c-stat-cards-data-value tunnel">34,620</span>
      </div>
      <div class="c-stat-cards-center-icon">
        <img :src="icon4" class="c-stat-cards-car-icon" />
      </div>
      <div class="c-stat-cards-data-item right">
        <span class="c-stat-cards-data-label">江阴大桥</span>
        <span class="c-stat-cards-data-value bridge">82,379</span>
      </div>
    </div>

    <!-- 图表1：江阴靖江长江隧道 -->
    <div class="c-stat-cards-chart-section">
      <div class="c-stat-cards-chart-header">
        <span class="c-stat-cards-chart-bar"></span>
        <span class="c-stat-cards-chart-title">江阴靖江长江隧道</span>
        <div class="c-stat-cards-legend">
          <span 
            class="c-stat-cards-legend-item" 
            :class="{ inactive: !tunnelLegend.beijing }" 
            @click="toggleTunnelLegend('北京方向')"
          >
            <i class="c-stat-cards-legend-dot beijing"></i>北京方向
          </span>
          <span 
            class="c-stat-cards-legend-item" 
            :class="{ inactive: !tunnelLegend.shanghai }" 
            @click="toggleTunnelLegend('上海方向')"
          >
            <i class="c-stat-cards-legend-dot shanghai"></i>上海方向
          </span>
        </div>
      </div>
      <div ref="tunnelChartRef" class="c-stat-cards-chart-container"></div>
    </div>

    <!-- 图表2：江阴大桥 -->
    <div class="c-stat-cards-chart-section">
      <div class="c-stat-cards-chart-header">
        <span class="c-stat-cards-chart-bar"></span>
        <span class="c-stat-cards-chart-title">江阴大桥</span>
        <div class="c-stat-cards-legend">
          <span 
            class="c-stat-cards-legend-item" 
            :class="{ inactive: !bridgeLegend.beijing }" 
            @click="toggleBridgeLegend('北京方向')"
          >
            <i class="c-stat-cards-legend-dot beijing"></i>北京方向
          </span>
          <span 
            class="c-stat-cards-legend-item" 
            :class="{ inactive: !bridgeLegend.shanghai }" 
            @click="toggleBridgeLegend('上海方向')"
          >
            <i class="c-stat-cards-legend-dot shanghai"></i>上海方向
          </span>
        </div>
      </div>
      <div ref="bridgeChartRef" class="c-stat-cards-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 响应式状态 ---
const timeRange = ref('24h')
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const tunnelChart = ref(null)
const bridgeChart = ref(null)
const tunnelObserver = ref(null)
const bridgeObserver = ref(null)

const tunnelLegend = ref({ beijing: true, shanghai: true })
const bridgeLegend = ref({ beijing: true, shanghai: true })

// --- 图表数据 ---
const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const tunnelDataBeijing = [200, 150, 100, 120, 300, 500, 800, 825, 1500, 1100, 800, 400]
const tunnelDataShanghai = [180, 140, 110, 130, 280, 480, 750, 831, 1450, 1050, 780, 380]

const bridgeDataBeijing = [300, 250, 200, 220, 400, 600, 900, 1200, 1800, 1300, 1000, 500]
const bridgeDataShanghai = [280, 230, 190, 210, 380, 580, 850, 1150, 1750, 1250, 950, 480]

// --- 图表配置 ---
const getChartOption = (dataBeijing, dataShanghai) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 },
    formatter: (params) => {
      let res = `${params[0].axisValue}时<br/>`
      params.forEach(p => {
        res += `${p.marker}${p.seriesName}: ${p.value} 辆<br/>`
      })
      return res
    }
  },
  legend: { show: false },
  grid: { left: 36, right: 16, top: 16, bottom: 24, containLabel: false },
  xAxis: {
    type: 'category',
    data: xData,
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisTick: { show: false },
    axisLabel: { color: '#666666', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    max: 4000,
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#666666', fontSize: 10 }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: dataBeijing,
      itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4,
      barGap: '30%'
    },
    {
      name: '上海方向',
      type: 'bar',
      data: dataShanghai,
      itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4
    }
  ]
})

// --- 图表初始化 ---
const initChartInstance = (refEl, observer, chart, dataB, dataS) => {
  if (!refEl.value) return
  const { clientWidth, clientHeight } = refEl.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart.value = echarts.init(refEl.value)
    chart.value.setOption(getChartOption(dataB, dataS), true)
  } else {
    observer.value = new ResizeObserver(() => {
      if (!chart.value) {
        chart.value = echarts.init(refEl.value)
        chart.value.setOption(getChartOption(dataB, dataS), true)
        observer.value?.disconnect()
      }
    })
    observer.value.observe(refEl.value)
  }
}

// --- 图例联动 ---
const toggleTunnelLegend = (name) => {
  tunnelChart.value?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  tunnelLegend.value[key] = !tunnelLegend.value[key]
}

const toggleBridgeLegend = (name) => {
  bridgeChart.value?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  bridgeLegend.value[key] = !bridgeLegend.value[key]
}

// --- 监听 Ref ---
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart.value) {
    initChartInstance(tunnelChartRef, tunnelObserver, tunnelChart, tunnelDataBeijing, tunnelDataShanghai)
  }
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart.value) {
    initChartInstance(bridgeChartRef, bridgeObserver, bridgeChart, bridgeDataBeijing, bridgeDataShanghai)
  }
})

// --- 生命周期 ---
onMounted(() => {
  initChartInstance(tunnelChartRef, tunnelObserver, tunnelChart, tunnelDataBeijing, tunnelDataShanghai)
  initChartInstance(bridgeChartRef, bridgeObserver, bridgeChart, bridgeDataBeijing, bridgeDataShanghai)
})

onUnmounted(() => {
  tunnelChart.value?.dispose()
  bridgeChart.value?.dispose()
  tunnelObserver.value?.disconnect()
  bridgeObserver.value?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-stat-cards-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 12px;
}

.c-stat-cards-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
}

.c-stat-cards-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-stat-cards-title-icon {
  width: 18px;
  height: 18px;
}

.c-stat-cards-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-stat-cards-data-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 91px;
  flex-shrink: 0;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
}

.c-stat-cards-data-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1;
}

.c-stat-cards-data-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-stat-cards-data-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  &.tunnel {
    color: #006fe3;
  }
  &.bridge {
    color: #0c9dbe;
  }
}

.c-stat-cards-center-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
}

.c-stat-cards-car-icon {
  width: 60px;
  height: 60px;
}

.c-stat-cards-chart-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.c-stat-cards-chart-header {
  display: flex;
  align-items: center;
  height: 21px;
  flex-shrink: 0;
  gap: 8px;
}

.c-stat-cards-chart-bar {
  width: 3px;
  height: 12px;
  background: #388dff;
  border-radius: 6px;
}

.c-stat-cards-chart-title {
  font-size: 14px;
  color: #333333;
}

.c-stat-cards-legend {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-stat-cards-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.2s;
  &.inactive {
    opacity: 0.4;
  }
}

.c-stat-cards-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  &.beijing {
    background: #1890ff;
  }
  &.shanghai {
    background: #69c0ff;
  }
}

.c-stat-cards-chart-container {
  flex: 1;
  width: 100%;
  min-height: 130px;
  min-width: 0;
}

:deep(.c-stat-cards-select) {
  .ant-select-selector {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    height: 24px !important;
    min-height: 24px !important;
  }
  .ant-select-selection-item {
    font-size: 14px;
    color: #333333;
    line-height: 24px !important;
    padding-right: 16px !important;
  }
  .ant-select-arrow {
    color: #333333;
    font-size: 10px;
  }
}
</style>