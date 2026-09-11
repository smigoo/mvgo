<template>
  <div class="c-monitor-bridge-root">
    <!-- 标题栏：图标 + 标题（左） + 图例（右） -->
    <div class="c-monitor-bridge-header">
      <span class="c-monitor-bridge-title-icon"></span>
      <span class="c-monitor-bridge-title">江阴大桥</span>
      <div class="c-monitor-bridge-legend">
        <span
          class="c-monitor-bridge-legend-item"
          :class="{ 'is-inactive': !legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-bridge-dot c-monitor-bridge-dot-beijing"></i>北京方向
        </span>
        <span
          class="c-monitor-bridge-legend-item"
          :class="{ 'is-inactive': !legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-bridge-dot c-monitor-bridge-dot-shanghai"></i>上海方向
        </span>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="c-monitor-bridge-chart-wrap">
      <div ref="chartRef" class="c-monitor-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Object,
    default: () => ({})
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// X 轴（0-24 小时）
const hours = Array.from({ length: 25 }, (_, i) => String(i))

// 默认 mock 数据（16 时：北京方向 825，上海方向 831，来自设计稿 tooltip）
const defaultBeijing = [
  120, 90, 60, 50, 70, 180, 420, 760, 980, 860, 720, 680,
  740, 690, 650, 710, 825, 900, 780, 620, 480, 360, 240, 160, 110
]
const defaultShanghai = [
  110, 85, 55, 48, 66, 170, 400, 730, 950, 830, 700, 660,
  720, 670, 640, 700, 831, 910, 790, 630, 470, 350, 230, 150, 105
]

// 数据优先取 props.chartData，否则用 mock
const beijingData = computed(() =>
  Array.isArray(props.chartData?.beijing) && props.chartData.beijing.length
    ? props.chartData.beijing
    : defaultBeijing
)
const shanghaiData = computed(() =>
  Array.isArray(props.chartData?.shanghai) && props.chartData.shanghai.length
    ? props.chartData.shanghai
    : defaultShanghai
)

// 切换图例（与图表联动）
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '北京方向') {
    legendState.value.beijing = !legendState.value.beijing
  } else {
    legendState.value.shanghai = !legendState.value.shanghai
  }
}

const buildOption = () => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(161, 206, 255, 1)',
    borderWidth: 1,
    padding: [8, 12],
    extraCssText: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); border-radius: 4px;',
    textStyle: { color: '#333333', fontSize: 12 },
    axisPointer: { type: 'shadow' },
    formatter: (params) => {
      if (!params || !params.length) return ''
      let html = `${params[0].axisValue}时<br/>`
      params.forEach((p) => {
        html += `${p.marker}${p.seriesName} ${p.value}辆<br/>`
      })
      return html
    }
  },
  // 内置 legend 隐藏（使用自定义 DOM 图例），但保留以支持 dispatchAction
  legend: {
    show: false,
    data: ['北京方向', '上海方向']
  },
  grid: {
    left: 8,
    right: 12,
    top: 12,
    bottom: 8,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: hours,
    name: '时',
    nameTextStyle: { color: '#666666', fontSize: 12 },
    axisLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.15)' } },
    axisTick: { show: true, alignWithLabel: true },
    axisLabel: {
      show: true,
      color: 'rgba(0, 0, 0, 0.45)',
      fontSize: 10,
      interval: (index) => Number(hours[index]) % 2 === 0
    }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 4000,
    interval: 1000,
    axisLabel: { show: true, color: 'rgba(0, 0, 0, 0.45)', fontSize: 10 },
    axisTick: { show: true },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      barGap: '10%',
      barWidth: '32%',
      itemStyle: { color: 'rgba(24, 144, 255, 1)', borderRadius: [2, 2, 0, 0] },
      data: beijingData.value,
      // 橙色虚线：建议分流警戒线（仅挂一条系列上避免重复）
      markLine: {
        silent: true,
        symbol: 'none',
        label: {
          formatter: '建议分流',
          color: '#ff984e',
          fontSize: 12,
          position: 'insideEndTop'
        },
        lineStyle: { type: 'dashed', color: '#ff984e', width: 1 },
        data: [{ yAxis: 3000 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      barWidth: '32%',
      itemStyle: { color: 'rgba(82, 196, 26, 1)', borderRadius: [2, 2, 0, 0] },
      data: shanghaiData.value
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

// 数据变化时刷新图表
watch(
  () => props.chartData,
  () => updateChart(),
  { deep: true }
)

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

.c-monitor-bridge-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-bridge-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 4px;
}

// 标题前的蓝色圆角小竖条（Figma: 3x12, 渐变 #388dff, cornerRadius 6px）
.c-monitor-bridge-title-icon {
  flex-shrink: 0;
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
}

.c-monitor-bridge-title {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-bridge-legend {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-monitor-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 18px;
  color: #333333;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: opacity 0.2s;

  &.is-inactive {
    opacity: 0.35;
  }
}

.c-monitor-bridge-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.c-monitor-bridge-dot-beijing {
  background: rgba(24, 144, 255, 1);
}

.c-monitor-bridge-dot-shanghai {
  background: rgba(82, 196, 26, 1);
}

.c-monitor-bridge-chart-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-bridge-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
