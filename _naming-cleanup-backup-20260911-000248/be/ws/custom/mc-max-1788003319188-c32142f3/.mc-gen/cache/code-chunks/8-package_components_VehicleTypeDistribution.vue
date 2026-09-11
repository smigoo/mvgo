<template>
  <div class="c-monitor-vehicle-section">
    <!-- 分区标题（sub-header，非面板标题） -->
    <div class="c-monitor-vehicle-header">
      <img :src="icon2" class="c-monitor-vehicle-icon" alt="车型分布" />
      <span class="c-monitor-vehicle-title">车型分布</span>
    </div>

    <!-- 双饼图并排（horizontal-2-columns） -->
    <div class="c-monitor-vehicle-body">
      <!-- 江阴靖江长江隧道车型 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-legend">
          <div class="c-monitor-vehicle-legend-item">
            <span class="c-monitor-vehicle-dot c-monitor-vehicle-dot-bus"></span>
            <span class="c-monitor-vehicle-legend-label">客车</span>
            <span class="c-monitor-vehicle-legend-value">{{ tunnelData.bus }}</span>
          </div>
          <div class="c-monitor-vehicle-legend-item">
            <span class="c-monitor-vehicle-dot c-monitor-vehicle-dot-truck"></span>
            <span class="c-monitor-vehicle-legend-label">货车</span>
            <span class="c-monitor-vehicle-legend-value">{{ tunnelData.truck }}</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥车型 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-legend">
          <div class="c-monitor-vehicle-legend-item">
            <span class="c-monitor-vehicle-dot c-monitor-vehicle-dot-bus"></span>
            <span class="c-monitor-vehicle-legend-label">客车</span>
            <span class="c-monitor-vehicle-legend-value">{{ bridgeData.bus }}</span>
          </div>
          <div class="c-monitor-vehicle-legend-item">
            <span class="c-monitor-vehicle-dot c-monitor-vehicle-dot-truck"></span>
            <span class="c-monitor-vehicle-legend-label">货车</span>
            <span class="c-monitor-vehicle-legend-value">{{ bridgeData.truck }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  tunnelVehicleData: {
    type: Object,
    default: () => ({ bus: 22350, truck: 16270 })
  },
  bridgeVehicleData: {
    type: Object,
    default: () => ({ bus: 66109, truck: 16270 })
  }
})

// 归一化数据（兼容缺省字段）
const tunnelData = computed(() => ({
  bus: props.tunnelVehicleData?.bus ?? 22350,
  truck: props.tunnelVehicleData?.truck ?? 16270
}))
const bridgeData = computed(() => ({
  bus: props.bridgeVehicleData?.bus ?? 66109,
  truck: props.bridgeVehicleData?.truck ?? 16270
}))

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 车型分布饼图配置（客车蓝 / 货车橙）
const buildPieOption = (data) => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}：{c} 辆（{d}%）',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 },
    extraCssText: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);'
  },
  series: [
    {
      type: 'pie',
      radius: ['56%', '80%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data: [
        { value: data.bus, name: '客车', itemStyle: { color: '#1890ff' } },
        { value: data.truck, name: '货车', itemStyle: { color: '#fa8c16' } }
      ]
    }
  ]
})

const updateTunnel = () => {
  if (tunnelChart) tunnelChart.setOption(buildPieOption(tunnelData.value), true)
}
const updateBridge = () => {
  if (bridgeChart) bridgeChart.setOption(buildPieOption(bridgeData.value), true)
}

// 通用初始化：处理容器尺寸为 0 与 slot 重建
const initChart = (el, onReady) => {
  if (!el) return null
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const c = echarts.init(el)
    onReady(c)
    return { chart: c, observer: null }
  }
  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      observer.disconnect()
      const c = echarts.init(el)
      onReady(c)
    }
  })
  observer.observe(el)
  return { chart: null, observer }
}

watch(tunnelChartRef, (el) => {
  if (el && !tunnelChart) {
    const r = initChart(el, (c) => {
      tunnelChart = c
      updateTunnel()
    })
    if (r) {
      if (r.chart) tunnelChart = r.chart
      tunnelObserver = r.observer
    }
  }
})

watch(bridgeChartRef, (el) => {
  if (el && !bridgeChart) {
    const r = initChart(el, (c) => {
      bridgeChart = c
      updateBridge()
    })
    if (r) {
      if (r.chart) bridgeChart = r.chart
      bridgeObserver = r.observer
    }
  }
})

// 数据变化联动更新
watch(tunnelData, updateTunnel, { deep: true })
watch(bridgeData, updateBridge, { deep: true })

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  if (tunnelChartRef.value && !tunnelChart) {
    const r = initChart(tunnelChartRef.value, (c) => {
      tunnelChart = c
      updateTunnel()
    })
    if (r) {
      if (r.chart) tunnelChart = r.chart
      tunnelObserver = r.observer
    }
  }
  if (bridgeChartRef.value && !bridgeChart) {
    const r = initChart(bridgeChartRef.value, (c) => {
      bridgeChart = c
      updateBridge()
    })
    if (r) {
      if (r.chart) bridgeChart = r.chart
      bridgeObserver = r.observer
    }
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-section {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-vehicle-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-vehicle-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-right: 6px;
}

.c-monitor-vehicle-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-vehicle-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  overflow: hidden;
}

.c-monitor-vehicle-chart {
  flex: 1;
  min-width: 0;
  min-height: 100px;
  height: 100%;
}

.c-monitor-vehicle-legend {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding-right: 8px;
}

.c-monitor-vehicle-legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-monitor-vehicle-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-right: 6px;
}

.c-monitor-vehicle-dot-bus {
  background: #1890ff;
}

.c-monitor-vehicle-dot-truck {
  background: #fa8c16;
}

.c-monitor-vehicle-legend-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  margin-right: 6px;
  white-space: nowrap;
}

.c-monitor-vehicle-legend-value {
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  white-space: nowrap;
}
</style>
