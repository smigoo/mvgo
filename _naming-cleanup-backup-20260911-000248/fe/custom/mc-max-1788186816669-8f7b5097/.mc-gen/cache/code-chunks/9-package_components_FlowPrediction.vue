<template>
  <div class="c-monitor-flow-prediction">
    <!-- 区块标题 -->
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title-wrapper">
        <img :src="icon3" class="c-monitor-flow-prediction-icon" alt="icon" />
        <span class="c-monitor-flow-prediction-title">流量预测</span>
      </div>
      <div class="c-monitor-flow-prediction-controls">
        <!-- Tab 切换 -->
        <div class="c-monitor-flow-prediction-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-flow-prediction-tab-item', { active: currentTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <span class="c-monitor-flow-prediction-link">节假日预测</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-flow-prediction-body" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-flow-prediction-chart" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const icon3 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEqADAAQAAAABAAAAEgAAAACaqbJVAAAA50lEQVQ4Ee2UMQ6DMBBE7UiJlDYVH+ANfAZK/kT6/IEn8AaOlDYVEhLZrGc9HjtASKSgZaU4Hnbsa3Y3McbYSimtpZRWxphVCGHnnNsaY9bW2k0I4eCcO0kpD865o5TyZK19hBB2Usp9COEspbxKKa9SyouU8u6c20spL865u5TyZq29eu/3UsqrlPIspbxIKe/OubOU8iKlvHvv9865i5TyJqW8SimvUsqr9/7ivd9LKa9SyquU8iqlvEopr1LKq/d+L6W8eu/3Usqr934vpbx67/dSyqv3fi+lvHrv91LKq/d+L6W8eu/3Usqr9/7vB34AqJZeQV8qn7QAAAAASUVORK5CYII='
const bg5 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL8AAAAuCAYAAABAFl8mAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAv6ADAAQAAAABAAAALgAAAADfQqe2AAAEm0lEQVR4Ae2cS4/TMBSG'

const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const currentTab = ref('tunnel')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// Tab 切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
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
  if (newRef && !chart) initChart()
})

// 监听 currentTab 变化
watch(currentTab, () => {
  updateChart()
})

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      itemWidth: 14,
      itemHeight: 6
    },
    grid: {
      left: 40,
      right: 20,
      top: 50,
      bottom: 60,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      name: '',
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
          color: 'rgba(0, 0, 0, 0.15)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
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
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [2200, 2500, 2800, null, null],
        smooth: true,
        lineStyle: {
          color: '#3385ff',
          width: 2
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        },
        symbol: 'circle',
        symbolSize: 6
      },
      {
        name: '预测流量',
        type: 'line',
        data: [null, null, 2800, 3200, 3500],
        smooth: true,
        lineStyle: {
          color: '#00cccc',
          width: 2
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        },
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  }

  chart.setOption(option, true)
}

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-flow-prediction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-title-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-flow-prediction-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.0479230880737305px 5.0479230880737305px rgba(255, 255, 255, 0.8);
}

.c-monitor-flow-prediction-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-flow-prediction-tab-item {
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 20px;
  font-size: 14px;
  color: #ffffff;
  background: #6680a0;
  border: 0.7307692170143127px solid rgba(172, 196, 225, 1);
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.8);
  }

  &.active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
  }
}

.c-monitor-flow-prediction-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-flow-prediction-body {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.c-monitor-flow-prediction-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
