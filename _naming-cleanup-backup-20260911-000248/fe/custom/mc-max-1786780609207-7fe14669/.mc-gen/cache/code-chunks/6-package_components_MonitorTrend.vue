<template>
  <div class="c-monitor-trend-root">
    <div class="c-monitor-trend-tabs">
      <span 
        v-for="tab in trendTabs" 
        :key="tab.value" 
        :class="['c-monitor-trend-tab', { 'is-active': activeTrendTab === tab.value }]"
        @click="activeTrendTab = tab.value"
      >
        {{ tab.label }}
      </span>
    </div>
    <div class="c-monitor-trend-chart-wrapper">
      <div ref="chartRef" class="c-monitor-trend-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  timeTab: { type: String, default: '24h' }
})

const trendTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' },
  { label: '流量预测', value: 'prediction' }
])

const activeTrendTab = ref('tunnel')
const chartRef = ref(null)
let chart = null
let chartObserver = null

const generateBarData = () => {
  const hours = Array.from({ length: 25 }, (_, i) => `${i}`)
  const beijing = hours.map(() => Math.floor(Math.random() * 3000 + 500))
  const shanghai = hours.map(() => Math.floor(Math.random() * 3000 + 500))
  return { hours, beijing, shanghai }
}

const tunnelData = generateBarData()
const bridgeData = generateBarData()

const predictionHours = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']
const actualFlow = [1200, 1800, 2500, 2200, 1900]
const predictedFlow = [1100, 1700, 2600, 2300, 2000]

const getChartOption = () => {
  if (activeTrendTab.value === 'prediction') {
    return {
      tooltip: { 
        trigger: 'axis', 
        backgroundColor: 'rgba(0,0,0,0.7)', 
        borderColor: 'rgba(255,255,255,0.2)', 
        textStyle: { color: '#fff', fontSize: 12 } 
      },
      legend: { 
        data: ['实际流量', '预测流量'], 
        top: 0, 
        right: 0, 
        textStyle: { color: '#333', fontSize: 12 } 
      },
      grid: { left: 40, right: 20, top: 30, bottom: 30, containLabel: true },
      xAxis: { 
        type: 'category', 
        data: predictionHours, 
        axisLine: { lineStyle: { color: '#ccc' } }, 
        axisLabel: { color: '#666', fontSize: 12 } 
      },
      yAxis: { 
        type: 'value', 
        max: 4000, 
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }, 
        axisLabel: { color: '#666', fontSize: 12 } 
      },
      series: [
        {
          name: '实际流量', type: 'line', data: actualFlow, smooth: true,
          lineStyle: { color: '#3385ff', width: 2 },
          itemStyle: { color: '#3385ff' },
          areaStyle: { 
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(51,133,255,0.3)' }, 
              { offset: 1, color: 'rgba(51,133,255,0.05)' }
            ]) 
          }
        },
        {
          name: '预测流量', type: 'line', data: predictedFlow, smooth: true,
          lineStyle: { color: '#00cccc', width: 2 },
          itemStyle: { color: '#00cccc' },
          areaStyle: { 
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,204,204,0.3)' }, 
              { offset: 1, color: 'rgba(0,204,204,0.05)' }
            ]) 
          }
        }
      ]
    }
  } else {
    const data = activeTrendTab.value === 'tunnel' ? tunnelData : bridgeData
    return {
      tooltip: { 
        trigger: 'axis', 
        backgroundColor: 'rgba(0,0,0,0.7)', 
        borderColor: 'rgba(255,255,255,0.2)', 
        textStyle: { color: '#fff', fontSize: 12 } 
      },
      legend: { 
        data: ['北京方向', '上海方向'], 
        top: 0, 
        right: 0, 
        textStyle: { color: '#333', fontSize: 12 } 
      },
      grid: { left: 40, right: 20, top: 30, bottom: 30, containLabel: true },
      xAxis: { 
        type: 'category', 
        data: data.hours, 
        axisLine: { lineStyle: { color: '#ccc' } }, 
        axisLabel: { color: '#666', fontSize: 12 } 
      },
      yAxis: { 
        type: 'value', 
        max: 4000, 
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }, 
        axisLabel: { color: '#666', fontSize: 12 } 
      },
      series: [
        {
          name: '北京方向', type: 'bar', data: data.beijing, barWidth: 8, 
          itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
          markLine: { 
            silent: true, symbol: 'none', 
            lineStyle: { color: '#fa8c16', type: 'dashed' }, 
            data: [{ yAxis: 2500, label: { formatter: '建议分流', color: '#fa8c16', fontSize: 12 } }] 
          }
        },
        {
          name: '上海方向', type: 'bar', data: data.shanghai, barWidth: 8, 
          itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] }
        }
      ]
    }
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
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

watch(activeTrendTab, () => {
  updateChart()
})

watch(() => props.timeTab, () => {
  const newData = generateBarData()
  if (activeTrendTab.value === 'tunnel') Object.assign(tunnelData, newData)
  else if (activeTrendTab.value === 'bridge') Object.assign(bridgeData, newData)
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