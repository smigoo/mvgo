<template>
  <div class="c-monitor-tunnel-hourly-chart">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表容器 -->
    <div class="c-monitor-chart-body" :style="chartBodyStyle">
      <div ref="chartRef" class="c-monitor-chart-container"></div>

      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-monitor-legend-dot c-monitor-legend-dot-beijing"></i>
          <span class="c-monitor-legend-label">北京方向</span>
        </span>
        <span
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot c-monitor-legend-dot-shanghai"></i>
          <span class="c-monitor-legend-label">上海方向</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-_m-36.png'
import bg3 from '../../resources/images/bg-3475.png'


import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表背景样式（使用 bg3 资源）
const chartBodyStyle = computed(() => ({
  backgroundImage: `url(${bg3})`,
  backgroundSize: '100% auto',
  backgroundPosition: 'center top',
  backgroundRepeat: 'no-repeat'
}))

// 模拟数据
const chartData = ref({
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 180, 220, 300, 450, 600, 800, 825, 700, 500, 400, 300, 250],
  shanghai: [180, 160, 200, 280, 420, 580, 780, 831, 680, 480, 380, 280, 230]
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
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.5)',
          width: 1
        }
      },
      formatter: (params) => {
        let html = `<div style="padding: 4px 8px;">
          <div style="font-weight: 600; margin-bottom: 4px;">${params[0].axisValue}时</div>`
        params.forEach(item => {
          html += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${item.color};"></span>
            <span style="font-size: calc(@fontSize * 0.7143);">${item.seriesName}</span>
            <span style="font-weight: 600; margin-left: auto; font-size: calc(@fontSize * 0.8571);">${item.value}</span>
            <span style="font-size: calc(@fontSize * 0.7143); color: #666;">辆</span>
          </div>`
        })
        html += '</div>'
        return html
      }
    },
    xAxis: {
      type: 'category',
      data: chartData.value.hours,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.3)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.3)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1000,
      interval: 200,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.3)'
        }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 10
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.15)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        barWidth: 8,
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 600,
              name: '建议分流',
              lineStyle: {
                color: 'rgba(255, 152, 78, 1)',
                type: 'dashed',
                width: 2
              },
              label: {
                show: true,
                position: 'end',
                formatter: '建议分流',
                color: '#ff984e',
                fontSize: 12
              }
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        barWidth: 8,
        itemStyle: {
          color: 'rgba(255, 127, 80, 1)',
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

// 处理窗口大小变化
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
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-tunnel-hourly-chart {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: @fontSize;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-body {
  flex: 150 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
  padding: 12px 16px;
  box-sizing: border-box;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-monitor-chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
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
    opacity: 0.5;
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-beijing {
  background: rgba(25, 144, 255, 1);
}

.c-monitor-legend-dot-shanghai {
  background: rgba(255, 127, 80, 1);
}

.c-monitor-legend-label {
  font-size: calc(@fontSize * 0.8571);
  font-weight: 400;
  color: #333333;
  line-height: 18px;
}
</style>