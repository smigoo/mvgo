<template>
  <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-tunnel-flow">
    <!-- 标题区域 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-section-header">
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-with-icon">
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-icon"></span>
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-title-text">江阴靖江长江隧道</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-wrapper">
      <!-- 自定义图例 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-legend">
        <span 
          class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-item" 
          :class="{ 'is-active': legendState.beijing }" 
          @click="toggleLegend('北京方向')"
        >
          <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot-beijing"></i>
          <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-label">北京方向</span>
        </span>
        <span 
          class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-item" 
          :class="{ 'is-active': legendState.shanghai }" 
          @click="toggleLegend('上海方向')"
        >
          <i class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-dot-shanghai"></i>
          <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-legend-label">上海方向</span>
        </span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
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

// Mock 数据：0-24 小时流量
const mockData = {
  hours: Array.from({ length: 25 }, (_, i) => i),
  beijing: [120, 132, 101, 134, 90, 230, 210, 182, 191, 234, 290, 330, 310, 825, 420, 380, 360, 340, 320, 280, 240, 200, 180, 160, 140],
  shanghai: [220, 182, 191, 234, 290, 330, 310, 220, 182, 191, 234, 290, 831, 310, 220, 182, 191, 234, 290, 330, 310, 220, 182, 191, 180]
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
      padding: 12,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].name}时<br/>`
        params.forEach(p => {
          result += `${p.seriesName}: ${p.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      show: false,
      data: ['北京方向', '上海方向']
    },
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      },
      max: 1000
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: 4,
        itemStyle: {
          color: '#1990ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: 4,
        itemStyle: {
          color: '#ff8b00',
          borderRadius: [2, 2, 0, 0]
        }
      }
    ],
    // 添加阈值标注线
    visualMap: {
      show: false,
      pieces: [
        { min: 0, max: 4000 }
      ]
    }
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

.c-monitor-tunnel-flow {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  flex-shrink: 0;
  height: 21px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.c-monitor-title-with-icon {
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
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-chart-legend {
  flex-shrink: 0;
  height: 14px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.3s;

  &:not(.is-active) {
    opacity: 0.4;
  }

  &:hover {
    opacity: 1;
  }
}

.c-monitor-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-monitor-legend-dot-beijing {
  background: #1990ff;
}

.c-monitor-legend-dot-shanghai {
  background: #ff8b00;
}

.c-monitor-legend-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>