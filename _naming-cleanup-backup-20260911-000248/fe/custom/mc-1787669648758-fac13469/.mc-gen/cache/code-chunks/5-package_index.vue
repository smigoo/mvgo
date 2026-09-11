<script setup>
import * as echarts from 'echarts'

// 图表实例管理（假设 chartRef 已在第 1 部分声明）
let chartInstance = null
let chartObserver = null

const initCharts = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chartInstance = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chartInstance) {
      chartObserver?.disconnect()
      chartInstance = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chartInstance) initCharts()
})

const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [] }]
  }, true)
}

const handleResize = () => {
  if (chartInstance && !chartInstance.isDisposed()) {
    chartInstance.resize()
  }
}

const disposeCharts = () => {
  chartInstance?.dispose()
  chartObserver?.disconnect()
  chartInstance = null
}

// 数据加载与轮询
const loadData = async () => {
  try {
    // 实际项目中应使用 componentApi 获取数据
    // await componentApi.getCommonApiFindList({}, 'dataSourceName')
  } catch (error) {
    console.error('数据加载失败:', error)
  }
}

let refreshTimer = null
const startPolling = () => {
  loadData()
  refreshTimer = setInterval(loadData, 60000)
}

const stopPolling = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
</script>