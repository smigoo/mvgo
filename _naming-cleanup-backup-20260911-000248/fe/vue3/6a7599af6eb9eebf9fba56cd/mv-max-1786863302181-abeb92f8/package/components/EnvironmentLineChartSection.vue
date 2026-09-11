<template>
  <section class="line-chart-section">
    <div class="line-chart-slot-title">{{ title }}</div>
    <div class="line-chart-body">
      <div class="line-chart-unit-row">
        <span class="line-chart-unit">辆</span>
        <span class="line-chart-warning-text">预警线</span>
      </div>
      <div class="line-chart-stage">
        <div ref="chartRef" class="line-chart-canvas"></div>
      </div>
      <div class="line-chart-axis-unit">时</div>
      <div class="line-chart-legend-row">
        <span class="line-chart-legend-line"></span>
        <span class="line-chart-legend-name">{{ legendName }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

// 本组件负责还原 Figma 中 @echarts/line 数据可视化区。
// 图表数据、X 轴、预警线和图例名称均来自父组件 props，保留响应式监听以兼容后续 API 绑定刷新。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: '@echarts/line' },
  activeTab: { type: String, default: '一氧化碳' },
  xAxisData: { type: Array, default: () => [] },
  chartData: { type: Array, default: () => [] },
  warningLine: { type: Number, default: 40 },
  legendName: { type: String, default: 'zk3+785CO浓度' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['chart-ready', 'chart-update'])
// #endregion

// #region 3. 响应式状态
const chartRef = ref(null)
const yAxisTicks = ref([40, 30, 20, 10, 0])
const chartLineColor = ref('#0fcd7d')
const warningLineColor = ref('#d32f2f')
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 5. 方法
const getChartOption = () => {
  // 所有 series.data 和 xAxis.data 都读取响应式 props，避免后续 API 注入后图表仍显示旧数据。
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      formatter: (params) => {
        const current = params?.[0]
        if (!current) return ''
        return `${current.axisValue}时<br/>${props.legendName}：${current.data}辆`
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(44, 155, 234, 0.45)',
          width: 1
        }
      }
    },
    legend: {
      show: true,
      bottom: 0,
      left: 34,
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect',
      textStyle: {
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      data: [props.legendName]
    },
    grid: {
      top: 14,
      right: 4,
      bottom: 26,
      left: 34,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.xAxisData,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        lineHeight: 12,
        interval: 0,
        margin: 8
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(15, 205, 125, 0.18)',
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        align: 'right',
        margin: 10,
        formatter: (value) => String(value)
      },
      data: yAxisTicks.value
    },
    series: [
      {
        name: props.legendName,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: props.chartData,
        lineStyle: {
          width: 1,
          color: chartLineColor.value
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.22)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          lineStyle: {
            color: warningLineColor.value,
            width: 1,
            type: 'solid'
          },
          data: [{ yAxis: props.warningLine }]
        }
      }
    ]
  }
}

const renderChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(getChartOption(), true)
  emit('chart-update', { activeTab: props.activeTab })
}

const initChart = () => {
  if (!chartRef.value || chartInstance) return
  chartInstance = echarts.init(chartRef.value)
  renderChart()

  // 监听容器尺寸变化，保证 iframe 或父级 flex 尺寸变化时 canvas 能同步拉伸。
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
  emit('chart-ready', chartInstance)
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 等待 Vue DOM 与父级 flex 布局稳定后再初始化，避免 ECharts 百分比高度被定格为错误尺寸。
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

watch(
  () => [props.activeTab, props.xAxisData, props.chartData, props.warningLine, props.legendName],
  async () => {
    // Tab 或 API 数据变化后延迟到下一帧刷新，确保布局与数据状态都已同步完成。
    await nextTick()
    requestAnimationFrame(() => {
      renderChart()
      chartInstance?.resize()
    })
  },
  { deep: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.line-chart-section {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0 20px 8px 20px;
  color: #333333;
}

.line-chart-slot-title {
  flex: 0 0 auto;
  height: 0;
  overflow: hidden;
  color: transparent;
  font-size: 0;
  line-height: 0;
}

.line-chart-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.line-chart-unit-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: 22px;
  pointer-events: none;
}

.line-chart-unit {
  position: absolute;
  left: 0;
  top: 0;
  width: 12px;
  height: 22px;
  color: #666666;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  text-align: right;
}

.line-chart-warning-text {
  position: absolute;
  right: 0;
  top: 0;
  width: 36px;
  height: 22px;
  color: #d32f2f;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  text-align: right;
}

.line-chart-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.line-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.line-chart-axis-unit {
  position: absolute;
  right: 0;
  bottom: 22px;
  width: 12px;
  height: 12px;
  color: #666666;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 12px;
  text-align: right;
  pointer-events: none;
}

.line-chart-legend-row {
  position: absolute;
  left: 34px;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  height: 14px;
  pointer-events: none;
}

.line-chart-legend-line {
  width: 14px;
  height: 2px;
  flex-shrink: 0;
  border-radius: 1.6px;
  background: #0fcd7d;
}

.line-chart-legend-name {
  height: 14px;
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 9.6px;
  font-weight: 400;
  line-height: 14.4px;
  text-align: left;
  white-space: nowrap;
}</style>