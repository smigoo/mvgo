<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-root">
      <!-- ① 当日总流量：两个地点总流量统计 + 24小时时间筛选 -->
      <TotalTrafficSection
        :bg-image="bg1"
        :diamond-icon="icon5"
        :select-arrow="icon4"
      />

      <!-- ② 江阴靖江长江隧道流量柱状图 -->
      <TrafficBarSection
        section-key="tunnel"
        location-name="江阴靖江长江隧道"
      />

      <!-- ③ 江阴大桥流量柱状图 -->
      <TrafficBarSection
        section-key="bridge"
        location-name="江阴大桥"
      />

      <!-- ④ 车型分布：隧道 / 大桥 客车、货车数量与环形图 -->
      <VehicleTypeSection
        :tunnel-bg="bg2"
        :bridge-bg="bg4"
        :diamond-icon="icon6"
      />

      <!-- ⑤ 流量预测：实际 / 预测趋势折线图 + 地点切换 + 节假日预测入口 -->
      <ForecastSection :diamond-icon="icon7" />
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import icon5 from '../resources/images/icon-3561.png'
import icon4 from '../resources/images/Vector-3549.png'
import bg2 from '../resources/images/bg-_m-36.png'
import bg4 from '../resources/images/bg-_m-35.png'
import icon6 from '../resources/images/icon-3441.png'
import icon7 from '../resources/images/icon-3573.png'


import TotalTrafficSection from './components/TotalTrafficSection.vue'

import TrafficBarSection from './components/TrafficBarSection.vue'

import VehicleTypeSection from './components/VehicleTypeSection.vue'

import ForecastSection from './components/ForecastSection.vue'

// 微码运行时初始化（仅此一次调用，直接解构）

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件常量：运行时事件标识

const COMPONENT_ID = 'c-monitor'

const MONITOR_ONLOAD_EVENT = 'monitor-onload'

// ==================== 生命周期与组件级事件 ====================

/**

* 组件挂载完成

* 1. 向微码框架发布 monitor-onload 事件（对应 declare.json businessEvents）

* 2. 图表初始化由各子组件（TrafficBarSection / ForecastSection 等）在各自 onMounted 中完成

*/

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载

// 1. 当前组件未注册组件级全局监听/定时器，无需额外释放

// 2. 子组件的 ECharts 实例 / ResizeObserver / 事件监听由各子组件自身的 onUnmounted 负责销毁

onUnmounted(() => {
  // 预留清理入口：若后续增加全局监听/定时器，在此统一释放
})

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

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>