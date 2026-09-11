<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-right">
        <div class="c-env-monitor-icon-btn">
          <img :src="icon1" class="c-env-monitor-icon-img" />
        </div>
        <div class="c-env-monitor-icon-btn c-env-monitor-icon-btn-badge">
          <img :src="icon2" class="c-env-monitor-icon-img" />
          <span class="c-env-monitor-badge">6</span>
        </div>
      </div>
    </template>

    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div
          class="c-env-monitor-tabs-list"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div
            v-for="tab in tabs"
            :key="tab.value"
            class="c-env-monitor-tab-item"
            :class="{ 'c-env-monitor-tab-item-active': activeTab === tab.value }"
            @click="handleTabChange(tab.value)"
          >
            <div
              v-if="activeTab === tab.value"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
            ></div>
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <!-- CO浓度折线面积图 -->
      <div class="c-env-monitor-chart-section">
        <div class="c-env-monitor-chart-legend">
          <div class="c-env-monitor-legend-item">
            <span class="c-env-monitor-legend-line"></span>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </div>
        </div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab数据
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
])

const activeTab = ref('co')

// 各Tab的模拟数据
const tabDataMap = {
  co: [5, 8, 12, 18, 22, 28, 25, 20, 15, 10, 8, 6, 9, 14, 20, 26, 30, 28, 22, 18, 12, 8, 6, 4],
  visibility: [20, 25, 30, 35, 32, 28, 26, 30, 35, 38, 36, 32, 28, 25, 22, 20, 18, 20, 25, 30, 35, 38, 36, 32],
  indoor_light: [10, 12, 15, 18, 20, 22, 25, 28, 30, 28, 25, 22, 20, 18, 15, 12, 10, 12, 15, 18, 20, 22, 25, 28],
  outdoor_light: [2, 5, 10, 18, 28, 35, 38, 36, 32, 28, 22, 15, 10, 8, 12, 20, 30, 38, 40, 38, 32, 22, 12, 5]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return

  const data = tabDataMap[activeTab.value] || tabDataMap.co
  const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26,42,58,0.95)',
      borderColor: '#0078ff',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(0,120,255,0.4)'
        }
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 30,
      right: 48,
      top: 10,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.08)', type: 'dashed' }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.25)' },
            { offset: 1, color: 'rgba(15,205,125,0)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: [{ yAxis: 30 }],
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          }
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

const handleResize = () => {
  if (chart) chart.resize()
}

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

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

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-env-monitor-icon-img {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn-badge {
  position: relative;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: calc(@fontSize * 0.857);
  font-family: 'PingFang SC', sans-serif;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  padding: 0 2px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-env-monitor-tabs-section {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  padding: 3px 4px;
  gap: 2px;
  border-radius: 4px;
  position: relative;
}

.c-env-monitor-tab-item {
  position: relative;
  height: 21px;
  min-width: 56px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  overflow: hidden;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 3px;
  z-index: 0;
}

.c-env-monitor-tab-label {
  position: relative;
  z-index: 1;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
}

.c-env-monitor-tab-item-active .c-env-monitor-tab-label {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-chart-section {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-legend {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  padding: 4px 0 2px;
}

.c-env-monitor-legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1px;
  flex-shrink: 0;
}

.c-env-monitor-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.686);
  font-weight: 400;
  line-height: calc(@fontSize * 1.029);
  color: #333333;
}

.c-env-monitor-chart-container {
  flex: 1 1 0;
  min-height: 80px;
  min-width: 0;
  width: 100%;
}
</style>