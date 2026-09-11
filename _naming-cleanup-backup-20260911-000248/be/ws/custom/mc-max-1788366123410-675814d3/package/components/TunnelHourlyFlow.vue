<template>
  <div class="c-monitor-tunnel-hourly">
    <!-- 标题区域 -->
    <div class="c-monitor-tunnel-hourly-header">
      <div class="c-monitor-tunnel-hourly-title">
        <span class="c-monitor-tunnel-hourly-title-bar"></span>
        <span class="c-monitor-tunnel-hourly-title-text">江阴靖江长江隧道</span>
      </div>
      <!-- 自定义图例 -->
      <div class="c-monitor-tunnel-hourly-legend">
        <span
          class="c-monitor-tunnel-hourly-legend-item"
          :class="{ 'c-monitor-tunnel-hourly-legend-item--inactive': !legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-tunnel-hourly-legend-dot c-monitor-tunnel-hourly-legend-dot--beijing"></i>
          <span class="c-monitor-tunnel-hourly-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-tunnel-hourly-legend-item"
          :class="{ 'c-monitor-tunnel-hourly-legend-item--inactive': !legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-tunnel-hourly-legend-dot c-monitor-tunnel-hourly-legend-dot--shanghai"></i>
          <span class="c-monitor-tunnel-hourly-legend-label">上海方向</span>
        </span>
      </div>
    </div>
    <!-- 图表区域 -->
    <div
      class="c-monitor-tunnel-hourly-body"
      :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
    >
      <div ref="chartRef" class="c-monitor-tunnel-hourly-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-_m-35.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

/* 系统注入资源变量，禁止手写 import */
/* bg4 → ../resources/images/bg-_m-35.png */

// 图例状态
const legendState = ref({ 'c-monitor-beijing': true, 'c-monitor-shanghai': true })

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 切换图例
const toggleLegend = (name) => {
  if (chart) {
    chart.dispatchAction({ type: 'legendToggleSelect', name })
  }
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 模拟 24 小时双向流量数据（0-23时）
const hours = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [120, 150, 180, 320, 680, 1200, 1800, 2200, 825, 1600, 1400, 900, 400]
const shanghaiData = [100, 130, 160, 290, 650, 1100, 1700, 2100, 831, 1500, 1300, 850, 380]

const buildOption = () => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(161,206,255,1)',
    borderWidth: 1,
    borderRadius: 4,
    textStyle: {
      color: '#333333',
      fontSize: 12
    },
    formatter: (params) => {
      const hour = params[0]?.axisValue ?? ''
      let html = `<div style="font-size: calc(@fontSize * 0.8571);color:#333;margin-bottom:4px;">${hour}时</div>`
      params.forEach((p) => {
        const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${p.color};margin-right:4px;vertical-align:middle;"></span>`
        html += `<div>${dot}${p.seriesName}：<b>${p.value}</b> 辆</div>`
      })
      return html
    }
  },
  legend: {
    show: false // 使用自定义 DOM 图例
  },
  grid: {
    left: 48,
    right: 16,
    top: 12,
    bottom: 32,
    containLabel: false
  },
  xAxis: {
    type: 'category',
    data: hours,
    name: '时',
    nameLocation: 'end',
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
      lineStyle: { color: 'rgba(51,51,51,0.2)' }
    },
    axisLine: {
      show: true,
      lineStyle: { color: 'rgba(51,51,51,0.2)' }
    },
    splitLine: { show: false }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 4000,
    interval: 1000,
    name: '辆',
    nameLocation: 'end',
    nameTextStyle: {
      color: '#666666',
      fontSize: 12
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 12,
      fontFamily: 'Roboto',
      formatter: (v) => v
    },
    axisTick: {
      show: true,
      lineStyle: { color: 'rgba(51,51,51,0.2)' }
    },
    axisLine: {
      show: true,
      lineStyle: { color: 'rgba(51,51,51,0.2)' }
    },
    splitLine: {
      show: true,
      lineStyle: { color: 'rgba(51,51,51,0.08)', type: 'dashed' }
    }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      barMaxWidth: 8,
      barGap: '20%',
      data: beijingData,
      itemStyle: {
        color: 'rgba(25,144,255,1)',
        borderRadius: [2, 2, 0, 0]
      },
      markLine: {
        silent: true,
        symbol: ['none', 'none'],
        lineStyle: {
          color: 'rgba(255,152,78,1)',
          type: 'dashed',
          width: 1.5
        },
        label: {
          show: true,
          position: 'end',
          color: '#ff984e',
          fontSize: 12,
          formatter: '建议分流'
        },
        data: [{ yAxis: 3000 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      barMaxWidth: 8,
      barGap: '20%',
      data: shanghaiData,
      itemStyle: {
        color: 'rgba(255,138,96,1)',
        borderRadius: [2, 2, 0, 0]
      }
    }
  ]
})

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
  chart = null
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tunnel-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;

  .c-monitor-tunnel-hourly-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 8px 0 6px 0;

    .c-monitor-tunnel-hourly-title {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;

      .c-monitor-tunnel-hourly-title-bar {
        display: inline-block;
        width: 3px;
        height: 12px;
        border-radius: 6px;
        background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
        flex-shrink: 0;
      }

      .c-monitor-tunnel-hourly-title-text {
        font-family: 'Source Han Sans CN', sans-serif;
        font-size: calc(var(--fontSize, 14px) * 1);
        font-weight: 400;
        color: rgba(51, 51, 51, 1);
        line-height: 21px;
        white-space: nowrap;
      }
    }

    .c-monitor-tunnel-hourly-legend {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;

      .c-monitor-tunnel-hourly-legend-item {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
        transition: opacity 0.2s;

        &.c-monitor-tunnel-hourly-legend-item--inactive {
          opacity: 0.4;
        }

        .c-monitor-tunnel-hourly-legend-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex-shrink: 0;

          &.c-monitor-tunnel-hourly-legend-dot--beijing {
            background: rgba(25, 144, 255, 1);
          }

          &.c-monitor-tunnel-hourly-legend-dot--shanghai {
            background: rgba(255, 138, 96, 1);
          }
        }

        .c-monitor-tunnel-hourly-legend-label {
          font-family: 'Source Han Sans CN', sans-serif;
          font-size: calc(var(--fontSize, 14px) * 0.857);
          font-weight: 400;
          color: rgba(51, 51, 51, 1);
          line-height: 18px;
          white-space: nowrap;
        }
      }
    }
  }

  .c-monitor-tunnel-hourly-body {
    flex: 1;
    min-height: 0;
    position: relative;

    .c-monitor-tunnel-hourly-chart {
      width: 100%;
      height: 100%;
      min-height: 120px;
      min-width: 0;
    }
  }
}
</style>