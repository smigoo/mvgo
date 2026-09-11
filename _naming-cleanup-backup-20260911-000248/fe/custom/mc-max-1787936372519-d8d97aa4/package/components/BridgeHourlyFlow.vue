<template>
  <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-section c-mc-max-1787936372519-d8d97aa4-c-monitor-bridge-hourly">
    <!-- 区域标题 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-section-header">
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-wrapper">
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-icon"></span>
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend">
        <span
          class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
         :style="legendState.beijing ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot-beijing"></i>
          <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-label">北京方向</span>
        </span>
        <span
          class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot-shanghai"></i>
          <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-label">上海方向</span>
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// Mock 数据
const mockData = {
  hours: Array.from({ length: 12 }, (_, i) => (i + 1) * 2),
  beijing: [450, 520, 380, 620, 580, 490, 710, 825, 650, 560, 480, 420],
  shanghai: [420, 490, 360, 590, 550, 470, 680, 831, 620, 540, 460, 400]
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name
  })
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
      borderRadius: 4,
      padding: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const hour = params[0].name
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">${hour}时</div>`
        params.forEach(p => {
          html += `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${p.color};"></span>
              <span style="flex: 1;">${p.seriesName}</span>
              <span style="font-weight: 600;">${p.value}</span>
              <span style="color: #666; font-size: 10px;">辆</span>
            </div>
          `
        })
        return html
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      max: 1000,
      interval: 200,
      axisLabel: {
        color: '#333333',
        fontSize: 10,
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
          color: 'rgba(0, 0, 0, 0.08)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)',
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: 'rgba(25, 144, 255, 0.8)'
          }
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 4,
        itemStyle: {
          color: 'rgba(255, 139, 0, 1)',
          borderRadius: [2, 2, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: 'rgba(255, 139, 0, 0.8)'
          }
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
  if (newRef && !chart) {
    initChart()
  }
})

// 窗口 resize 处理
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

.c-monitor-bridge-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 3px;
}

.c-monitor-title-icon {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.3s;
  
  &.active {
    opacity: 1;
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
  background: rgba(255, 139, 0, 1);
}

.c-monitor-legend-label {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
}

.c-monitor-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>