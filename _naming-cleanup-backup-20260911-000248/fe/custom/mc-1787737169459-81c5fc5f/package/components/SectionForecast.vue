<template>
  <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast">
    <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-header">
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-title">
        <img :src="icon7" class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-icon" alt="icon" />
        <span>流量预测</span>
      </div>
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-tabs">
        <div 
          :class="['c-monitor-forecast-tab', { active: activeTab === 'tunnel' }]"
          @click="activeTab = 'tunnel'"
        >江阴靖江长江隧道</div>
        <div 
          :class="['c-monitor-forecast-tab', { active: activeTab === 'bridge' }]"
          @click="activeTab = 'bridge'"
        >江阴大桥</div>
      </div>
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-link" @click="handleHolidayClick">节假日预测</div>
    </div>
    
    <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-chart-wrapper">
      <div ref="chartRef" class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-chart"></div>
      
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-legend">
        <div 
          class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-legend-item" 
          :class="{ inactive: !legendState.actual }" 
          @click="toggleLegend('actual', '实际流量')"
        >
          <span class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-legend-line actual"></span>
          <span>实际流量</span>
        </div>
        <div 
          class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-legend-item" 
          :class="{ inactive: !legendState.forecast }" 
          @click="toggleLegend('forecast', '预测流量')"
        >
          <span class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-legend-line forecast"></span>
          <span>预测流量</span>
        </div>
      </div>
      
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-forecast-accuracy">
        <span>准确率98%</span>
        <span>准确率96%</span>
        <span>准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon7 from '../../resources/images/icon-3573.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const activeTab = ref('tunnel')
const legendState = ref({ actual: true, forecast: true })

const mockData = {
  tunnel: {
    actual: [1200, 1800, 2400, 2100, 1900],
    forecast: [1300, 1900, 2500, 2200, 2000]
  },
  bridge: {
    actual: [2500, 3200, 3800, 3500, 3100],
    forecast: [2600, 3300, 3900, 3600, 3200]
  }
}

const handleHolidayClick = () => {
  console.log('节假日预测点击')
}

const toggleLegend = (key, name) => {
  legendState.value[key] = !legendState.value[key]
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value]
  
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#5bbbef', width: 1 } }
    },
    legend: { show: false },
    grid: { left: 40, right: 20, top: 30, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#3385ff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51,133,255,0.3)' },
              { offset: 1, color: 'rgba(51,133,255,0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        lineStyle: { width: 2, color: '#00cccc' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,204,204,0.3)' },
              { offset: 1, color: 'rgba(0,204,204,0.05)' }
            ]
          }
        }
      }
    ]
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-forecast {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-forecast-header {
  display: flex;
  align-items: center;
  height: 24px;
  flex-shrink: 0;
}

.c-monitor-forecast-title {
  display: flex;
  align-items: center;
  gap: 8px;
  
  span {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  }
}

.c-monitor-forecast-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-forecast-tabs {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

.c-monitor-forecast-tab {
  padding: 0 12px;
  height: 19px;
  border-radius: 20.46px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  color: #ffffff;
  font-weight: 400;
  transition: all 0.3s;

  &.active {
    background: #1990ff;
    border: 0.73px solid rgba(199, 224, 255, 1);
    font-weight: 500;
  }
}

.c-monitor-forecast-link {
  font-size: 12px;
  font-weight: 400;
  color: #1990ff;
  cursor: pointer;
  margin-left: auto;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  margin-top: 8px;
  overflow: hidden;
}

.c-monitor-forecast-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-forecast-legend {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 10px;
  z-index: 10;
}

.c-monitor-forecast-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.3s;

  &.inactive {
    opacity: 0.3;
  }
}

.c-monitor-forecast-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffffff;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  }

  &.actual {
    background: #3385ff;
    &::after {
      border: 1px solid #3385ff;
    }
  }

  &.forecast {
    background: #00cccc;
    &::after {
      border: 1px solid #00cccc;
    }
  }
}

.c-monitor-forecast-accuracy {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 21px;
  font-size: 12px;
  font-weight: 500;
  color: #52c41a;
  z-index: 10;
}
</style>