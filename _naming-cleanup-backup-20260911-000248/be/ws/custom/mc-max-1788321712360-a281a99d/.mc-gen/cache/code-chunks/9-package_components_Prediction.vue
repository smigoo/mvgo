<template>
  <div class="c-monitor-prediction">
    <div class="c-monitor-prediction-header" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-prediction-title">
        <img :src="icon3" class="c-monitor-prediction-icon" />
        <span class="c-monitor-prediction-title-text">流量预测</span>
      </div>
      <div class="c-monitor-prediction-controls">
        <div class="c-monitor-prediction-tabs">
          <div 
            v-for="tab in tabs" 
            :key="tab.value" 
            :class="['c-monitor-prediction-tab', { 'is-active': activeTab === tab.value }]"
            :style="activeTab === tab.value ? { backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-monitor-prediction-link">节假日预测 ></div>
      </div>
    </div>
    <div class="c-monitor-prediction-body">
      <div ref="chartRef" class="c-monitor-prediction-chart"></div>
      <div class="c-monitor-prediction-accuracy">准确率：95%</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tabs = [
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
]
const activeTab = ref('tunnel')

const chartData = {
  tunnel: {
    actual: [1200, 1300, 1500, 1800, 2200, 2500, 2800, 3000, 2900, 2600, 2200, 1800],
    predict: [1250, 1350, 1550, 1850, 2250, 2550, 2850, 3050, 2950, 2650, 2250, 1850]
  },
  bridge: {
    actual: [2000, 2200, 2500, 2800, 3200, 3500, 3800, 3900, 3700, 3400, 3000, 2600],
    predict: [2050, 2250, 2550, 2850, 3250, 3550, 3850, 3950, 3750, 3450, 3050, 2650]
  }
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = chartData[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e8e8e8',
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      textStyle: { color: '#666', fontSize: 12 }
    },
    grid: {
      left: 10,
      right: 20,
      top: 30,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2时前', '1时前', '当前', '1时后', '2时后', '3时后', '4时后', '5时后', '6时后', '7时后', '8时后', '9时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
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
        lineStyle: { width: 2, color: '#1990ff' },
        itemStyle: { color: '#1990ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(25, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#52c41a', type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  chart.setOption(option, true)
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

.c-monitor-prediction {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-prediction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
}

.c-monitor-prediction-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-prediction-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-prediction-title-text {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #333333;
}

.c-monitor-prediction-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-prediction-tabs {
  display: flex;
  gap: 4px;
}

.c-monitor-prediction-tab {
  padding: 4px 12px;
  font-size: calc(@fontSize * 0.85);
  color: #666666;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s;
  background-color: rgba(25, 144, 255, 0.05);

  &.is-active {
    color: #1990ff;
    font-weight: 500;
  }
}

.c-monitor-prediction-link {
  font-size: calc(@fontSize * 0.85);
  color: #1990ff;
  cursor: pointer;
}

.c-monitor-prediction-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
}

.c-monitor-prediction-chart {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-prediction-accuracy {
  flex-shrink: 0;
  text-align: center;
  font-size: calc(@fontSize * 0.85);
  color: #999999;
  margin-top: 4px;
}
</style>