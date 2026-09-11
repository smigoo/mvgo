<template>
  <section class="c-flow-forecast">
    <div class="c-flow-forecast-header">
      <div class="c-flow-forecast-title-block">
        <img :src="icon5" class="c-flow-forecast-title-icon" alt="" />
        <span class="c-flow-forecast-title">流量预测</span>
      </div>
      <div class="c-flow-forecast-controls">
        <div class="c-flow-forecast-tabs">
          <button
            v-for="loc in locations"
            :key="loc"
            type="button"
            class="c-flow-forecast-tab"
            :class="{ 'c-flow-forecast-tab-active': activeLocation === loc }"
            @click="activeLocation = loc"
          >
            {{ loc }}
          </button>
        </div>
        <a class="c-flow-forecast-link" href="javascript:void(0)">节假日预测&gt;</a>
      </div>
    </div>

    <div class="c-flow-forecast-chart-wrapper">
      <div ref="chartRef" class="c-flow-forecast-chart"></div>
    </div>

    <div class="c-flow-forecast-accuracy">
      <span
        v-for="item in currentAccuracy"
        :key="item"
        class="c-flow-forecast-accuracy-item"
      >
        准确率{{ item }}%
      </span>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[FlowForecast] $mcComponentBuilder 失败:', e)
}

const activeLocation = ref('江阴靖江长江隧道')
const locations = ['江阴靖江长江隧道', '江阴大桥']

const forecastDataMap = {
  江阴靖江长江隧道: {
    actual: [2400, 2580, 2800, null, null],
    forecast: [null, null, 2800, 3050, 3320],
    accuracy: [98, 96, 92]
  },
  江阴大桥: {
    actual: [3200, 3400, 3650, null, null],
    forecast: [null, null, 3650, 3900, 4080],
    accuracy: [94, 91, 89]
  }
}

const currentAccuracy = computed(() => forecastDataMap[activeLocation.value].accuracy)

const categories = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

const chartRef = ref(null)
let chart = null
let chartObserver = null

const buildOption = () => {
  const data = forecastDataMap[activeLocation.value]

  return {
    color: ['#1990ff', '#52c41a'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#d9e8f5',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        if (!params || !params.length) return ''
        const parts = params.map((p) => {
          const value = p.value === null || p.value === undefined ? '--' : `${p.value} 辆`
          return `${p.marker}${p.seriesName}：${value}`
        })
        return `${params[0].axisValue}<br/>${parts.join('<br/>')}`
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 6,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 28,
      bottom: 26,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: {
        lineStyle: { color: '#c0d3e2' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 10,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      splitNumber: 4,
      axisLabel: {
        color: '#666666',
        fontSize: 10
      },
      splitLine: {
        lineStyle: { color: '#e1ebf4' }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25,144,255,0.25)' },
              { offset: 1, color: 'rgba(25,144,255,0)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82,196,26,0.22)' },
              { offset: 1, color: 'rgba(82,196,26,0)' }
            ]
          }
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
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
@import '../../resources/styles/index.less';

.c-flow-forecast {
  width: 100%;
  height: 174px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.c-flow-forecast-header {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
  height: 24px;
  margin-bottom: 4px;
}

.c-flow-forecast-title-block {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.c-flow-forecast-title-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.c-flow-forecast-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-flow-forecast-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  min-width: 0;
}

.c-flow-forecast-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-flow-forecast-tab {
  border: none;
  cursor: pointer;
  height: 19px;
  padding: 0 12px;
  border-radius: 20px;
  background: #6680a0;
  color: #ffffff;
  font-size: 12px;
  line-height: 19px;
  white-space: nowrap;
  transition: background-color 0.2s ease;
}

.c-flow-forecast-tab-active {
  background: #1990ff;
}

.c-flow-forecast-link {
  font-size: 12px;
  color: #1990ff;
  line-height: 18px;
  text-decoration: none;
  white-space: nowrap;
}

.c-flow-forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-flow-forecast-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-flow-forecast-accuracy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 21px;
  flex: 0 0 auto;
  padding-top: 2px;
}

.c-flow-forecast-accuracy-item {
  font-size: 12px;
  font-weight: 500;
  color: #333333;
  line-height: 12px;
}
</style>