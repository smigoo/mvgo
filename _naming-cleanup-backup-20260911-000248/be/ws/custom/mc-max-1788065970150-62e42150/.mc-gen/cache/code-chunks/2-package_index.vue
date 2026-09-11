<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab 切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-bg" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
          <div 
            v-for="tab in tabs" 
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-active': currentTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            <div 
              v-if="currentTab === tab.value" 
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
            ></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-tabs-icon-group">
          <img :src="icon1" class="c-env-monitor-icon-btn" />
          <img :src="icon2" class="c-env-monitor-icon-btn" />
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section">
        <div class="c-env-monitor-chart-header">
          <span class="c-env-monitor-chart-label">zk3+785CO浓度</span>
          <div class="c-env-monitor-legend">
            <span class="c-env-monitor-legend-item">
              <i class="c-env-monitor-legend-dot"></i>
              预警线
            </span>
          </div>
        </div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const bg2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const bg3 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const icon1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const icon2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

const currentTab = ref('co')
const chartRef = ref(null)
let chart = null
let chartObserver = null

const chartDataMap = {
  co: [5, 10, 15, 20, 25, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 10, 15, 20, 25, 30, 28],
  visibility: [50, 55, 60, 65, 70, 75, 80, 85, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60],
  lighting: [100, 105, 110, 115, 120, 125, 130, 135, 140, 138, 136, 134, 132, 130, 128, 126, 124, 122, 120, 118, 116, 114, 112, 110],
  outdoor: [200, 210, 220, 230, 240, 250, 260, 270, 280, 275, 270, 265, 260, 255, 250, 245, 240, 235, 230, 225, 220, 215, 210, 205]
}

const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}

const updateChart = () => {
  if (!chart) return
  
  const option = {
    grid: {
      left: 40,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
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
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)'
        }
      }
    },
    series: [
      {
        type: 'line',
        data: chartDataMap[currentTab.value],
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
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
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#d32f2f',
            width: 2
          },
          label: {
            show: false
          },
          data: [{ yAxis: 30 }]
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

watch(currentTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
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
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.c-env-monitor-tabs-section {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-env-monitor-tabs-bg {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 4px;
}

.c-env-monitor-tab-item {
  position: relative;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  color: #2c9bea;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  z-index: 0;
}

.c-env-monitor-tab-text {
  position: relative;
  z-index: 1;
}

.c-env-monitor-tab-active .c-env-monitor-tab-text {
  color: #ffffff;
  font-weight: 500;
}

.c-env-monitor-tabs-icon-group {
  display: flex;
  flex-direction: row;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-env-monitor-chart-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.c-env-monitor-legend {
  display: flex;
  flex-direction: row;
  gap: 16px;
}

.c-env-monitor-legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #d32f2f;
}

.c-env-monitor-legend-dot {
  width: 14px;
  height: 2px;
  background: #d32f2f;
  border-radius: 1px;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
