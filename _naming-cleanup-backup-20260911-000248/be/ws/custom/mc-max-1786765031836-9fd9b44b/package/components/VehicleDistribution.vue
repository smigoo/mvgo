<template>
  <div class="c-vehicle-distribution-root">
    <!-- 标题区 -->
    <div class="c-vehicle-distribution-header">
      <img :src="icon5" class="c-vehicle-distribution-header-icon" alt="icon" />
      <span class="c-vehicle-distribution-header-title">车型分布</span>
    </div>

    <!-- 内容区 -->
    <div class="c-vehicle-distribution-content">
      <!-- 江阴靖江长江隧道卡片 -->
      <div 
        class="c-vehicle-distribution-card" 
        :style="{ 
          backgroundImage: `url(${bgm_3})`, 
          backgroundSize: '100% 100%', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div 
          class="c-vehicle-distribution-card-title"
          :style="{ 
            backgroundImage: `url(${bg3})`, 
            backgroundSize: '100% 100%', 
            backgroundRepeat: 'no-repeat' 
          }"
        >
          <span class="c-vehicle-distribution-card-title-text">江阴靖江长江隧道</span>
        </div>
        <div ref="chartRef1" class="c-vehicle-distribution-chart"></div>
        <div class="c-vehicle-distribution-data">
          <div class="c-vehicle-distribution-data-item">
            <span class="c-vehicle-distribution-data-label">客车</span>
            <span class="c-vehicle-distribution-data-value c-vehicle-distribution-data-value--tunnel">22350</span>
          </div>
          <div class="c-vehicle-distribution-data-item">
            <span class="c-vehicle-distribution-data-label">货车</span>
            <span class="c-vehicle-distribution-data-value c-vehicle-distribution-data-value--truck">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div 
        class="c-vehicle-distribution-card" 
        :style="{ 
          backgroundImage: `url(${bgm_4})`, 
          backgroundSize: '100% 100%', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div 
          class="c-vehicle-distribution-card-title"
          :style="{ 
            backgroundImage: `url(${bg5})`, 
            backgroundSize: '100% 100%', 
            backgroundRepeat: 'no-repeat' 
          }"
        >
          <span class="c-vehicle-distribution-card-title-text">江阴大桥</span>
        </div>
        <div ref="chartRef2" class="c-vehicle-distribution-chart"></div>
        <div class="c-vehicle-distribution-data">
          <div class="c-vehicle-distribution-data-item">
            <span class="c-vehicle-distribution-data-label">客车</span>
            <span class="c-vehicle-distribution-data-value c-vehicle-distribution-data-value--tunnel">66109</span>
          </div>
          <div class="c-vehicle-distribution-data-item">
            <span class="c-vehicle-distribution-data-label">货车</span>
            <span class="c-vehicle-distribution-data-value c-vehicle-distribution-data-value--truck">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon5 from '../../resources/images/icon-3573.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg5 from '../../resources/images/bg-3525.png'
import bgm_3 from '../../resources/images/bg-_m-36.png'
import bgm_4 from '../../resources/images/bg-_m-35.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
let componentId = 'monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[VehicleDistribution] $mcComponentBuilder 失败:', e)
}

// --- 图表引用与实例 ---
const chartRef1 = ref(null)
const chartRef2 = ref(null)
let chart1 = null
let chart2 = null
let observer1 = null
let observer2 = null

// --- 图表数据 ---
/* [Style Refine] 饼图颜色保真 */
const tunnelData = [
  { value: 22350, name: '客车', itemStyle: { color: '#1990ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
]

const bridgeData = [
  { value: 66109, name: '客车', itemStyle: { color: '#1990ff' } },
  { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
]

// --- 图表配置生成 ---
const getChartOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: '#eee',
    borderWidth: 1,
    textStyle: { color: '#333', fontSize: 12 },
    formatter: '{b}: {c} ({d}%)'
  },
  series: [
    {
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      data: data,
      label: { show: false },
      emphasis: {
        label: { show: false },
        scaleSize: 4
      },
      animationType: 'scale',
      animationEasing: 'elasticOut'
    }
  ]
})

// --- 图表初始化逻辑 ---
const initChart = (chartEl, chartInstance, data, observerInstance) => {
  if (!chartEl) return { chart: chartInstance, observer: observerInstance }
  
  const { clientWidth, clientHeight } = chartEl
  if (clientWidth > 0 && clientHeight > 0 && !chartInstance) {
    chartInstance = echarts.init(chartEl)
    chartInstance.setOption(getChartOption(data), true)
  }

  if (!observerInstance) {
    observerInstance = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0 && !chartInstance) {
        observerInstance?.disconnect()
        chartInstance = echarts.init(chartEl)
        chartInstance.setOption(getChartOption(data), true)
      } else if (chartInstance) {
        chartInstance.resize()
      }
    })
    observerInstance.observe(chartEl)
  }

  return { chart: chartInstance, observer: observerInstance }
}

const handleResize = () => {
  if (chart1) chart1.resize()
  if (chart2) chart2.resize()
}

// --- 监听 ref 变化 ---
watch(chartRef1, (newRef) => {
  if (newRef && !chart1) {
    const res = initChart(newRef, chart1, tunnelData, observer1)
    chart1 = res.chart
    observer1 = res.observer
  }
})

watch(chartRef2, (newRef) => {
  if (newRef && !chart2) {
    const res = initChart(newRef, chart2, bridgeData, observer2)
    chart2 = res.chart
    observer2 = res.observer
  }
})

// --- 生命周期 ---
onMounted(() => {
  if (chartRef1.value && !chart1) {
    const res = initChart(chartRef1.value, chart1, tunnelData, observer1)
    chart1 = res.chart
    observer1 = res.observer
  }
  if (chartRef2.value && !chart2) {
    const res = initChart(chartRef2.value, chart2, bridgeData, observer2)
    chart2 = res.chart
    observer2 = res.observer
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart1?.dispose()
  chart2?.dispose()
  observer1?.disconnect()
  observer2?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-distribution-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.c-vehicle-distribution-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-vehicle-distribution-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-vehicle-distribution-header-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-vehicle-distribution-content {
  display: flex;
  flex: 1;
  gap: 12px;
  min-height: 0;
}

.c-vehicle-distribution-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.c-vehicle-distribution-card-title {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 130px;
  height: 24px;
  z-index: 2;
}

.c-vehicle-distribution-card-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  position: relative;
  z-index: 1;
}

.c-vehicle-distribution-chart {
  flex: 1;
  width: 100%;
  min-height: 0;
  margin-top: 24px;
}

.c-vehicle-distribution-data {
  display: flex;
  justify-content: space-around;
  padding: 0 16px 12px;
  flex-shrink: 0;
}

.c-vehicle-distribution-data-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-vehicle-distribution-data-label {
  font-family: 'Alibaba PuHuiTi', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  text-align: center;
}

.c-vehicle-distribution-data-value {
  font-family: 'Roboto', sans-serif;
  font-size: 18px;
  font-weight: 700;
  text-align: center;

  /* [Style Refine] fills[0].color → rgb(19, 153, 255) */
  &--tunnel {
    color: #1399ff;
  }

  /* [Style Refine] fills[0].color → rgb(255, 106, 0) */
  &--truck {
    color: #ff6a00;
  }
}
</style>