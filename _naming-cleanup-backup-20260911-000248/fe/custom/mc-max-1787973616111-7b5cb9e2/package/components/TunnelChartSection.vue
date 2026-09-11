<template>
  <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-tunnel-chart-section">
    <!-- 区域标题 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-header">
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title-wrapper">
        <img :src="icon1" class="c-monitor-section-icon" />
        <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-section-title">江阴靖江长江隧道</span>
      </div>
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-legend">
        <div
          class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-dot" style="background: #1890ff"></span>
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-text">北京方向</span>
        </div>
        <div
          class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-dot" style="background: #52c41a"></span>
          <span class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-legend-text">上海方向</span>
        </div>
      </div>
    </div>
    <!-- 图表容器 -->
    <div class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-wrapper">
      <div ref="chartRef" class="c-mc-max-1787973616111-7b5cb9e2-c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import bg5 from '../../resources/images/bg-3525.png'
import icon1 from '../../resources/images/icon-3561.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartData: {
    type: Object,
    default: () => ({
      xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      series: [
        { name: '北京方向', data: [] },
        { name: '上海方向', data: [] }
      ]
    })
  },
  activeLocation: {
    type: String,
    default: 'tunnel'
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

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
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(24, 144, 255, 0.08)'
        }
      },
      formatter: (params) => {
        let result = `<div style="font-weight: 500; margin-bottom: 4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          result += `<div style="display: flex; align-items: center; gap: 6px; margin: 2px 0;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>
            <span>${p.seriesName}</span>
            <span style="font-weight: 600; margin-left: auto;">${p.value}辆</span>
          </div>`
        })
        return result
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 12,
      right: 16,
      top: 20,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.chartData.xAxisData,
      name: '时',
      nameTextStyle: {
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 11,
        padding: [0, 0, 0, -10]
      },
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 11
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      axisLabel: {
        show: true,
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 11
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: props.chartData.series[0]?.data || [],
        barWidth: 8,
        barGap: '30%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#1890ff' },
            { offset: 1, color: '#69c0ff' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#096dd9' },
              { offset: 1, color: '#40a9ff' }
            ])
          }
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: props.chartData.series[1]?.data || [],
        barWidth: 8,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#52c41a' },
            { offset: 1, color: '#95de64' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#389e0d' },
              { offset: 1, color: '#73d13d' }
            ])
          }
        }
      },
      {
        name: '建议分流',
        type: 'line',
        data: Array(props.chartData.xAxisData.length).fill(2500),
        lineStyle: {
          color: '#ff7a45',
          width: 1.5,
          type: 'dashed'
        },
        symbol: 'none',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff7a45',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff7a45',
            fontSize: 11
          },
          data: [
            { yAxis: 2500 }
          ]
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
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听数据变化
watch(() => props.chartData, () => {
  updateChart()
}, { deep: true })

// 监听地点切换
watch(() => props.activeLocation, () => {
  updateChart()
})

// 窗口resize处理
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
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tunnel-chart-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 8px 0;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: opacity 0.3s;

  &.active {
    opacity: 1;
  }

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-legend-text {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}
</style>