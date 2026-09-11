<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[env-monitor] $mcComponentBuilder 失败:', e)
}

const tabs = ref([
  { key: 'co2', label: '二氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])

const activeTab = ref('co2')

const trendChartRef = ref(null)
let chart = null
let chartObserver = null

const chartDataMap = {
  co2: [12, 13, 12.5, 14, 13.5, 12.8, 12.5],
  visibility: [800, 820, 850, 830, 860, 840, 850],
  lighting: [150, 160, 155, 170, 165, 158, 150],
  outdoor: [2000, 2200, 2500, 2800, 3000, 2700, 2400]
}
const xData = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value] || []
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    grid: {
      left: 10,
      right: 20,
      top: 20,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 }
    },
    series: [{
      type: 'line',
      data: data,
      smooth: true,
      lineStyle: { color: '#1890ff', width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24, 144, 255, 0.4)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
          ]
        }
      },
      itemStyle: { color: '#1890ff' }
    }]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!trendChartRef.value) return
  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(trendChartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(trendChartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(trendChartRef.value)
}

watch(trendChartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'env-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>