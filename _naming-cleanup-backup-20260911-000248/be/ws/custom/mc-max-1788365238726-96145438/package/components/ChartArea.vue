<template>
  <div class="c-env-monitor-chart-area">
    <div class="c-env-monitor-chart-body">
      <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      <div class="c-env-monitor-stat-display">
        <div class="c-env-monitor-stat-row">
          <span class="c-env-monitor-stat-dot"></span>
          <span class="c-env-monitor-stat-label">当前</span>
        </div>
        <div class="c-env-monitor-stat-value">{{ currentValue }}</div>
        <div class="c-env-monitor-stat-row">
          <span class="c-env-monitor-stat-dot-secondary"></span>
          <span class="c-env-monitor-stat-label">24-7h5CO浓度</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'


import { ref, onMounted, onUnmounted, watch, computed} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  },
  bg1: {
    type: String,
    required: true
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null
const currentValue = ref(40)

const mockData = {
  '一氧化碳': [15, 18, 22, 25, 28, 32, 35, 38, 40, 38, 35, 32, 28, 25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10],
  '能见度': [80, 82, 85, 88, 90, 92, 95, 93, 90, 88, 85, 83, 80, 78, 75, 73, 70, 68, 65, 63, 60, 58, 55, 52],
  '洞内照明': [300, 320, 340, 360, 380, 400, 420, 440, 460, 450, 440, 430, 420, 410, 400, 390, 380, 370, 360, 350, 340, 330, 320, 310],
  '洞外光强': [500, 550, 600, 650, 700, 750, 800, 850, 900, 880, 860, 840, 820, 800, 780, 760, 740, 720, 700, 680, 660, 640, 620, 600]
}

const currentData = computed(() => mockData[props.activeTab] || mockData['一氧化碳'])

const updateChart = () => {
  if (!chart) return

  const data = currentData.value
  currentValue.value = data[data.length - 1]

  const option = {
    grid: {
      left: 40,
      right: 100,
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
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${props.activeTab}: ${p.value}`
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
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
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
      max: 50,
      interval: 10,
      axisLine: {
        show: false
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
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    series: [
      {
        name: props.activeTab,
        type: 'line',
        smooth: true,
        data: data,
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
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
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
            color: 'rgba(255, 77, 79, 1)',
            width: 1
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

watch(() => props.activeTab, () => {
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
@fontSize: 14px;

@import '../../resources/styles/index.less';

.c-env-monitor-chart-area {
  flex: 145 1 0;
  min-height: 0;
  width: 100%;
}

.c-env-monitor-chart-body {
  width: 100%;
  flex: 1 1 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  display: flex;
  position: relative;
  padding: 12px;
  box-sizing: border-box;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.c-env-monitor-stat-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  flex-shrink: 0;
}

.c-env-monitor-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-env-monitor-stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(15, 205, 125, 1);
  flex-shrink: 0;
}

.c-env-monitor-stat-dot-secondary {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(82, 196, 26, 1);
  flex-shrink: 0;
}

.c-env-monitor-stat-label {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(0, 0, 0, 0.45);
  white-space: nowrap;
}

.c-env-monitor-stat-value {
  font-size: calc(@fontSize * 2.8571);
  font-weight: bold;
  color: rgba(0, 0, 0, 0.85);
  line-height: 1.2;
}
</style>