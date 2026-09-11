<template>
  <div class="c-monitor-tunnel-chart">
    <!-- 区块标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表区域（带背景图） -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg3})` }">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #1890ff"></i>
          <span class="c-monitor-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot" style="background: #52c41a"></i>
          <span class="c-monitor-legend-label">上海方向</span>
        </span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 引入背景图资源
import bg3 from '../../resources/images/bg-_m-35.png'

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据（24小时）
const mockData = {
  beijing: [120, 200, 150, 180, 220, 250, 270, 300, 350, 380, 320, 290, 310, 340, 360, 350, 330, 310, 280, 250, 220, 180, 150, 130],
  shanghai: [130, 180, 160, 190, 210, 240, 260, 290, 330, 360, 310, 280, 300, 320, 340, 330, 310, 290, 260, 230, 200, 170, 140, 120]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const hour = params[0].axisValue
        let result = `${hour}时<br/>`
        params.forEach(p => {
          result += `${p.seriesName}: ${p.value} 辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false // 使用自定义图例
    },
    grid: {
      left: 50,
      right: 16,
      top: 40,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 400,
      interval: 100,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 10]
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '35%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff9400',
            type: 'dashed',
            width: 1
          },
          label: {
            position: 'end',
            formatter: '建议分流',
            color: '#ff9400',
            fontSize: 12
          },
          data: [
            { yAxis: 300 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        itemStyle: {
          color: '#52c41a',
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '35%'
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

  // 使用 ResizeObserver 等待容器就绪
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

// 监听 chartRef 变化（处理 base-panel 重建 DOM 的情况）
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 窗口大小变化时重绘图表
const handleResize = () => {
  if (chart) {
    chart.resize()
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
@import '../../resources/styles/index.less';

.c-monitor-tunnel-chart {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-body {
  flex: 180 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  padding: 12px;
  border-radius: 4px;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-legend-label {
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  line-height: 18px;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
