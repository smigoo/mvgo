<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img v-if="icon3" :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- 地点切换 Tab -->
        <div class="c-monitor-location-tabs">
<div v-for="tab in locationTabs" :key="tab.value" :class="['c-monitor-location-tab', { active: activeLocation === tab.value }]" @click="handleLocationChange(tab.value)" >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测开关 -->
        <div class="c-monitor-holiday-switch">
<div :class="['c-monitor-holiday-tab', { active: holidayMode }]" @click="holidayMode = !holidayMode" >
            节假日预测
          </div>
        </div>
      </div>
    </div>

    <!-- 图表容器 -->
<div class="c-monitor-chart-body" :style="{ backgroundImage: bg5 ? `url(${bg5})` : undefined }" >
      <div ref="chartRef" class="c-monitor-chart-container" />
      <!-- 准确率标签 -->
      <div class="c-monitor-accuracy-labels">
        <div class="c-monitor-accuracy-item past">
          <span class="c-monitor-accuracy-time">2小时前</span>
          <span class="c-monitor-accuracy-rate">准确率98%</span>
        </div>
        <div class="c-monitor-accuracy-item past">
          <span class="c-monitor-accuracy-time">1小时前</span>
          <span class="c-monitor-accuracy-rate">准确率96%</span>
        </div>
        <div class="c-monitor-accuracy-item current">
          <span class="c-monitor-accuracy-time">当前时间</span>
          <span class="c-monitor-accuracy-rate">准确率92%</span>
        </div>
        <div class="c-monitor-accuracy-item future">
          <span class="c-monitor-accuracy-time">1小时后</span>
        </div>
        <div class="c-monitor-accuracy-item future">
          <span class="c-monitor-accuracy-time">2小时后</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ icon3: String, bg5: String
})

const { icon3, bg5 } = props

// 地点切换 Tab
const locationTabs = ref([ { label: '江阴靖江长江隧道', value: 'tunnel' }, { label: '江阴大桥', value: 'bridge' }
])

const activeLocation = ref('tunnel')

// 节假日预测模式
const holidayMode = ref(true)

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（实际流量 + 预测流量）
const getMockData = () => {
  const base = activeLocation.value === 'tunnel' ? 800 : 2000
  const actual = []
  const predicted = []
  
  // 实际流量（2小时前到当前时间）
  for (let i = -2; i <= 0; i++) {
    actual.push([i, base + Math.random() * 200 - 100])
  }
  
  // 预测流量（当前时间到2小时后）
  for (let i = 0; i <= 2; i++) {
    predicted.push([i, base + Math.random() * 300 - 150])
  }
  
  return { actual, predicted }
}

// 初始化图表
const initChart = () => { if (!chartRef.value) return
  
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

// 更新图表
const updateChart = () => { if (!chart) return
  
  const { actual, predicted } = getMockData()
  
const option = { grid: { left: 40, right: 20, top: 40, bottom: 30, containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
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
      }
    },
    xAxis: {
      type: 'value',
      name: '时间',
      min: -2,
      max: 2,
      interval: 1,
      axisLabel: {
        show: true,
        formatter: (value) => {
          if (value === 0) return '当前'
          return value > 0 ? `${value}h后` : `${Math.abs(value)}h前`
        }
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.2)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 4000,
      axisLabel: {
        show: true
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.2)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: actual,
        smooth: true,
        lineStyle: {
          color: 'rgba(25, 144, 255, 1)',
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
              { offset: 0, color: 'rgba(25, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(25, 144, 255, 0.05)' }
            ]
          }
        },
        markLine: {
          symbol: 'none',
          data: [
            {
              xAxis: 0,
              lineStyle: {
                color: 'rgba(25, 144, 255, 1)',
                type: 'solid',
                width: 2
              },
              label: {
                show: false
              }
            }
          ]
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: predicted,
        smooth: true,
        lineStyle: {
          color: 'rgba(153, 153, 153, 1)',
          width: 2,
          type: 'dashed'
        },
        areaStyle: {
          color: 'rgba(153, 153, 153, 0.1)'
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 地点切换处理
const handleLocationChange = (value) => { if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听地点和模式变化
watch([activeLocation, holidayMode], () => {
  updateChart()
})

// 窗口大小变化处理
const handleResize = () => { if (chart) chart.resize()
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

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 12px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-location-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-location-tab {
  padding: 4px 12px;
  font-size: calc(@fontSize * 0.8571);
  color: #333333;
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(237, 244, 251, 1);
  }

  &.active {
    color: #ffffff;
    background: linear-gradient(180deg, #1990ff 0%, #1990ff 100%);
    border-color: #1990ff;
  }
}

.c-monitor-holiday-switch {
  display: flex;
  align-items: center;
}

.c-monitor-holiday-tab {
  padding: 4px 12px;
  font-size: calc(@fontSize * 0.8571);
  color: #333333;
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(237, 244, 251, 1);
  }

  &.active {
    color: #ffffff;
    background: linear-gradient(180deg, #1990ff 0%, #1990ff 100%);
    border-color: #1990ff;
  }
}

.c-monitor-chart-body {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  position: relative;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-accuracy-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 40px;
  flex-shrink: 0;
  height: 40px;
}

.c-monitor-accuracy-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.c-monitor-accuracy-time {
  font-size: calc(@fontSize * 0.8571);
  line-height: 18px;
}

.c-monitor-accuracy-rate {
  font-size: calc(@fontSize * 0.8571);
  line-height: 18px;
}

.c-monitor-accuracy-item.past {
  .c-monitor-accuracy-time,
  .c-monitor-accuracy-rate {
    color: rgba(82, 196, 26, 1);
  }
}

.c-monitor-accuracy-item.current {
  .c-monitor-accuracy-time,
  .c-monitor-accuracy-rate {
    color: rgba(82, 196, 26, 1);
  }
}

.c-monitor-accuracy-item.future {
  .c-monitor-accuracy-time {
    color: rgba(153, 153, 153, 1);
  }
}
</style>