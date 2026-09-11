<template>
  <div class="c-mc-max-1788171201725-c1914947-c-env-monitor-chart">
    <div ref="chartRef" class="c-mc-max-1788171201725-c1914947-c-env-monitor-chart-canvas"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
// === 接收父组件传入的激活指标与图表数据 ===
const props = defineProps({ activeTab: { type: String, default: 'co'
  },
  chartData: {
    type: Object,
    default: () => ({
      xAxis: [],
      seriesName: 'zk3+785CO浓度',
      warningValue: 30,
      values: []
    })
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null
// === 构建面积图配置（绿色平滑面积 + 红色虚线预警线 + 内置图例） ===
const buildOption = () => {
  const data = props.chartData || {}
  const seriesName = data.seriesName || 'zk3+785CO浓度'
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e5e5',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.axisValue}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    // 图例位于右上角（对齐设计稿 legendPosition: top-right）
    legend: {
      data: [seriesName],
      right: 0,
      top: 0,
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect',
      textStyle: { color: '#333333', fontSize: 12 }
    },
    grid: { left: 6, right: 10, top: 28, bottom: 6, containLabel: true },
    // X 轴：时间刻度 2~24 时（真实刻度，取自设计稿）
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.xAxis || [],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#d9d9d9' } }
    },
    // Y 轴：数值 0~40，单位标注「辆」（保留设计稿原始文案）
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12 },
      axisLabel: { show: true, color: '#333333', fontSize: 12 },
      axisTick: { show: true },
      splitLine: { lineStyle: { color: '#eef2f6' } }
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: data.values || [],
        lineStyle: { color: '#0fcd7d', width: 1 },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.35)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        // 红色虚线预警线（Y = warningValue，默认 30）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          data: [{ yAxis: data.warningValue || 30 }]
        }
      }
    ]
  }
}
// === 更新图表 ===
const updateChart = () => { if (!chart) return
  chart.setOption(buildOption(), true)
}
// === 初始化图表（处理容器尺寸为 0 的场景） ===
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

// 监听 chartRef（base-panel 重建 slot DOM 场景）
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听数据变化，联动刷新图表
watch(
  () => props.chartData,
  () => {
    updateChart()
  },
  { deep: true }
)

const handleResize = () => { if (chart) chart.resize()
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

.c-env-monitor-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-canvas {
  width: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>