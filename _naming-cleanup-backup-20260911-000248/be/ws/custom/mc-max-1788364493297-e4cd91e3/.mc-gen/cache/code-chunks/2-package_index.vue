<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab 切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-container" :style="tabContainerBg">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': currentTab === tab.value }]"
            :style="currentTab === tab.value ? tabActiveBg : {}"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>

        <div class="c-env-monitor-icons-group">
          <div class="c-env-monitor-icon-btn c-env-monitor-icon-btn--active">
            <img :src="icon1" class="c-env-monitor-icon-img" />
          </div>
          <div class="c-env-monitor-icon-btn c-env-monitor-icon-badge-wrapper">
            <img :src="icon2" class="c-env-monitor-icon-img" />
            <span class="c-env-monitor-icon-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section" :style="chartSectionBg">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化（直接解构，只调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 资源变量（系统注入，模板插值使用） ===
// bg1: 未使用
// bg2: Tab 激活态背景
// icon1: 柱状图图标
// icon2: 列表图标
// bgtabActive: Tab 容器背景
// === Tab 数据 ===
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

const currentTab = ref('co')
// === 图表数据映射（模拟不同 Tab 对应的数据） ===
const chartDataMap = {
  co: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [8, 12, 18, 28, 35, 32, 28, 25, 20, 15, 10, 8],
    warningLine: 30,
    unit: 'ppm',
    legend: 'zk3+785CO浓度'
  },
  visibility: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [50, 60, 70, 80, 90, 85, 80, 75, 70, 65, 60, 55],
    warningLine: 50,
    unit: 'm',
    legend: '能见度'
  },
  lighting: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [100, 150, 200, 250, 300, 280, 260, 240, 220, 200, 180, 150],
    warningLine: 200,
    unit: 'lux',
    legend: '洞内照明'
  },
  outdoor: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [500, 800, 1200, 1800, 2500, 3000, 2800, 2400, 2000, 1500, 1000, 600],
    warningLine: 2000,
    unit: 'lux',
    legend: '洞外光强'
  }
}
// === 图表实例 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null
// === 背景图样式（模板插值） ===
const tabContainerBg = computed(() => ({
  backgroundImage: `url(${bgtabActive})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))

const tabActiveBg = computed(() => ({
  backgroundImage: `url(${bg2})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))

const chartSectionBg = computed(() => ({
  backgroundImage: `url(${bg1})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))
// === Tab 切换处理 ===
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}
// === 更新图表 ===
const updateChart = () => {
  if (!chart) return

  const data = chartDataMap[currentTab.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value} ${data.unit}`
      }
    },
    legend: {
      data: [data.legend],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 40,
      right: 16,
      top: 36,
      bottom: 32,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)'
        }
      }
    },
    series: [
      {
        name: data.legend,
        type: 'line',
        data: data.yData,
        smooth: true,
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.6)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          data: [
            {
              yAxis: data.warningLine
            }
          ]
        }
      }
    ]
  }

  chart.setOption(option, true)
}
// === 初始化图表（ResizeObserver + watch） ===
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
// === watch chartRef ===
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})
// === 窗口 resize ===
const handleResize = () => {
  if (chart) chart.resize()
}
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  initChart()
  emitLoadEvent()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style scoped lang="less">
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-env-monitor-tabs-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.c-env-monitor-tabs-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
}

.c-env-monitor-tab-item {
  padding: 6px 14px;
  font-size: calc(@fontSize * 0.875);
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
  border-radius: 4px;
}

.c-env-monitor-tab-item--active {
  color: #ffffff;
  font-weight: 500;
}

.c-env-monitor-icons-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  cursor: pointer;
  transition: opacity 0.3s;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn--active {
  opacity: 1;
}

.c-env-monitor-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-env-monitor-icon-badge-wrapper {
  position: relative;
}

.c-env-monitor-icon-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 4px;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
