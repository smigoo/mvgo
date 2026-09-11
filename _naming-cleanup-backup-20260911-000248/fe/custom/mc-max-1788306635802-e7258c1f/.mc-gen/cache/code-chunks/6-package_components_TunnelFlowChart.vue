<template>
  <div class="c-monitor-tunnel-flow-chart">
    <!-- 标题区（带装饰图标） -->
    <div class="c-monitor-tunnel-flow-header">
      <span class="c-monitor-tunnel-flow-icon"></span>
      <span class="c-monitor-tunnel-flow-title">江阴靖江长江隧道</span>
    </div>

    <!-- 建议分流提示 -->
    <div class="c-monitor-tunnel-flow-notice">建议分流</div>

    <!-- 图表区域 -->
    <div class="c-monitor-tunnel-flow-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-tunnel-flow-legend">
        <span 
          class="c-monitor-legend-item"
          :class="{ active: legendState.beijing }"
          @click="toggleLegend('北京方向')"
        >
          <i class="c-monitor-legend-dot beijing"></i>
          <span class="c-monitor-legend-text">北京方向</span>
        </span>
        <span 
          class="c-monitor-legend-item"
          :class="{ active: legendState.shanghai }"
          @click="toggleLegend('上海方向')"
        >
          <i class="c-monitor-legend-dot shanghai"></i>
          <span class="c-monitor-legend-text">上海方向</span>
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-tunnel-flow-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态（初始都激活）
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 切换图例（联动图表）
const toggleLegend = (seriesName) => {
  if (!chart) return
  
  // 触发 ECharts 图例切换动作
  chart.dispatchAction({
    type: 'legendToggleSelect',
    name: seriesName
  })
  
  // 更新本地状态（用于样式绑定）
  const key = seriesName === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表配置
const updateChart = () => {
  if (!chart) return

  const option = {
    // 禁用内置图例（使用自定义 DOM 图例）
    legend: {
      show: false
    },
    // Tooltip 配置（悬浮显示详情）
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
        if (!Array.isArray(params) || params.length === 0) return ''
        const time = params[0].name
        let html = `<div style="padding: 4px 8px;">
          <div style="margin-bottom: 4px; font-weight: 500;">${time}时</div>`
        params.forEach(p => {
          const color = p.seriesName === '北京方向' ? '#1990FF' : '#FA8C16'
          html += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
            <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 2px;"></span>
            <span style="color: #333;">${p.seriesName}</span>
            <span style="margin-left: auto; font-weight: 600; color: #333;">${p.value}</span>
            <span style="color: #666;">辆</span>
          </div>`
        })
        html += '</div>'
        return html
      }
    },
    // 网格配置（确保坐标轴标签不溢出）
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 35,
      containLabel: true
    },
    // X 轴配置（时间刻度，从 Figma 真实数据提取）
    xAxis: {
      type: 'category',
      data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      }
    },
    // Y 轴配置（流量数值，从 Figma 真实刻度提取）
    yAxis: {
      type: 'value',
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      min: 0,
      max: 4000,
      interval: 1000,
      axisLine: {
        show: false
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    // 数据系列（双系列柱状图）
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#1990FF',
          borderRadius: [2, 2, 0, 0]
        },
        data: [200, 300, 400, 500, 800, 1200, 1800, 2200, 2800, 3200, 2400, 1800, 1200]
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: '#FA8C16',
          borderRadius: [2, 2, 0, 0]
        },
        data: [180, 280, 380, 480, 750, 1150, 1750, 2150, 2750, 3100, 2300, 1700, 1150]
      }
    ],
    // 标记线（建议分流阈值）
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: '#FF984E',
        type: 'dashed',
        width: 1
      },
      label: {
        show: false
      },
      data: [
        { yAxis: 3000 }
      ]
    }
  }

  chart.setOption(option, true)
}

// 初始化图表（等待容器就绪）
const initChart = () => {
  if (!chartRef.value) return

  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }

  // 容器尺寸为 0 时，使用 ResizeObserver 等待就绪
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

// 监听 chartRef（处理 base-panel 销毁重建 DOM）
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 响应式调整
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
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tunnel-flow-chart {
  width: 100%;
  display: flex;
  flex-direction: column;
  background-image: url('../resources/images/bg-_m-35.png');
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  padding: 12px 16px;
  box-sizing: border-box;
}

.c-monitor-tunnel-flow-header {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
}

.c-monitor-tunnel-flow-icon {
  display: inline-block;
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388DFF 0%, #388DFF 100%);
  border-radius: 6px;
  flex-shrink: 0;
}

.c-monitor-tunnel-flow-title {
  font-size: 14px;
  line-height: 21px;
  color: #333333;
  font-weight: 400;
}

.c-monitor-tunnel-flow-notice {
  font-size: 12px;
  line-height: 21.6px;
  color: #FF984E;
  font-weight: 400;
  margin-bottom: 8px;
}

.c-monitor-tunnel-flow-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-tunnel-flow-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
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
}

.c-monitor-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;

  &.beijing {
    background: #1990FF;
  }

  &.shanghai {
    background: #FA8C16;
  }
}

.c-monitor-legend-text {
  font-size: 12px;
  line-height: 18px;
  color: #333333;
}

.c-monitor-tunnel-flow-chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>