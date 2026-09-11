<template>
<div class="c-env-monitor-chart" >
<div class="c-env-monitor-chart-legend" :class="{ 'c-env-monitor-chart-legend--off': !legendState }" @click="toggleLegend" >
      <span class="c-env-monitor-chart-legend-line"></span>
      <span class="c-env-monitor-chart-legend-text">zk3+785CO浓度</span>
    </div>
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'


// 图表容器引用
const chartRef = ref(null)
// ECharts 实例
let chart = null
// 尺寸监听（容器尺寸为 0 时等待就绪）
let chartObserver = null
// 自定义 DOM 图例状态（与图表系列联动）
const legendState = ref(true)

// 模拟趋势数据（仅描述趋势，非真实业务数值）
const mockSeriesData = [10, 15, 12, 20, 25, 22, 28, 30, 26, 18, 12, 8]

// 构建 ECharts 配置
const getChartOption = () => { return { tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.7)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, textStyle: { color: '#ffffff', fontSize: 12
      }
    },
    grid: {
      left: 8,
      right: 16,
      top: 24,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      name: '时',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLabel: { show: true, color: '#666666', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#666666' } }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: { show: true, color: '#666666', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#666666' } },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#52c41a',
          width: 2
        },
        itemStyle: {
          color: '#52c41a'
        },
        areaStyle: {
          color: '#52c41a',
          opacity: 0.2
        },
        data: mockSeriesData,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 30,
              name: '预警线',
              lineStyle: {
                color: '#f53f3f',
                type: 'dashed',
                width: 2
              },
              label: {
                show: true,
                formatter: '预警线',
                color: '#f53f3f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  }
}

// 更新图表
const updateChart = () => { if (!chart) return
  chart.setOption(getChartOption(), true)
}

// 初始化 ECharts
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
      chartObserver = null
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听 chartRef（base-panel 可能销毁重建 slot DOM）
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 自定义图例点击联动（dispatchAction）
const toggleLegend = () => { if (!chart) return
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: 'zk3+785CO浓度'
  })
  legendState.value = !legendState.value
}

// 窗口尺寸变化
const handleResize = () => { if (chart) { chart.resize()
  }
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

<style lang="less" scoped>
@fontSize: 14px;

@echarts: unset;

@import '../../resources/styles/index.less';

.c-env-monitor-chart {
  width: 100%;
  // 高度由父级 flex 分配：Figma 图表区（@echarts/line）真实高度 113px
  flex: 113 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

.c-env-monitor-chart-legend {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  z-index: 1;

  &.c-env-monitor-chart-legend--off {
    opacity: 0.4;
  }
}

.c-env-monitor-chart-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: #52c41a;
}

.c-env-monitor-chart-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.8571);
  font-weight: 400;
  color: #333333;
  line-height: 14px;
}

.c-env-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 100px;
  min-width: 0;
}
</style>