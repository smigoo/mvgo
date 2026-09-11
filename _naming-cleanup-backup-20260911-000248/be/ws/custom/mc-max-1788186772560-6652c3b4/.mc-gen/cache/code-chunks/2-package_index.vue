<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs-container">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-env-monitor-tab-item', { active: currentTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === Tab 选项 ===
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])
// === 当前激活的 tab ===
const currentTab = ref('co')
// === 图表实例 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null
// === Tab 切换处理 ===
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}
// === 初始化图表 ===
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
// === 更新图表 ===
const updateChart = () => {
  if (!chart) return

  // 模拟数据（根据当前 tab 切换）
  const dataMap = {
    co: [12, 18, 25, 32, 28, 22, 18, 15, 20, 26, 30, 35],
    visibility: [80, 75, 70, 65, 60, 55, 50, 55, 60, 65, 70, 75],
    lighting: [300, 320, 340, 360, 380, 400, 420, 400, 380, 360, 340, 320],
    outdoor: [5000, 5200, 5400, 5600, 5800, 6000, 6200, 6000, 5800, 5600, 5400, 5200]
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 20,
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
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#e0e0e0'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#e0e0e0',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: 'CO浓度',
        type: 'line',
        data: dataMap[currentTab.value],
        smooth: true,
        lineStyle: {
          color: '#52c41a',
          width: 2
        },
        itemStyle: {
          color: '#52c41a'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: 'rgba(82, 196, 26, 0.3)'
              },
              {
                offset: 1,
                color: 'rgba(82, 196, 26, 0.05)'
              }
            ]
          }
        }
      }
    ],
    markLine: {
      silent: true,
      lineStyle: {
        color: '#ff6461',
        type: 'dashed',
        width: 1
      },
      label: {
        show: true,
        position: 'end',
        formatter: '阈值线',
        color: '#d32f2f',
        fontSize: 12
      },
      data: [
        {
          yAxis: 30
        }
      ]
    }
  }

  chart.setOption(option, true)
}
// === 监听 chartRef ===
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})
// === 窗口 resize 处理 ===
const handleResize = () => {
  if (chart) chart.resize()
}
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  emitLoadEvent()
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

.c-env-monitor-tabs-container {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 12px;
}

.c-env-monitor-tab-item {
  flex: 1;
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid #ffffff;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;

  &:first-child {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }

  &:last-child {
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  &:not(:last-child) {
    border-right: none;
  }

  &.active {
    color: #ffffff;
    background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
    border: 0.6px solid #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }

  &:hover:not(.active) {
    background: linear-gradient(180deg, #a5d4ff 0%, #c1e9ff 100%);
  }
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
