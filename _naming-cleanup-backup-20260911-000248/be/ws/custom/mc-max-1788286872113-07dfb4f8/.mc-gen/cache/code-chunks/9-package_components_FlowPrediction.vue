<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-header-left">
        <div class="c-monitor-title-icon"></div>
        <span class="c-monitor-section-title">流量预测</span>
      </div>
      <div class="c-monitor-header-right">
        <!-- 地点切换 Tab -->
        <div class="c-monitor-location-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-location-tab', { active: currentLocation === tab.value }]"
            @click="handleLocationChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测开关 -->
        <div class="c-monitor-holiday-switch">
          <div
            :class="['c-monitor-holiday-tab', { active: holidayPrediction }]"
            @click="holidayPrediction = !holidayPrediction"
          >
            节假日预测
          </div>
        </div>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>

      <!-- 准确率标签 -->
      <div class="c-monitor-accuracy-labels">
        <div class="c-monitor-accuracy-item">
          <div class="c-monitor-accuracy-time">2小时前</div>
          <div class="c-monitor-accuracy-rate success">准确率98%</div>
        </div>
        <div class="c-monitor-accuracy-item">
          <div class="c-monitor-accuracy-time">1小时前</div>
          <div class="c-monitor-accuracy-rate success">准确率96%</div>
        </div>
        <div class="c-monitor-accuracy-item">
          <div class="c-monitor-accuracy-time">当前时间</div>
          <div class="c-monitor-accuracy-rate success">准确率92%</div>
        </div>
        <div class="c-monitor-accuracy-item">
          <div class="c-monitor-accuracy-time gray">1小时后</div>
        </div>
        <div class="c-monitor-accuracy-item">
          <div class="c-monitor-accuracy-time gray">2小时后</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import bg4 from '../../resources/images/bg-_m-35.png'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 地点切换
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const currentLocation = ref('tunnel')

// 节假日预测开关
const holidayPrediction = ref(true)

// 模拟数据
const predictionData = ref({
  tunnel: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3000, 3200, null, null],
    predicted: [null, null, 3200, 3400, 3600]
  },
  bridge: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [3200, 3400, 3600, null, null],
    predicted: [null, null, 3600, 3800, 4000]
  }
})

const handleLocationChange = (value) => {
  if (currentLocation.value === value) return
  currentLocation.value = value
  updateChart()
}

const updateChart = () => {
  if (!chart) return

  const data = predictionData.value[currentLocation.value]

  const option = {
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
      itemWidth: 24,
      itemHeight: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 40,
      right: 20,
      top: 50,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        lineStyle: {
          color: 'rgba(25, 144, 255, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)'
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
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
        lineStyle: {
          color: 'rgba(153, 153, 153, 1)',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: 'rgba(153, 153, 153, 1)'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(153, 153, 153, 0.15)' },
              { offset: 1, color: 'rgba(153, 153, 153, 0.02)' }
            ]
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

watch([currentLocation, holidayPrediction], () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
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

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.c-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-header-right {
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
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.8);
  }

  &.active {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    color: #1990ff;
    font-weight: 500;
  }
}

.c-monitor-holiday-switch {
  display: flex;
}

.c-monitor-holiday-tab {
  padding: 4px 12px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.8);
  }

  &.active {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    color: #1990ff;
    font-weight: 500;
  }
}

.c-monitor-chart-body {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-monitor-accuracy-labels {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 12px;
  padding: 0 20px;
}

.c-monitor-accuracy-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-accuracy-time {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;

  &.gray {
    color: #999999;
  }
}

.c-monitor-accuracy-rate {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;

  &.success {
    color: #52c41a;
  }
}
</style>
