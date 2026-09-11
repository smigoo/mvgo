<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs" :style="{ backgroundImage: `url(${bg2})` }">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item-active': currentTab === tab.value }]"
          :style="currentTab === tab.value ? { backgroundImage: `url(${bg3})` } : {}"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
        
        <!-- 右侧图标组 -->
        <div class="c-env-monitor-tab-icons">
          <img :src="icon1" class="c-env-monitor-icon" />
          <img :src="icon2" class="c-env-monitor-icon" />
          <div class="c-env-monitor-badge">6</div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-wrapper">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab选项
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的tab
const currentTab = ref('co')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（不同tab对应不同数据）
const dataMap = {
  co: [12, 15, 18, 22, 25, 28, 30, 28, 25, 22, 20, 18, 16, 15, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
  visibility: [80, 75, 70, 65, 60, 58, 55, 60, 65, 70, 75, 80, 85, 90, 88, 85, 82, 80, 78, 75, 72, 70, 68, 65],
  lighting: [100, 100, 100, 100, 100, 100, 100, 95, 90, 85, 85, 90, 95, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  outdoor: [200, 300, 400, 500, 600, 700, 800, 900, 1000, 950, 900, 850, 800, 750, 700, 600, 500, 400, 300, 200, 150, 100, 80, 60]
}

// Tab切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}

// 监听currentTab变化
watch(currentTab, () => {
  updateChart()
})

// 初始化图表
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

// 监听chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const data = dataMap[currentTab.value] || dataMap.co
  
  const option = {
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
    grid: {
      left: 40,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(15, 205, 125, 1)'
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            type: 'dashed',
            color: '#d32f2f',
            width: 2
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 窗口resize处理
const handleResize = () => {
  if (chart) chart.resize()
}

// 触发onload事件
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
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
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
  gap: 12px;
}

.c-env-monitor-tabs {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 3px;
  border-radius: 4px;
  gap: 4px;
  position: relative;
}

.c-env-monitor-tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  transition: all 0.3s;
  border-radius: 2px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  white-space: nowrap;
}

.c-env-monitor-tab-item-active {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tab-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding-right: 4px;
  position: relative;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}

.c-env-monitor-badge {
  position: absolute;
  top: -6px;
  right: 0;
  min-width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  border-radius: 29px;
  padding: 0 4px;
}

.c-env-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
