<template>
  <div class="c-monitor-hourly-bridge">
    <!-- 区块标题 -->
    <div class="c-monitor-hourly-bridge-header">
      <div class="c-monitor-hourly-bridge-title">
        <span class="c-monitor-hourly-bridge-title-bar"></span>
        <span class="c-monitor-hourly-bridge-title-text">江阴大桥</span>
      </div>
      <!-- 自定义图例 -->
      <div class="c-monitor-hourly-bridge-legend">
        <span
          class="c-monitor-hourly-bridge-legend-item"
          :class="{ inactive: !legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <span class="c-monitor-hourly-bridge-legend-dot c-monitor-hourly-bridge-legend-dot--beijing"></span>
          <span class="c-monitor-hourly-bridge-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-hourly-bridge-legend-item"
          :class="{ inactive: !legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-hourly-bridge-legend-dot c-monitor-hourly-bridge-legend-dot--shanghai"></span>
          <span class="c-monitor-hourly-bridge-legend-label">上海方向</span>
        </span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-hourly-bridge-chart-wrap" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-monitor-hourly-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-_m-35.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图表数据 —— 每小时（0~24）北京方向 / 上海方向 Mock 数据
const hoursData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

const beijingData = [120, 180, 260, 380, 520, 680, 740, 825, 760, 640, 420, 280]
const shanghaiData = [100, 160, 240, 360, 500, 660, 720, 831, 780, 660, 440, 300]

// 建议分流阈值
const FLOW_THRESHOLD = 600

// 切换图例
const toggleLegend = (name) => {
  if (chart) {
    chart.dispatchAction({ type: 'legendToggleSelect', name })
  }
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const getChartOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let html = `<div style="font-size: calc(@fontSize * 0.8571);color:#333;font-weight:400;margin-bottom:4px">${params[0].name}时</div>`
        params.forEach((p) => {
          const color = p.seriesName === '北京方向' ? '#1890ff' : '#ff9966'
          html += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color}"></span>
            <span style="color:#333;font-size: calc(@fontSize * 0.6857)">${p.seriesName}</span>
            <span style="font-size: @fontSize;font-weight:500;color:#333;margin-left:auto">${p.value}</span>
            <span style="font-size: calc(@fontSize * 0.6857);color:#333">辆</span>
          </div>`
        })
        return html
      }
    },
    legend: {
      show: false // 使用自定义图例
    },
    grid: {
      left: 36,
      right: 16,
      top: 12,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hoursData,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: {
        show: true,
        alignWithLabel: true
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1000,
      interval: 200,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: { show: true },
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.08)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barGap: '10%',
        barCategoryGap: '40%',
        data: beijingData,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: {
            color: '#ff984e',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            color: '#ff984e',
            fontSize: 12,
            formatter: '建议分流'
          },
          data: [{ yAxis: FLOW_THRESHOLD }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barGap: '10%',
        data: shanghaiData,
        itemStyle: {
          color: '#ff9966',
          borderRadius: [2, 2, 0, 0]
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
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

.c-monitor-hourly-bridge {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
}

.c-monitor-hourly-bridge-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  padding: 0 8px;
}

.c-monitor-hourly-bridge-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-hourly-bridge-title-bar {
  display: inline-block;
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-hourly-bridge-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-hourly-bridge-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.c-monitor-hourly-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;

  &.inactive {
    opacity: 0.35;
  }
}

.c-monitor-hourly-bridge-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;

  &--beijing {
    background: #1890ff;
  }

  &--shanghai {
    background: #ff9966;
  }
}

.c-monitor-hourly-bridge-legend-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-hourly-bridge-chart-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.c-monitor-hourly-bridge-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 120px;
}
</style>