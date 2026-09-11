<template>
  <div class="c-env-monitor-chart-section">
    <!-- 图例区域 -->
    <div class="c-env-monitor-chart-legend">
      <div class="c-env-monitor-legend-item">
        <span class="c-env-monitor-legend-line"></span>
        <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
      </div>
    </div>
    <!-- 图表容器 -->
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({ activeTab: { type: String, default: 'co'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 各 Tab 对应的模拟数据
const tabDataMap = { co: [2, 3, 2.5, 4, 5, 8, 12, 15, 13, 10, 7, 5], visibility: [800, 750, 700, 680, 720, 800, 850, 900, 880, 820, 760, 800], indoorLight: [200, 210, 220, 230, 240, 260, 280, 270, 250, 230, 210, 200], outdoorLight: [100, 200, 400, 600, 800, 900, 850, 700, 500, 300, 150, 80]
}

const getChartData = (tab) => { return tabDataMap[tab] || tabDataMap['co']
}

const getWarningLineValue = (tab) => { if (tab === 'co') return 30
  return null
}

const buildOption = (tab) => {
  const data = getChartData(tab)
  const warningValue = getWarningLineValue(tab)

const seriesConfig = { name: 'zk3+785CO浓度', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: '#00c853', width: 1.5
    },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(0, 200, 83, 0.4)' },
        { offset: 1, color: 'rgba(0, 200, 83, 0.02)' }
      ])
    },
    data: data
  }

  // 仅 CO tab 添加预警线
  if (warningValue !== null) {
    seriesConfig.markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: '#f53f3f',
        type: 'dashed',
        width: 1.5
      },
      label: {
        show: true,
        position: 'end',
        formatter: '预警线',
        color: '#d32f2f',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      data: [{ yAxis: warningValue }]
    }
  }

  return {
    grid: {
      left: 28,
      right: 48,
      top: 12,
      bottom: 24,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 40, 60, 0.85)',
      borderColor: 'rgba(85, 158, 255, 0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        lineStyle: {
          color: 'rgba(85, 158, 255, 0.5)'
        }
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Roboto'
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'start',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Roboto',
        formatter: '{value}'
      },
      axisLine: { show: false },
      axisTick: { show: true },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.08)',
          type: 'solid'
        }
      }
    },
    series: [seriesConfig]
  }
}

const updateChart = () => { if (!chart) return
  chart.setOption(buildOption(props.activeTab), true)
}

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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(() => props.activeTab, () => {
  updateChart()
})

const handleResize = () => { if (chart) chart.resize()
}

onMounted(() => {
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

.c-env-monitor-chart-section {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px 2px;
}

.c-env-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-env-monitor-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1px;
  flex-shrink: 0;
}

.c-env-monitor-legend-text {
  font-size: calc(var(--fontSize, 14px) * 0.8);
  font-family: 'Source Han Sans CN', sans-serif;
  color: #333333;
  white-space: nowrap;
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 80px;
  min-width: 0;
  width: 100%;
}
</style>