<template>
  <div class="c-monitor-bridge-hourly">
    <!-- 区块标题 -->
    <div class="c-monitor-bridge-header">
      <div class="c-monitor-bridge-title">
        <span class="c-monitor-bridge-icon"></span>
        <span class="c-monitor-bridge-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表主体（背景图通过 :style 绑定） -->
    <div 
      class="c-monitor-bridge-chart-body" 
      :style="{ 
        backgroundImage: `url(${bg5})`,
        backgroundSize: '100% auto',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <!-- 自定义图例 -->
      <div class="c-monitor-bridge-legend">
        <span 
          class="c-monitor-bridge-legend-item" 
          :class="{ active: legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-bridge-legend-dot c-monitor-bridge-legend-dot-blue"></i>
          <span class="c-monitor-bridge-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-bridge-legend-item" 
          :class="{ active: legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-bridge-legend-dot c-monitor-bridge-legend-dot-green"></i>
          <span class="c-monitor-bridge-legend-text">上海方向</span>
        </span>
      </div>

      <!-- ECharts 图表容器 -->
      <div ref="chartRef" class="c-monitor-bridge-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 背景图资源（由父组件通过 props 传入或在此声明）
const bg5 = 'data:image/png;base64,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'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 模拟数据（实际应从 API 获取）
const chartData = ref({
  hours: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 180, 220, 350, 580, 620, 720, 825, 680, 520, 380, 280],
  shanghai: [180, 160, 200, 320, 560, 600, 700, 831, 660, 500, 360, 260],
  threshold: 3000
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
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(item => {
          result += `${item.marker}${item.seriesName}: ${item.value} 辆<br/>`
        })
        return result
      }
    },
    grid: {
      left: 50,
      right: 30,
      top: 40,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
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
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
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
          type: 'solid'
        }
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff9400',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff9400',
            fontSize: 12
          },
          data: [
            {
              yAxis: chartData.value.threshold,
              name: '建议分流'
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#52c41a',
          borderRadius: [2, 2, 0, 0]
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
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-bridge-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-bridge-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-bridge-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-bridge-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-bridge-title-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-bridge-chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.c-monitor-bridge-legend {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  padding: 0 16px 8px 0;
}

.c-monitor-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.3s;

  &.active {
    opacity: 1;
  }

  &:hover {
    opacity: 0.85;
  }
}

.c-monitor-bridge-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;
  flex-shrink: 0;

  &.c-monitor-bridge-legend-dot-blue {
    background: #1890ff;
  }

  &.c-monitor-bridge-legend-dot-green {
    background: #52c41a;
  }
}

.c-monitor-bridge-legend-text {
  font-size: 12px;
  line-height: 18px;
  color: #333333;
}

.c-monitor-bridge-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>
