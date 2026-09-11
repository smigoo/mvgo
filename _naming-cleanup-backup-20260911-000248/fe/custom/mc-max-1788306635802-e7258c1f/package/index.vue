<template>
  <div class="c-monitor-tunnel-flow-chart c-mc-max-1788306635802-e7258c1f">
    <!-- 标题栏 -->
    <div class="c-monitor-tunnel-header"><img :src="icon2" class="auto-mounted-icon" alt="icon" />
      <div class="c-monitor-tunnel-title-group">
        <span class="c-monitor-tunnel-icon"></span>
        <span class="c-monitor-tunnel-title">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表主体区域 -->
    <div class="c-monitor-tunnel-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-tunnel-legend">
        <div
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <span class="c-monitor-legend-dot beijing"></span>
          <span class="c-monitor-legend-text">北京方向</span>
        </div>
        <div
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <span class="c-monitor-legend-dot shanghai"></span>
          <span class="c-monitor-legend-text">上海方向</span>
        </div>
      </div>

      <!-- 建议分流提示 -->
      <div class="c-monitor-tunnel-alert">建议分流</div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-tunnel-chart"></div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../resources/images/icon-3561.png'
import bg3 from '../resources/images/bg-3475.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

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

// 图表数据（模拟数据）
const chartData = ref({
  xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijingData: [200, 300, 250, 400, 600, 800, 1200, 1500, 825, 900, 700, 500, 300],
  shanghaiData: [180, 280, 230, 380, 580, 780, 1180, 1480, 831, 880, 680, 480, 280]
})

// 更新图表
const updateChart = () => {
  if (!chart) return

  const option = {
    legend: {
      show: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(161, 206, 255, 0.5)'
        }
      },
      formatter: (params) => {
        let html = `<div style="padding: 4px 8px;">`
        html += `<div style="font-weight: 500; margin-bottom: 4px;">${params[0].axisValue}时</div>`
        params.forEach(item => {
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">`
          html += `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${item.color};"></span>`
          html += `<span>${item.seriesName}</span>`
          html += `<span style="font-weight: 600; margin-left: auto;">${item.value}</span>`
          html += `<span style="opacity: 0.65;">辆</span>`
          html += `</div>`
        })
        html += `</div>`
        return html
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxisData,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 10]
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
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
        fontSize: 12,
        padding: [0, 0, 10, 0]
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijingData,
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: '40%',
        barGap: '10%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#fa8c16',
            type: 'dashed',
            width: 1
          },
          label: {
            show: false
          },
          data: [
            {
              yAxis: 3000
            }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghaiData,
        itemStyle: {
          color: '#fa8c16',
          borderRadius: [2, 2, 0, 0]
        },
        barWidth: '40%'
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

// 窗口大小变化处理
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
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
@import '../resources/styles/index.less';
@import '../../resources/styles/index.less';

.c-monitor-tunnel-flow-chart {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-tunnel-header {
  flex-shrink: 0;
  height: 30px;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-monitor-tunnel-title-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-tunnel-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-tunnel-title {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-tunnel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.c-monitor-tunnel-legend {
  position: absolute;
  top: 8px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
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

  &.beijing {
    background: #1990ff;
  }

  &.shanghai {
    background: #fa8c16;
  }
}

.c-monitor-legend-text {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  line-height: 18px;
}

.c-monitor-tunnel-alert {
  position: absolute;
  top: 8px;
  left: 60px;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #ff984e;
  line-height: 22px;
  z-index: 10;
}

.c-monitor-tunnel-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>