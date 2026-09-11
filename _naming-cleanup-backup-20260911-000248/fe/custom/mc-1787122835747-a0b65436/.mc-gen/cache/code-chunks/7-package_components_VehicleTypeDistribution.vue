<template>
  <div class="c-vehicle-type-root">
    <div class="c-vehicle-type-cards">
      <div
        class="c-vehicle-type-card"
        :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-vehicle-type-card-header">
          <span class="c-vehicle-type-title-bar"></span>
          <span class="c-vehicle-type-card-title">江阴靖江长江隧道</span>
        </div>
        <div class="c-vehicle-type-card-body">
          <div class="c-vehicle-type-stat">
            <div class="c-vehicle-type-stat-label">客车</div>
            <div class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">22,350</div>
          </div>
          <div ref="tunnelChartRef" class="c-vehicle-type-chart"></div>
          <div class="c-vehicle-type-stat">
            <div class="c-vehicle-type-stat-label">货车</div>
            <div class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16,270</div>
          </div>
        </div>
      </div>

      <div
        class="c-vehicle-type-card"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-vehicle-type-card-header">
          <span class="c-vehicle-type-title-bar"></span>
          <span class="c-vehicle-type-card-title">江阴大桥</span>
        </div>
        <div class="c-vehicle-type-card-body">
          <div class="c-vehicle-type-stat">
            <div class="c-vehicle-type-stat-label">客车</div>
            <div class="c-vehicle-type-stat-value c-vehicle-type-stat-value--blue">66,109</div>
          </div>
          <div ref="bridgeChartRef" class="c-vehicle-type-chart"></div>
          <div class="c-vehicle-type-stat">
            <div class="c-vehicle-type-stat-label">货车</div>
            <div class="c-vehicle-type-stat-value c-vehicle-type-stat-value--orange">16,270</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[VehicleTypeDistribution] $mcComponentBuilder 初始化失败:', e)
}

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

let tunnelInstance = null
let bridgeInstance = null

const tunnelData = [
  { value: 22350, name: '客车', itemStyle: { color: '#1990ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#f97316' } }
]

const bridgeData = [
  { value: 66109, name: '客车', itemStyle: { color: '#1990ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#f97316' } }
]

const createOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    textStyle: { color: '#fff', fontSize: 12 },
    formatter: '{b}: {c} ({d}%)'
  },
  series: [
    {
      type: 'pie',
      radius: ['62%', '82%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data
    }
  ]
})

/**
 * 初始化单个环形图
 * @param {import('vue').Ref<HTMLElement|null>} containerRef 容器引用
 * @param {Array} data 数据
 * @returns {{chart: echarts.ECharts|null, observer: ResizeObserver|null}}
 */
const initDonutChart = (containerRef, data) => {
  const container = containerRef.value
  if (!container) return { chart: null, observer: null }

  const instance = { chart: null, observer: null }

  const setup = () => {
    const { clientWidth, clientHeight } = container
    if (clientWidth > 0 && clientHeight > 0) {
      instance.chart = echarts.init(container)
      instance.chart.setOption(createOption(data))
      if (instance.observer) {
        instance.observer.disconnect()
        instance.observer = null
      }
      return true
    }
    return false
  }

  if (!setup()) {
    instance.observer = new ResizeObserver(() => {
      if (setup()) {
        // 初始化完成后 observer 已在 setup 中断开
      }
    })
    instance.observer.observe(container)
  }

  return instance
}

const handleResize = () => {
  tunnelInstance?.chart?.resize()
  bridgeInstance?.chart?.resize()
}

onMounted(() => {
  tunnelInstance = initDonutChart(tunnelChartRef, tunnelData)
  bridgeInstance = initDonutChart(bridgeChartRef, bridgeData)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelInstance?.chart?.dispose()
  bridgeInstance?.chart?.dispose()
  tunnelInstance?.observer?.disconnect()
  bridgeInstance?.observer?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-type-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-vehicle-type-cards {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-vehicle-type-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 10px;
  box-sizing: border-box;
}

.c-vehicle-type-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.c-vehicle-type-title-bar {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

.c-vehicle-type-card-title {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-vehicle-type-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-vehicle-type-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.c-vehicle-type-stat-label {
  font-family: 'Alibaba PuHuiTi', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-vehicle-type-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 18px;
}

.c-vehicle-type-stat-value--blue {
  color: #1990ff;
}

.c-vehicle-type-stat-value--orange {
  color: #f97316;
}

.c-vehicle-type-chart {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  width: 100%;
}
</style>