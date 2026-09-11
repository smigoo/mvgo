<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])
const activeTab = ref('co')

const chartDataMap = {
  co: [5, 12, 18, 25, 32, 28, 22, 15, 10, 8, 12, 18],
  visibility: [10, 15, 20, 25, 30, 35, 30, 25, 20, 15, 10, 5],
  lighting: [20, 22, 25, 28, 30, 32, 30, 28, 25, 22, 20, 18],
  outdoor: [5, 10, 20, 35, 40, 38, 30, 20, 10, 5, 2, 1]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value] || chartDataMap.co
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: { color: '#333333', fontSize: 10 }
    },
    grid: {
      left: 30,
      right: 16,
      top: 30,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisLabel: { color: '#666666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#e0e0e0', type: 'dashed' } },
      axisLabel: { color: '#333333', fontSize: 10 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#0fcd7d', width: 2 },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
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

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>