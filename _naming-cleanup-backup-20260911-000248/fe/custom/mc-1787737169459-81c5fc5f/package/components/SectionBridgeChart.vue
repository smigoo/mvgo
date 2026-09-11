<template>
  <div class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-section">
    <div class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-header">
      <span class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-title">江阴大桥</span>
      <div class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend">
        <span
          class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-dot c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-dot--blue"></i>
          <span>北京方向</span>
        </span>
        <span
          class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-dot c-mc-max-1787736422136-74deb182-c-monitor-bridge-legend-dot--light-blue"></i>
          <span>上海方向</span>
        </span>
      </div>
    </div>

    <div class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-chart-body">
      <div ref="chartRef" class="c-mc-max-1787736422136-74deb182-c-monitor-bridge-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null
let resizeObserver = null

// 图例显示状态（北京方向 / 上海方向）
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 模拟数据：X轴小时（2-24），Y轴辆数（0-4000）
const hours = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [920, 1450, 2100, 2680, 2350, 1800, 1560, 1980, 2450, 2200, 1600, 1100]
const shanghaiData = [680, 920, 1380, 1750, 1620, 1250, 980, 1340, 1680, 1520, 1050, 720]

// 切换图例系列显示
const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表配置
const updateChart = () => {
  if (!chart) return

  const option = {
    // 图表提示框：显示时间点、北京方向辆数、上海方向辆数
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e8eef5',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        const time = params[0]?.name || ''
        const lines = params.map((p) => `${p.seriesName}: ${p.value} 辆`)
        return `${time}时<br/>${lines.join('<br/>')}`
      }
    },
    // 隐藏内置图例，使用自定义 DOM 图例实现联动
    legend: { show: false },
    grid: {
      left: 12,
      right: 16,
      top: 18,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#d8e3ef' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 11, interval: 0 },
      axisPointer: { type: 'shadow' }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 11 },
      splitLine: { lineStyle: { color: '#edf2f7', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 8,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 8,
        itemStyle: {
          color: '#69c0ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#fa8c16',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'end',
            color: '#fa8c16',
            fontSize: 11,
            formatter: '建议分流阈值'
          },
          data: [{ yAxis: 2600 }]
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
    observeResize()
    return
  }

  // 容器尺寸为 0 时，等待其就绪（ResizeObserver 处理 base-panel slot DOM 重建）
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
      observeResize()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听图表容器尺寸变化，自动 resize 图表
const observeResize = () => {
  if (!resizeObserver && chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chart && chart.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
}

const handleWindowResize = () => {
  if (chart) chart.resize()
}

// 处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  chart?.dispose()
  chartObserver?.disconnect()
  resizeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 江阴大桥流量区块：按设计稿高度参与父级纵向比例分配（flex-grow 取设计稿高度 200） */
.c-monitor-bridge-section {
  width: 100%;
  min-width: 0;
  min-height: 160px;
  flex: 200 1 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 区块标题行：标题左对齐，图例靠右 */
.c-monitor-bridge-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 24px;
  margin-bottom: 8px;
}

.c-monitor-bridge-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 自定义图例容器 */
.c-monitor-bridge-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;
}

.c-monitor-bridge-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #666666;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.2s, opacity 0.2s;

  &.active {
    color: #333333;
  }

  &:not(.active) {
    opacity: 0.55;
  }

  &:hover {
    color: #333333;
  }
}

.c-monitor-bridge-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 北京方向图例色点 */
.c-monitor-bridge-legend-dot--blue {
  background-color: #1890ff;
}

/* 上海方向图例色点 */
.c-monitor-bridge-legend-dot--light-blue {
  background-color: #69c0ff;
}

/* 图表主体容器 */
.c-monitor-bridge-chart-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.c-monitor-bridge-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>