<script setup>
import { ref, reactive, watch } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化 ===
const { componentProps, businessProps, runtimeBuilder, componentApi, componentId } = $mcComponentBuilder()
// === 图表 DOM 引用 ===
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const forecastChartRef = ref(null)
// === 图表实例与 Observer 引用 ===
let tunnelChart = null
let bridgeChart = null
let forecastChart = null

let tunnelObserver = null
let bridgeObserver = null
let forecastObserver = null
// === 业务数据状态 ===
const totalFlowData = reactive({
  tunnel: 12345,
  bridge: 67890
})

const vehicleDistribution = reactive({
  tunnel: {
    passenger: 8500,
    truck: 3845
  },
  bridge: {
    passenger: 50000,
    truck: 17890
  }
})

const forecastData = ref({
  xAxis: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'],
  tunnel: [1200, 1800, 2500, 2200, 2800, 3000],
  bridge: [4000, 5500, 7000, 6500, 8000, 8500]
})
// === 图表初始化与更新函数定义 ===
const updateTunnelChart = () => {
  if (!tunnelChart) return
  tunnelChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: forecastData.value.xAxis, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [{ 
      name: '江阴靖江长江隧道', 
      type: 'line', 
      data: forecastData.value.tunnel, 
      smooth: true, 
      itemStyle: { color: '#1890ff' },
      areaStyle: { color: 'rgba(24, 144, 255, 0.1)' }
    }]
  }, true)
}

const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
    return
  }
  tunnelObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  })
  tunnelObserver.observe(tunnelChartRef.value)
}

const updateBridgeChart = () => {
  if (!bridgeChart) return
  bridgeChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: forecastData.value.xAxis, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [{ 
      name: '江阴大桥', 
      type: 'line', 
      data: forecastData.value.bridge, 
      smooth: true, 
      itemStyle: { color: '#52c41a' },
      areaStyle: { color: 'rgba(82, 196, 26, 0.1)' }
    }]
  }, true)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateBridgeChart()
    return
  }
  bridgeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
    }
  })
  bridgeObserver.observe(bridgeChartRef.value)
}

const updateForecastChart = () => {
  if (!forecastChart) return
  forecastChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: forecastData.value.xAxis },
    yAxis: { type: 'value' },
    series: [
      { name: '江阴靖江长江隧道', type: 'bar', data: forecastData.value.tunnel, itemStyle: { color: '#1890ff' } },
      { name: '江阴大桥', type: 'bar', data: forecastData.value.bridge, itemStyle: { color: '#52c41a' } }
    ]
  }, true)
}

const initForecastChart = () => {
  if (!forecastChartRef.value) return
  const { clientWidth, clientHeight } = forecastChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    forecastChart = echarts.init(forecastChartRef.value)
    updateForecastChart()
    return
  }
  forecastObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !forecastChart) {
      forecastObserver?.disconnect()
      forecastChart = echarts.init(forecastChartRef.value)
      updateForecastChart()
    }
  })
  forecastObserver.observe(forecastChartRef.value)
}

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
  forecastChart?.resize()
}

const disposeCharts = () => {
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  forecastChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
  forecastObserver?.disconnect()
}
// === Watch 监听 ===
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

watch(forecastChartRef, (newRef) => {
  if (newRef && !forecastChart) initForecastChart()
})

watch(forecastData, () => {
  updateTunnelChart()
  updateBridgeChart()
  updateForecastChart()
}, { deep: true })
</script>