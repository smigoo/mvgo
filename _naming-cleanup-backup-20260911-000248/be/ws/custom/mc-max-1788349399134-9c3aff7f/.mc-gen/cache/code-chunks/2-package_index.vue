<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换区 -->
      <div class="c-env-monitor-tabs-container">
        <div 
          v-for="tab in tabs" 
          :key="tab.value"
          :class="['c-env-monitor-tab-item', { 'is-active': currentTab === tab.value }]"
          @click="handleTabChange(tab.value)"
          :style="currentTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
        >
          {{ tab.label }}
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
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 直接解构（声明+赋值一体，只能调用一次）
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

// Tab切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  // Mock数据：根据当前tab生成不同数据
  const dataMap = {
    co: [15, 18, 22, 28, 32, 30, 25, 20, 18, 22, 28, 32],
    visibility: [80, 75, 70, 68, 72, 78, 82, 85, 88, 90, 85, 80],
    lighting: [100, 95, 90, 88, 92, 98, 100, 98, 95, 92, 90, 88],
    outdoor: [1200, 1100, 1000, 950, 1050, 1150, 1250, 1300, 1350, 1400, 1350, 1300]
  }

  const option = {
    grid: {
      left: 50,
      right: 30,
      top: 40,
      bottom: 30,
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
    legend: {
      data: ['zk3+785CO浓度'],
      right: 20,
      top: 10,
      textStyle: {
        color: '#333333',
        fontSize: 9.6
      },
      itemWidth: 14,
      itemHeight: 2
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
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
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
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
        name: 'zk3+785CO浓度',
        type: 'line',
        data: dataMap[currentTab.value],
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: '#0fcd7d',
          width: 1
        },
        itemStyle: {
          color: '#0fcd7d'
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
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        }
      }
    ],
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: '#d32f2f',
        type: 'dashed',
        width: 1
      },
      data: [
        {
          yAxis: 30,
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          }
        }
      ]
    }
  }

  chart.setOption(option, true)
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }

  // 使用 ResizeObserver 等待容器就绪
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 监听 currentTab 变化
watch(currentTab, () => {
  updateChart()
})

// 窗口大小变化处理
const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

// 触发 onload 事件
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
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.c-env-monitor-tabs-container {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.c-env-monitor-tab-item {
  padding: 4px 10px;
  font-size: 14px;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  white-space: nowrap;
  flex-shrink: 0;
  
  &.is-active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
  
  &:hover:not(.is-active) {
    color: #1890ff;
  }
}

.c-env-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>