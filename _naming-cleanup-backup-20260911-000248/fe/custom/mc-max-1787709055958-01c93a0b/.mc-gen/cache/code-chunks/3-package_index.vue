<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 状态与数据 ===
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor_light', label: '洞内照明' },
  { key: 'outdoor_light', label: '洞外光强' }
]
const activeTab = ref('co')
const badgeCount = ref(6)
const legendVisible = ref(true)

// 模拟不同 Tab 下的数据
const mockData = {
  co: [10, 15, 12, 25, 35, 28, 20, 18, 22, 30, 25, 15],
  visibility: [20, 22, 25, 30, 28, 26, 24, 22, 20, 18, 15, 12],
  indoor_light: [5, 8, 10, 12, 15, 18, 20, 22, 20, 18, 15, 10],
  outdoor_light: [10, 15, 25, 35, 40, 38, 30, 20, 15, 10, 5, 2]
}
// === 图表相关 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = mockData[activeTab.value] || mockData.co
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: { show: false }, // 使用自定义 DOM 图例
    grid: { left: 40, right: 20, top: 30, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#0fcd7d', width: 2 },
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
          lineStyle: { color: '#F53F3F', type: 'dashed', width: 1 },
          label: {
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 30 }]
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
// === 交互事件 ===
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleChartView = () => {
  // 切换视图模式
}

const handleListView = () => {
  // 查看列表详情
}

const toggleLegend = (name) => {
  legendVisible.value = !legendVisible.value
  if (chart) {
    chart.dispatchAction({
      type: 'legendToggleSelect',
      name: name
    })
  }
}
// === 监听与生命周期 ===
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