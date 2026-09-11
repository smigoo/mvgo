<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1787560119416-c72885db-c-monitor-root"
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- 1. 当日总流量 -->
      <div class="c-mc-max-1787560119416-c72885db-c-monitor-section">
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-header">
          <span class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-title">当日总流量</span>
        </div>
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-body">
          <!-- 总流量数值卡片(两列并排) -->
          <div class="c-mc-max-1787560119416-c72885db-c-monitor-total-cards">
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-total-card">
              <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-label">江阴靖江长江隧道</span>
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-total-data">
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-value">12,345</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-unit">辆次</span>
              </div>
            </div>
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-total-card">
              <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-label">江阴大桥</span>
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-total-data">
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-value">67,890</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-total-unit">辆次</span>
              </div>
            </div>
          </div>

          <!-- 江阴靖江长江隧道流量图 -->
          <div class="c-mc-max-1787560119416-c72885db-c-monitor-chart-block">
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-chart-title">江阴靖江长江隧道流量图</div>
            <div ref="tunnelChartRef" class="c-mc-max-1787560119416-c72885db-c-monitor-chart-container"></div>
          </div>

          <!-- 江阴大桥流量图 -->
          <div class="c-mc-max-1787560119416-c72885db-c-monitor-chart-block">
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-chart-title">江阴大桥流量图</div>
            <div ref="bridgeChartRef" class="c-mc-max-1787560119416-c72885db-c-monitor-chart-container"></div>
          </div>
        </div>
      </div>

      <!-- 2. 车型分布 -->
      <div class="c-mc-max-1787560119416-c72885db-c-monitor-section">
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-header">
          <span class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-title">车型分布</span>
        </div>
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-body">
          <!-- 江阴靖江长江隧道车型 -->
          <div class="c-mc-max-1787560119416-c72885db-c-monitor-vehicle-group">
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-vehicle-title">江阴靖江长江隧道</div>
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-items">
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-item">
                <img :src="icon1" class="c-mc-max-1787560119416-c72885db-c-monitor-stat-icon" />
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-label">客车</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-value">8,500</span>
              </div>
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-item">
                <img :src="icon2" class="c-mc-max-1787560119416-c72885db-c-monitor-stat-icon" />
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-label">货车</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-value">3,845</span>
              </div>
            </div>
          </div>

          <!-- 江阴大桥车型 -->
          <div class="c-mc-max-1787560119416-c72885db-c-monitor-vehicle-group">
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-vehicle-title">江阴大桥</div>
            <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-items">
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-item">
                <img :src="icon3" class="c-mc-max-1787560119416-c72885db-c-monitor-stat-icon" />
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-label">客车</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-value">50,000</span>
              </div>
              <div class="c-mc-max-1787560119416-c72885db-c-monitor-stat-item">
                <img :src="icon4" class="c-mc-max-1787560119416-c72885db-c-monitor-stat-icon" />
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-label">货车</span>
                <span class="c-mc-max-1787560119416-c72885db-c-monitor-stat-value">17,890</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. 流量预测 -->
      <div class="c-mc-max-1787560119416-c72885db-c-monitor-section">
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-header">
          <span class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-title">流量预测</span>
        </div>
        <div class="c-mc-max-1787560119416-c72885db-c-mc-max-1787560119416-c72885db-c-monitor-section-body">
          <div ref="forecastChartRef" class="c-mc-max-1787560119416-c72885db-c-monitor-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/Vector-3549.png'
import icon3 from '../resources/images/icon-3561.png'
import icon4 from '../resources/images/icon-3441.png'


import * as echarts from 'echarts'

// === $mcComponentBuilder 初始化 ===

const { componentProps, businessProps, runtimeBuilder, componentApi, componentId } = $mcComponentBuilder()

// === 图表 DOM 引用 ===

const tunnelChartRef = ref(null)

const bridgeChartRef = ref(null)

const forecastChartRef = ref(null)

// === 图表实例与 Observer 引用 ===

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

import {onMounted, onUnmounted} from 'vue'

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

// 等待容器有尺寸后再初始化图表

// @param {import('vue').Ref<HTMLElement|null>} ref

// @param {function} createOption 构建 option 的函数

// @param {string} chartKey 图表标识（tunnel/bridge/forecast）

// @returns {void}

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

// 构建隧道流量图 option

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

// 构建江阴大桥流量图 option

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

// 构建流量预测图 option

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

// 初始化所有图表

const initAllCharts = () => {
  initChartWithResizeObserver(tunnelChartRef, buildTunnelOption, 'tunnel')
  initChartWithResizeObserver(bridgeChartRef, buildBridgeOption, 'bridge')
  initChartWithResizeObserver(forecastChartRef, buildForecastOption, 'forecast')
}

// 更新所有图表

// 根据最新数据更新图表 option，这里使用模拟数据，实际项目中从 componentApi 获取

const updateAllCharts = () => {
  if (tunnelChart) tunnelChart.setOption(buildTunnelOption(), true)
  if (bridgeChart) bridgeChart.setOption(buildBridgeOption(), true)
  if (forecastChart) forecastChart.setOption(buildForecastOption(), true)
}

// 加载数据

// 实际项目中调用 componentApi.getCommonApiFindList 等方法获取数据

const loadData = async () => {
  // 模拟数据更新，实际项目中替换为真实 API 调用
  // 例如：
  // if (componentApi) {
  //   const res = await componentApi.getCommonApiFindList({}, 'dataSourceName')
  //   // 更新 ref 数据...
  // }
  updateAllCharts()
}

// 窗口 resize 处理

const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
  if (forecastChart) forecastChart.resize()
}

// 清理所有图表

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

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>