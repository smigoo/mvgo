<script setup>
import { onMounted, onUnmounted, watch } from 'vue'

// ===== 以下变量已在第 1 部分声明，直接引用 =====
// const tunnelChartRef = ref(null)
// const bridgeChartRef = ref(null)
// const forecastChartRef = ref(null)
// const totalTunnel = ref(12345)
// const totalBridge = ref(67890)
// const vehicleTunnelBus = ref(8500)
// const vehicleTunnelTruck = ref(3845)
// const vehicleBridgeBus = ref(50000)
// const vehicleBridgeTruck = ref(17890)
// const forecastData = ref([])
// const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// ================================================

// 图表实例
let tunnelChart = null
let bridgeChart = null
let forecastChart = null

// ResizeObserver 实例
let tunnelObserver = null
let bridgeObserver = null
let forecastObserver = null

// 轮询定时器
let refreshTimer = null

// 数据刷新间隔（毫秒）
const DATA_REFRESH_INTERVAL = 60000

// ===== 图表初始化辅助函数 =====

/**
 * 通用初始化图表函数
 * @param {HTMLElement} el 图表容器 DOM
 * @param {object} option ECharts 配置
 * @returns {object} chart 实例
 */
const initChartInstance = (el, option) => {
  if (!el) return null
  const chart = echarts.init(el)
  chart.setOption(option, true)
  return chart
}

/**
 * 等待容器有尺寸后再初始化图表
 * @param {import('vue').Ref<HTMLElement|null>} ref
 * @param {function} createOption 构建 option 的函数
 * @param {string} chartKey 图表标识（tunnel/bridge/forecast）
 * @returns {void}
 */
const initChartWithResizeObserver = (chartRef, createOption, chartKey) => {
  if (!chartRef.value) return

  const existingChart = chartKey === 'tunnel' ? tunnelChart : chartKey === 'bridge' ? bridgeChart : forecastChart
  if (existingChart) return

  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = initChartInstance(chartRef.value, createOption())
    if (chartKey === 'tunnel') tunnelChart = chart
    else if (chartKey === 'bridge') bridgeChart = chart
    else if (chartKey === 'forecast') forecastChart = chart
    return
  }

  // 尺寸为 0，使用 ResizeObserver 等待
  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      observer.disconnect()
      const chart = initChartInstance(chartRef.value, createOption())
      if (chartKey === 'tunnel') tunnelChart = chart
      else if (chartKey === 'bridge') bridgeChart = chart
      else if (chartKey === 'forecast') forecastChart = chart
    }
  })
  observer.observe(chartRef.value)

  if (chartKey === 'tunnel') tunnelObserver = observer
  else if (chartKey === 'bridge') bridgeObserver = observer
  else if (chartKey === 'forecast') forecastObserver = observer
}

/**
 * 构建隧道流量图 option
 */
const buildTunnelOption = () => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['江阴靖江长江隧道'] },
  grid: { left: 40, right: 16, top: 40, bottom: 28, containLabel: true },
  xAxis: {
    type: 'category',
    data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    boundaryGap: false
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: '江阴靖江长江隧道',
      type: 'line',
      smooth: true,
      data: [320, 280, 450, 620, 580, 490, 360]
    }
  ]
})

/**
 * 构建江阴大桥流量图 option
 */
const buildBridgeOption = () => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['江阴大桥'] },
  grid: { left: 40, right: 16, top: 40, bottom: 28, containLabel: true },
  xAxis: {
    type: 'category',
    data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    boundaryGap: false
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: '江阴大桥',
      type: 'line',
      smooth: true,
      data: [1200, 980, 1600, 2300, 2100, 1750, 1400]
    }
  ]
})

/**
 * 构建流量预测图 option
 */
const buildForecastOption = () => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['实际流量', '预测流量'] },
  grid: { left: 40, right: 16, top: 40, bottom: 28, containLabel: true },
  xAxis: {
    type: 'category',
    data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    boundaryGap: false
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: '实际流量',
      type: 'line',
      smooth: true,
      data: [1200, 980, 1600, 2300, 2100, 1750, 1400]
    },
    {
      name: '预测流量',
      type: 'line',
      smooth: true,
      data: [1150, 1000, 1700, 2400, 2200, 1800, 1450]
    }
  ]
})

/**
 * 初始化所有图表
 */
const initAllCharts = () => {
  initChartWithResizeObserver(tunnelChartRef, buildTunnelOption, 'tunnel')
  initChartWithResizeObserver(bridgeChartRef, buildBridgeOption, 'bridge')
  initChartWithResizeObserver(forecastChartRef, buildForecastOption, 'forecast')
}

/**
 * 更新所有图表
 * 根据最新数据更新图表 option，这里使用模拟数据，实际项目中从 componentApi 获取
 */
const updateAllCharts = () => {
  if (tunnelChart) tunnelChart.setOption(buildTunnelOption(), true)
  if (bridgeChart) bridgeChart.setOption(buildBridgeOption(), true)
  if (forecastChart) forecastChart.setOption(buildForecastOption(), true)
}

/**
 * 加载数据
 * 实际项目中调用 componentApi.getCommonApiFindList 等方法获取数据
 */
const loadData = async () => {
  // 模拟数据更新，实际项目中替换为真实 API 调用
  // 例如：
  // if (componentApi) {
  //   const res = await componentApi.getCommonApiFindList({}, 'dataSourceName')
  //   // 更新 ref 数据...
  // }
  updateAllCharts()
}

/**
 * 窗口 resize 处理
 */
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
  if (forecastChart) forecastChart.resize()
}

/**
 * 清理所有图表
 */
const disposeAllCharts = () => {
  if (tunnelChart) {
    tunnelChart.dispose()
    tunnelChart = null
  }
  if (bridgeChart) {
    bridgeChart.dispose()
    bridgeChart = null
  }
  if (forecastChart) {
    forecastChart.dispose()
    forecastChart = null
  }
  if (tunnelObserver) {
    tunnelObserver.disconnect()
    tunnelObserver = null
  }
  if (bridgeObserver) {
    bridgeObserver.disconnect()
    bridgeObserver = null
  }
  if (forecastObserver) {
    forecastObserver.disconnect()
    forecastObserver = null
  }
}

// ===== 生命周期 =====

onMounted(() => {
  // 初始化所有图表
  initAllCharts()

  // 加载数据
  loadData()

  // 设置轮询
  refreshTimer = setInterval(loadData, DATA_REFRESH_INTERVAL)

  // 监听窗口 resize
  window.addEventListener('resize', handleResize)

  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理轮询定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }

  // 移除窗口 resize 监听
  window.removeEventListener('resize', handleResize)

  // 销毁图表并清理 observers
  disposeAllCharts()
})

// 监听图表 ref 变化（处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景）
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initChartWithResizeObserver(tunnelChartRef, buildTunnelOption, 'tunnel')
})
watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initChartWithResizeObserver(bridgeChartRef, buildBridgeOption, 'bridge')
})
watch(forecastChartRef, (newRef) => {
  if (newRef && !forecastChart) initChartWithResizeObserver(forecastChartRef, buildForecastOption, 'forecast')
})
</script>