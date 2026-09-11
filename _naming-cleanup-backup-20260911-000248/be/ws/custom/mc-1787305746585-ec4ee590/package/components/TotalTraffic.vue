<template>
  <div class="c-monitor-total-traffic">
    <!-- 子标题与时间选择 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <a-select 
        v-model:value="timeRange" 
        class="c-monitor-time-select" 
        :bordered="false" 
        :dropdown-match-select-width="false"
        size="small"
      >
        <a-select-option value="24h">24小时</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片 -->
    <div class="c-monitor-stat-cards" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value c-monitor-stat-value-tunnel">34,620</div>
      </div>
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value c-monitor-stat-value-bridge">82,379</div>
      </div>
    </div>

    <!-- 图表1：江阴靖江长江隧道 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <div class="c-monitor-chart-title">
          <span class="c-monitor-chart-title-bar"></span>
          <span>江阴靖江长江隧道</span>
        </div>
        <div class="c-monitor-chart-legend">
          <span 
            :class="['c-monitor-legend-item', { active: legendState1.beijing }]" 
            @click="toggleLegend1('北京方向')"
          >
            <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>北京方向
          </span>
          <span 
            :class="['c-monitor-legend-item', { active: legendState1.shanghai }]" 
            @click="toggleLegend1('上海方向')"
          >
            <i class="c-monitor-legend-dot" style="background: #69c0ff;"></i>上海方向
          </span>
        </div>
      </div>
      <div ref="chartRef1" class="c-monitor-chart-container"></div>
    </div>

    <!-- 图表2：江阴大桥 -->
    <div class="c-monitor-chart-block">
      <div class="c-monitor-chart-header">
        <div class="c-monitor-chart-title">
          <span class="c-monitor-chart-title-bar"></span>
          <span>江阴大桥</span>
        </div>
        <div class="c-monitor-chart-legend">
          <span 
            :class="['c-monitor-legend-item', { active: legendState2.beijing }]" 
            @click="toggleLegend2('北京方向')"
          >
            <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>北京方向
          </span>
          <span 
            :class="['c-monitor-legend-item', { active: legendState2.shanghai }]" 
            @click="toggleLegend2('上海方向')"
          >
            <i class="c-monitor-legend-dot" style="background: #69c0ff;"></i>上海方向
          </span>
        </div>
      </div>
      <div ref="chartRef2" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'
// === 状态与数据 ===
const timeRange = ref('24h')

const legendState1 = ref({ beijing: true, shanghai: true })
const legendState2 = ref({ beijing: true, shanghai: true })

const chartRef1 = ref(null)
const chartRef2 = ref(null)
let chart1 = null
let chart2 = null
let observer1 = null
let observer2 = null

// Mock 数据
const mockData = {
  tunnel: {
    beijing: [120, 210, 150, 320, 540, 850, 1250, 1580, 1820, 1240, 860, 420],
    shanghai: [150, 260, 210, 410, 620, 930, 1350, 1640, 1950, 1320, 940, 510]
  },
  bridge: {
    beijing: [220, 310, 250, 420, 640, 1050, 1550, 1880, 2120, 1540, 1160, 620],
    shanghai: [250, 360, 310, 510, 720, 1130, 1650, 1940, 2250, 1620, 1240, 710]
  }
}
// === 图表配置生成 ===
const getChartOption = (data1, data2) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 },
    extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px;',
    formatter: (params) => {
      let res = `${params[0].axisValue}时<br/>`
      params.forEach(p => {
        res += `${p.marker}${p.seriesName}: ${p.value} 辆<br/>`
      })
      return res
    }
  },
  legend: { show: false },
  grid: { left: 35, right: 15, top: 20, bottom: 25, containLabel: false },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    axisLine: { lineStyle: { color: '#e8e8e8' } },
    axisLabel: { color: '#666666', fontSize: 12 },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    max: 4000,
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#999999', fontSize: 12 }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: data1,
      itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4,
      barGap: '30%',
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#fa8c16', type: 'dashed', width: 1 },
        data: [{ 
          yAxis: 3000, 
          label: { 
            show: true, 
            position: 'insideEndTop', 
            formatter: '建议分流', 
            color: '#fa8c16', 
            fontSize: 12 
          } 
        }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      data: data2,
      itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
      barWidth: 4
    }
  ]
})
// === 图例联动 ===
const toggleLegend1 = (name) => {
  chart1?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState1.value[key] = !legendState1.value[key]
}

const toggleLegend2 = (name) => {
  chart2?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState2.value[key] = !legendState2.value[key]
}
// === 图表初始化与更新 ===
const updateChart1 = () => {
  if (!chart1) return
  chart1.setOption(getChartOption(mockData.tunnel.beijing, mockData.tunnel.shanghai), true)
}

const updateChart2 = () => {
  if (!chart2) return
  chart2.setOption(getChartOption(mockData.bridge.beijing, mockData.bridge.shanghai), true)
}

const initChart1 = () => {
  if (!chartRef1.value) return
  const { clientWidth, clientHeight } = chartRef1.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart1 = echarts.init(chartRef1.value)
    updateChart1()
    return
  }
  observer1 = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart1) {
      observer1?.disconnect()
      chart1 = echarts.init(chartRef1.value)
      updateChart1()
    }
  })
  observer1.observe(chartRef1.value)
}

const initChart2 = () => {
  if (!chartRef2.value) return
  const { clientWidth, clientHeight } = chartRef2.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart2 = echarts.init(chartRef2.value)
    updateChart2()
    return
  }
  observer2 = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart2) {
      observer2?.disconnect()
      chart2 = echarts.init(chartRef2.value)
      updateChart2()
    }
  })
  observer2.observe(chartRef2.value)
}

watch(chartRef1, (newRef) => { if (newRef && !chart1) initChart1() })
watch(chartRef2, (newRef) => { if (newRef && !chart2) initChart2() })

const handleResize = () => {
  chart1?.resize()
  chart2?.resize()
}

onMounted(() => {
  initChart1()
  initChart2()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart1?.dispose()
  chart2?.dispose()
  observer1?.disconnect()
  observer2?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {  width: 100%;

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
}

.c-monitor-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-time-select {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  height: 30px !important;
}

:deep(.ant-select-selection-item) {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 30px !important;
}

:deep(.ant-select-arrow) {
  color: #333333;
}

.c-monitor-stat-cards {
  flex-shrink: 0;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background-position: center center;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
}

.c-monitor-stat-value-tunnel {
  color: #006fe3;
}

.c-monitor-stat-value-bridge {
  color: #0c9dbe;
}

.c-monitor-chart-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-header {
  flex-shrink: 0;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.c-monitor-chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #333333;
}

.c-monitor-chart-title-bar {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: #388dff;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  transition: opacity 0.2s;

  &.active {
    color: #333333;
  }

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>