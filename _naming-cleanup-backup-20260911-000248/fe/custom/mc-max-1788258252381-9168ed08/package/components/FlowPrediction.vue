<template>
  <div class="c-monitor-flow-prediction">
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title-group" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"><img :src="icon3" class="auto-mounted-icon" alt="icon" />
        <div class="c-monitor-flow-prediction-title">流量预测</div>
      </div>
      <div class="c-monitor-flow-prediction-controls">
        <div class="c-monitor-flow-prediction-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-flow-prediction-tab-item', { active: activeLocation === tab.value }]"
            @click="handleLocationChange(tab.value)"
           :style="activeLocation === tab.value ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
            {{ tab.label }}
          </div>
        </div>
        <div class="c-monitor-flow-prediction-link">节假日预测</div>
      </div>
    </div>

    <div class="c-monitor-flow-prediction-body" :style="{ backgroundImage: `url(${bg4})` }">
      <div ref="chartRef" class="c-monitor-flow-prediction-chart"></div>
      <div class="c-monitor-flow-prediction-legend">
        <div class="c-monitor-flow-prediction-legend-item">
          <span class="c-monitor-flow-prediction-legend-dot c-monitor-actual"></span>
          <span class="c-monitor-flow-prediction-legend-text">实际流量</span>
        </div>
        <div class="c-monitor-flow-prediction-legend-item">
          <span class="c-monitor-flow-prediction-legend-dot c-monitor-predict"></span>
          <span class="c-monitor-flow-prediction-legend-text">预测流量</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3573.png'
import bg1 from '../../resources/images/bg-_m-34.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg4 from '../../resources/images/bg-_m-35.png'


import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const activeLocation = ref('tunnel')

const chartRef = ref(null)
let chart = null
let chartObserver = null

const mockData = {
  'c-monitor-tunnel': {
    'c-monitor-actual': [2800, 2600, 2400, 2200, 2000],
    'c-monitor-predict': [null, null, null, 2100, 1900, 1800, 1700]
  },
  'c-monitor-bridge': {
    'c-monitor-actual': [3200, 3000, 2800, 2600, 2400],
    'c-monitor-predict': [null, null, null, 2500, 2300, 2200, 2100]
  }
}

const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

const updateChart = () => {
  if (!chart) return

  const data = mockData[activeLocation.value]
  const timeLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

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
      top: 20,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
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
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
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
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        lineStyle: {
          color: '#1890ff',
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
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#1890ff',
          borderWidth: 2
        },
        markPoint: {
          data: [
            {
              name: '准确率98%',
              coord: [0, data.actual[0]],
              value: '准确率98%',
              label: {
                show: true,
                color: '#52c41a',
                fontSize: 12,
                formatter: '{c}'
              }
            },
            {
              name: '准确率96%',
              coord: [1, data.actual[1]],
              value: '准确率96%',
              label: {
                show: true,
                color: '#52c41a',
                fontSize: 12,
                formatter: '{c}'
              }
            },
            {
              name: '准确率92%',
              coord: [2, data.actual[2]],
              value: '准确率92%',
              label: {
                show: true,
                color: '#faad14',
                fontSize: 12,
                formatter: '{c}'
              }
            }
          ]
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        lineStyle: {
          color: '#52c41a',
          width: 2,
          type: 'dashed'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#ffffff',
          borderColor: '#52c41a',
          borderWidth: 2
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

watch(activeLocation, () => {
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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  flex: 174 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-flow-prediction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-flow-prediction-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-flow-prediction-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
}

.c-monitor-flow-prediction-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  gap: 8px;
}

.c-monitor-flow-prediction-tab-item {
  padding: 4px 12px;
  font-size: @fontSize;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid rgba(172, 196, 225, 1);
  background: #6680a0;
  color: rgba(255, 255, 255, 0.85);

  &:hover {
    opacity: 0.9;
  }

  &.active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    color: #ffffff;
  }
}

.c-monitor-flow-prediction-link {
  font-size: calc(@fontSize * 0.8571);
  color: #1990ff;
  cursor: pointer;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-flow-prediction-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  overflow: hidden;
  padding: 12px;
}

.c-monitor-flow-prediction-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-flow-prediction-legend {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 8px;
}

.c-monitor-flow-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-flow-prediction-legend-dot {
  width: 14px;
  height: 2px;
  display: inline-block;
  position: relative;

  &.actual {
    background: #1890ff;

    &::after {
      content: '';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #1890ff;
    }
  }

  &.predict {
    background: linear-gradient(to right, #52c41a 50%, transparent 50%);
    background-size: cover;

    &::after {
      content: '';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #52c41a;
    }
  }
}

.c-monitor-flow-prediction-legend-text {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(51, 51, 51, 0.85);
}
</style>