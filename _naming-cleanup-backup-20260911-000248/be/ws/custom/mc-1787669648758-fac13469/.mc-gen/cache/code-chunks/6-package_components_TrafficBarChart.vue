<template>
  <div class="c-monitor-traffic-bar">
    <!-- 标题行：图标 + 标题 + 图例 -->
    <div class="c-monitor-traffic-bar-header">
      <div class="c-monitor-traffic-bar-title-area">
        <span class="c-monitor-traffic-bar-title-icon"></span>
        <span class="c-monitor-traffic-bar-title-text">{{ sectionName }}</span>
      </div>
      <div class="c-monitor-traffic-bar-legend">
        <span
          class="c-monitor-traffic-bar-legend-item"
          :class="{ inactive: !legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-traffic-bar-legend-dot beijing"></i>
          <span>北京方向</span>
        </span>
        <span
          class="c-monitor-traffic-bar-legend-item"
          :class="{ inactive: !legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-traffic-bar-legend-dot shanghai"></i>
          <span>上海方向</span>
        </span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-traffic-bar-chart-wrapper">
      <div ref="chartRef" class="c-monitor-traffic-bar-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 组件 props
const props = defineProps({
  sectionName: {
    type: String,
    default: ''
  }
})

// 图表相关状态
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态（用于自定义图例联动）
const legendState = ref({
  beijing: true,
  shanghai: true
})

// X 轴小时标签（2-24小时，每2小时一个点）
const hourLabels = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 不同地点的流量数据（mock 数据，仅用于演示）
const dataMap = {
  '江阴靖江长江隧道': {
    beijing: [980, 1620, 1450, 2860, 3240, 2580, 3010, 825, 2430, 2050, 1580, 1320],
    shanghai: [820, 1380, 1690, 2650, 2980, 2750, 3120, 831, 2260, 1890, 1490, 1210]
  },
  '江阴大桥': {
    beijing: [1250, 2050, 1880, 3420, 3680, 3020, 3350, 1180, 2780, 2350, 1920, 1650],
    shanghai: [1050, 1790, 2080, 3150, 3540, 3220, 3580, 1240, 2680, 2280, 1850, 1520]
  }
}

// 获取当前图表数据
const getChartData = () => {
  const name = props.sectionName || '江阴靖江长江隧道'
  return dataMap[name] || dataMap['江阴靖江长江隧道']
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '北京方向') {
    legendState.value.beijing = !legendState.value.beijing
  } else if (name === '上海方向') {
    legendState.value.shanghai = !legendState.value.shanghai
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = getChartData()

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const timeLabel = `${params[0].name}时`
        let html = `<div style="font-weight: 600; margin-bottom: 4px;">${timeLabel}</div>`
        params.forEach((item) => {
          const color = item.color || '#1890ff'
          html += `<div style="display: flex; align-items: center; gap: 6px; margin: 3px 0;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: ${color};"></span>
            <span>${item.seriesName}</span>
            <span style="font-weight: 700; margin-left: auto;">${item.value}</span>
            <span>辆</span>
          </div>`
        })
        return html
      }
    },
    grid: {
      left: 48,
      right: 20,
      top: 26,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hourLabels,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 4]
      },
      axisLabel: {
        color: '#666666',
        fontSize: 11,
        interval: 0
      },
      axisLine: {
        lineStyle: { color: '#c8d6e5' }
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 4, 0]
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: { color: '#e8eef5', type: 'solid' }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: data.beijing,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [3, 3, 0, 0]
        },
        barWidth: 8,
        emphasis: {
          itemStyle: { color: '#40a9ff' }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#ff984e',
            width: 1.5
          },
          label: {
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 11,
            position: 'insideEndTop'
          },
          data: [
            { yAxis: 3200 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: data.shanghai,
        itemStyle: {
          color: '#69c0ff',
          borderRadius: [3, 3, 0, 0]
        },
        barWidth: 8,
        emphasis: {
          itemStyle: { color: '#8fd0ff' }
        }
      }
    ]
  }

  chart.setOption(option, true)
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
    const firstEntry = entries[0]
    if (!firstEntry) return
    const { width, height } = firstEntry.contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chartObserver = null
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听 chartRef 变化
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 监听 sectionName 变化，更新图表数据
watch(
  () => props.sectionName,
  () => {
    updateChart()
  }
)

// 窗口 resize 处理
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
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-traffic-bar {
  width: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* 标题行 */
.c-monitor-traffic-bar-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  height: 24px;
  margin-bottom: 4px;
}

.c-monitor-traffic-bar-title-area {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

/* 标题图标 - 蓝色渐变竖条 */
.c-monitor-traffic-bar-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
  margin-right: 6px;
}

.c-monitor-traffic-bar-title-text {
  font-family: 'Source Han Sans CN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: left;
  color: #333333;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 图例 */
.c-monitor-traffic-bar-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  flex-shrink: 0;
}

.c-monitor-traffic-bar-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: 'Source Han Sans CN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  color: #333333;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.75;
  }

  &.inactive {
    opacity: 0.35;
  }
}

.c-monitor-traffic-bar-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background: #1890ff;
  }

  &.shanghai {
    background: #69c0ff;
  }
}

/* 图表容器 */
.c-monitor-traffic-bar-chart-wrapper {
  flex: 1;
  min-height: 100px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.c-monitor-traffic-bar-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>