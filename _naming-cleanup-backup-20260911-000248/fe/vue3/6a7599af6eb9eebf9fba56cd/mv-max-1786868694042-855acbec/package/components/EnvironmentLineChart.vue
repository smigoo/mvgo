<template>
  <section class="environment-chart-root" :aria-label="title">
    <div class="environment-chart-title">{{ title }}</div>

    <div class="environment-chart-content">
      <div class="chart-unit">{{ unit }}</div>
      <div class="chart-warning-label">预警线</div>
      <div ref="chartRef" class="chart-canvas"></div>
    </div>

    <div class="chart-bottom-row">
      <span class="chart-x-unit">时</span>
      <div class="chart-custom-legend">
        <span class="chart-legend-line"></span>
        <span class="chart-legend-text">{{ legendName }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

// 本组件负责还原 Figma 中的 @echarts/line 区域：包含折线图、预警线、单位文案与底部图例。
// 图表数据由父组件通过 props 传入，未来可被 API 绑定系统替换，因此所有绘图数据都从响应式来源读取。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: '@echarts/line' },
  activeTab: { type: String, default: '一氧化碳' },
  xAxisData: { type: Array, default: () => [] },
  seriesData: { type: Array, default: () => [] },
  warningLine: { type: Number, default: 30 },
  unit: { type: String, default: '辆' },
  legendName: { type: String, default: 'zk3+785CO浓度' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['chart-ready'])
// #endregion

// #region 3. 响应式状态
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 方法
const buildChartOption = () => {
  // 所有 series/xAxis 数据均从 props 读取，避免写死在 option 中导致 API 数据无法驱动图表。
  return {
    animation: false,
    color: ['#0fcd7d'],
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(15, 205, 125, 0.35)',
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const current = Array.isArray(params) ? params[0] : params
        if (!current) return ''
        return `${current.axisValue}时<br/>${props.legendName}: ${current.value}${props.unit}`
      }
    },
    legend: {
      show: true,
      bottom: 0,
      left: 'center',
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect',
      data: [props.legendName],
      textStyle: {
        color: '#333333',
        fontFamily: 'Source Han Sans CN, Arial, sans-serif',
        fontSize: 9.6,
        lineHeight: 14
      }
    },
    grid: {
      top: 15,
      right: 7,
      bottom: 28,
      left: 34,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.xAxisData,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: 12,
        lineHeight: 12,
        margin: 8
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: 12,
        lineHeight: 16.8,
        margin: 8
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(44, 155, 234, 0.18)',
          width: 1,
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: props.legendName,
        type: 'line',
        data: props.seriesData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: '#0fcd7d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.24)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: {
            show: false
          },
          lineStyle: {
            color: '#d32f2f',
            width: 1,
            type: 'dashed'
          },
          data: [{ yAxis: props.warningLine }]
        }
      }
    ]
  }
}

const renderChart = () => {
  // 图表实例存在时只更新配置，避免 Tab 切换频繁销毁 canvas 造成闪烁。
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), true)
  chartInstance.resize()
}

const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  renderChart()
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
  emit('chart-ready', chartInstance)
}
// #endregion

// #region 5. 生命周期与监听
onMounted(async () => {
  // 等待 flex 百分比高度计算完成后再初始化 ECharts，避免 canvas 锁定在错误尺寸。
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

watch(
  () => [props.activeTab, props.xAxisData, props.seriesData, props.warningLine, props.legendName],
  async () => {
    // 父组件切换指标或接口数据刷新时，下一帧更新图表以保证容器尺寸已经稳定。
    await nextTick()
    renderChart()
  },
  { deep: true }
)

onUnmounted(() => {
  // 清理 ResizeObserver 与 ECharts 实例，避免组件销毁后仍持有 DOM 引用。
  resizeObserver?.disconnect()
  resizeObserver = null
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.environment-chart-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.environment-chart-title {
  /* headerSlots 中的图表标题必须落为真实 DOM；设计稿中不占明显视觉位置，因此做极小化处理避免干扰图表。 */
  flex: 0 0 auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.environment-chart-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.chart-canvas {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.chart-unit {
  position: absolute;
  top: 2px;
  left: 1px;
  z-index: 2;
  width: 12px;
  height: 22px;
  color: #666666;
  font-family: 'Source Han Sans CN', Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  text-align: right;
  pointer-events: none;
}

.chart-warning-label {
  position: absolute;
  top: 12px;
  right: 0;
  z-index: 2;
  width: 36px;
  height: 22px;
  color: #d32f2f;
  font-family: 'Source Han Sans CN', Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  text-align: right;
  pointer-events: none;
}

.chart-bottom-row {
  flex: 0 0 14px;
  min-height: 0;
  position: relative;
  box-sizing: border-box;
}

.chart-x-unit {
  position: absolute;
  right: 0;
  bottom: 1px;
  width: 12px;
  height: 12px;
  color: #666666;
  font-family: 'Source Han Sans CN', Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 12px;
  text-align: right;
}

.chart-custom-legend {
  position: absolute;
  left: 50%;
  bottom: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 89px;
  height: 14px;
  transform: translateX(-50%);
  color: #333333;
  font-family: 'Source Han Sans CN', Arial, sans-serif;
  font-size: 9.6px;
  font-weight: 400;
  line-height: 14.4px;
  white-space: nowrap;
}

.chart-legend-line {
  flex: 0 0 14px;
  width: 14px;
  height: 2px;
  border-radius: 1.6px;
  background: #0fcd7d;
}

.chart-legend-text {
  flex: 0 0 auto;
  color: #333333;
}</style>