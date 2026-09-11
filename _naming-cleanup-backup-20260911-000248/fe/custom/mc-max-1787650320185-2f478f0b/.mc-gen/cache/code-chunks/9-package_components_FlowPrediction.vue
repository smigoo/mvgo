<template>
  <div class="c-monitor-flow-prediction">
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title">
        <img :src="icon7" class="c-monitor-flow-prediction-icon" alt="icon" />
        <span>流量预测</span>
      </div>
      <div class="c-monitor-flow-prediction-tabs">
        <div 
          v-for="tab in tabs" 
          :key="tab.value" 
          :class="['c-monitor-flow-prediction-tab', { 'is-active': activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-flow-prediction-link">节假日预测</div>
    </div>
    
    <div class="c-monitor-flow-prediction-chart-wrapper">
      <div class="c-monitor-flow-prediction-legend">
        <div 
          class="c-monitor-flow-prediction-legend-item" 
          :class="{ 'is-inactive': !legendState.actual }" 
          @click="toggleLegend('实际流量')"
        >
          <span class="c-monitor-flow-prediction-legend-line actual"></span>
          <span>实际流量</span>
        </div>
        <div 
          class="c-monitor-flow-prediction-legend-item" 
          :class="{ 'is-inactive': !legendState.predict }" 
          @click="toggleLegend('预测流量')"
        >
          <span class="c-monitor-flow-prediction-legend-line predict"></span>
          <span>预测流量</span>
        </div>
      </div>
      
      <div ref="chartRef" class="c-monitor-flow-prediction-chart"></div>
      
      <div class="c-monitor-flow-prediction-accuracy">
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

const activeTab = ref('tunnel')
const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]

const legendState = ref({ actual: true, predict: true })

const dataMap = {
  tunnel: {
    actual: [1200, 1800, 2500, 2200, 1900],
    predict: [1300, 1900, 2600, 2300, 2000]
  },
  bridge: {
    actual: [2500, 3200, 3800, 3500, 3000],
    predict: [2600, 3300, 3900, 3600, 3100]
  }
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const getChartOption = (data) => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      show: false
    },
    grid: {
      left: 10, right: 20, top: 20, bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)', type: 'dashed' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#3385ff' },
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51,133,255,0.3)' },
              { offset: 1, color: 'rgba(51,133,255,0.02)' }
            ]
          }
        },
        data: data.actual
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#00cccc' },
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,204,204,0.2)' },
              { offset: 1, color: 'rgba(0,204,204,0.02)' }
            ]
          }
        },
        data: data.predict
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value]
  chart.setOption(getChartOption(data), true)
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

const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'predict'
  legendState.value[key] = !legendState.value[key]
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

.c-monitor-flow-prediction {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 174 1 0;
  min-height: 0;
}

.c-monitor-flow-prediction-header {
  display: flex;
  align-items: center;
  height: 24px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-flow-prediction-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  gap: 8px;
  margin-left: auto;
  margin-right: 16px;
}

.c-monitor-flow-prediction-tab {
  padding: 0 12px;
  height: 19px;
  line-height: 19px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  color: #ffffff;
  font-weight: 400;
  transition: all 0.2s;
  
  &.is-active {
    background: #1990ff;
    border: 0.73px solid rgba(199, 224, 255, 1);
    font-weight: 500;
  }
}

.c-monitor-flow-prediction-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
}

.c-monitor-flow-prediction-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}

.c-monitor-flow-prediction-legend {
  display: flex;
  gap: 16px;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.c-monitor-flow-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.2s;
  
  &.is-inactive {
    opacity: 0.4;
  }
}

.c-monitor-flow-prediction-legend-line {
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
    background: #fff;
    border: 1px solid currentColor;
  }
  
  &.actual {
    background: #3385ff;
    color: #3385ff;
  }
  &.predict {
    background: #00cccc;
    color: #00cccc;
  }
}

.c-monitor-flow-prediction-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-flow-prediction-accuracy {
  display: flex;
  gap: 21px;
  justify-content: center;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #52c41a;
}
</style>