<template>
  <div class="c-monitor-hourly-bridge">
    <!-- 区块标题行 -->
    <div class="c-monitor-hourly-bridge-header">
      <div class="c-monitor-hourly-bridge-title-wrap">
        <span class="c-monitor-hourly-bridge-title-bar"></span>
        <span class="c-monitor-hourly-bridge-title-text">江阴大桥</span>
      </div>
      <!-- 图例 -->
      <div class="c-monitor-hourly-bridge-legend">
        <span
          class="c-monitor-hourly-bridge-legend-item"
          :class="{'is-inactive': !legendBeijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-hourly-bridge-legend-dot c-monitor-hourly-bridge-legend-dot-beijing"></i>
          <span class="c-monitor-hourly-bridge-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-hourly-bridge-legend-item"
          :class="{'is-inactive': !legendShanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-hourly-bridge-legend-dot c-monitor-hourly-bridge-legend-dot-shanghai"></i>
          <span class="c-monitor-hourly-bridge-legend-label">上海方向</span>
        </span>
      </div>
    </div>
    <!-- 图表区域 -->
    <div class="c-monitor-hourly-bridge-body">
      <div ref="chartRef" class="c-monitor-hourly-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 图例状态（用普通 ref，不用含字符 - 的 key）
const legendBeijing = ref(true)
const legendShanghai = ref(true)

const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据 - 江阴大桥小时流量（0-24时）
const bridgeData = {
  hours: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 350, 800, 1500, 2200, 2800, 2600, 2400, 2100, 1800, 1200, 600],
  shanghai: [180, 320, 750, 1400, 2100, 2700, 2500, 2350, 2050, 1750, 1100, 550]
}

const buildOption = () => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(161,206,255,1)',
    borderWidth: 1,
    textStyle: {
      color: '#333333',
      fontSize: 12
    },
    formatter: (params) => {
      const hour = params[0]?.axisValue
      let html = `<div style="font-weight:500;margin-bottom:4px;">${hour}时</div>`
      params.forEach(p => {
        html += `<div style="display:flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
          <span>${p.seriesName}：</span>
          <span style="font-weight:600;">${p.value}</span>
          <span>辆</span>
        </div>`
      })
      return html
    }
  },
  legend: {
    show: false
  },
  grid: {
    top: 8,
    left: 8,
    right: 12,
    bottom: 24,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: bridgeData.hours,
    name: '时',
    nameLocation: 'end',
    nameTextStyle: {
      color: '#666666',
      fontSize: 12
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 12
    },
    axisTick: { show: true },
    axisLine: {
      lineStyle: { color: 'rgba(51,51,51,0.2)' }
    },
    splitLine: { show: false }
  },
  yAxis: {
    type: 'value',
    name: '辆',
    nameLocation: 'start',
    nameTextStyle: {
      color: '#666666',
      fontSize: 12,
      align: 'right'
    },
    min: 0,
    max: 4000,
    interval: 1000,
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 12
    },
    axisTick: { show: true },
    axisLine: { show: false },
    splitLine: {
      lineStyle: {
        color: 'rgba(24,144,255,0.1)',
        type: 'dashed'
      }
    }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      barMaxWidth: 8,
      barGap: '20%',
      data: bridgeData.beijing,
      itemStyle: {
        color: '#1890ff',
        borderRadius: [2, 2, 0, 0]
      },
      markLine: {
        silent: true,
        symbol: 'none',
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
        data: [{ yAxis: 3000 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      barMaxWidth: 8,
      data: bridgeData.shanghai,
      itemStyle: {
        color: '#52c41a',
        borderRadius: [2, 2, 0, 0]
      }
    }
  ]
})

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '北京方向') {
    legendBeijing.value = !legendBeijing.value
  } else {
    legendShanghai.value = !legendShanghai.value
  }
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
      chartObserver = null
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
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-hourly-bridge {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}

.c-monitor-hourly-bridge-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 28px;
  padding: 0 8px;
}

.c-monitor-hourly-bridge-title-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-hourly-bridge-title-bar {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

.c-monitor-hourly-bridge-title-text {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
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
  transition: opacity 0.2s;

  &.is-inactive {
    opacity: 0.4;
  }
}

.c-monitor-hourly-bridge-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.c-monitor-hourly-bridge-legend-dot-beijing {
    background: #1890ff;
  }

  &.c-monitor-hourly-bridge-legend-dot-shanghai {
    background: #52c41a;
  }
}

.c-monitor-hourly-bridge-legend-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
}

.c-monitor-hourly-bridge-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-hourly-bridge-chart {
  width: 100%;
  height: 100%;
  min-height: 100px;
  min-width: 0;
}
</style>