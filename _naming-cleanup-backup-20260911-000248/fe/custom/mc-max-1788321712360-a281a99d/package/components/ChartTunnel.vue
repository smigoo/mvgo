<template>
  <div class="c-monitor-chart-tunnel">
    <!-- 区域标题 -->
    <div class="c-monitor-chart-tunnel-header">
      <!-- 标题背景装饰 -->
      <div class="c-monitor-chart-tunnel-header-bg" :style="{ backgroundImage: 'url(' + bg3 + ')' }"></div>
      <div class="c-monitor-chart-tunnel-header-decor" :style="{ backgroundImage: 'url(' + bg5 + ')' }"></div>
      
      <img :src="icon1" class="c-monitor-chart-tunnel-header-icon" alt="icon" />
      <span class="c-monitor-chart-tunnel-header-title">江阴靖江长江隧道</span>
    </div>

    <!-- 图表内容区 -->
    <div class="c-monitor-chart-tunnel-body">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-tunnel-legend">
        <div 
          class="c-monitor-chart-tunnel-legend-item" 
          :class="{'is-active': legendState.beijing }"
          @click="toggleLegend('北京方向', 'beijing')"
        >
          <span class="c-monitor-chart-tunnel-legend-dot" style="background: #3b82f6;"></span>
          <span class="c-monitor-chart-tunnel-legend-text">北京方向</span>
        </div>
        <div 
          class="c-monitor-chart-tunnel-legend-item" 
          :class="{'is-active': legendState.shanghai }"
          @click="toggleLegend('上海方向', 'shanghai')"
        >
          <span class="c-monitor-chart-tunnel-legend-dot" style="background: #7dd3fc;"></span>
          <span class="c-monitor-chart-tunnel-legend-text">上海方向</span>
        </div>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="c-monitor-chart-tunnel-chart"></div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import icon1 from '../../resources/images/icon-3561.png'
const bg5 = bg3


import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 切换图例
const toggleLegend = (name, key) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value[key] = !legendState.value[key]
}

// Mock 数据
const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const beijingData = [600, 400, 200, 600, 800, 1200, 1800, 2400, 3200, 2800, 1600, 800]
const shanghaiData = [400, 600, 400, 800, 1000, 1400, 2000, 2600, 3000, 2400, 1200, 600]

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
      extraCssText: 'box-shadow: 4px 4px 4px rgba(0, 28, 53, 0.2); border-radius: 4px;',
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="display:inline-block;width:6px;height:6px;background:${p.color};border-radius:1px;"></span>
            <span>${p.seriesName}</span>
            <span style="margin-left:auto;font-weight:500;">${p.value} 辆</span>
          </div>`
        })
        return res
      }
    },
    legend: {
      show: false // 使用自定义 DOM 图例
    },
    grid: {
      left: 10,
      right: 20,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, -10]
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true
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
        fontSize: 12,
        align: 'right'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
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
        data: beijingData,
        barWidth: 4,
        barGap: '50%',
        itemStyle: {
          color: '#3b82f6',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: {
            color: '#ff984e',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 12,
            distance: 4
          },
          data: [
            { yAxis: 2500 }
          ]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        itemStyle: {
          color: '#7dd3fc',
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

// 窗口 resize
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

.c-monitor-chart-tunnel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  // 注意：不在此处定义 flex 属性，由父组件和 common.less 统一控制高度比例

  &-header {
    flex-shrink: 0;
    height: 24px;
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
    margin-bottom: 8px;

    &-bg {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 118px;
      height: 21px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      pointer-events: none;
    }

    &-decor {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 12px;
      background-size: 100% 100%;
      background-repeat: no-repeat;
      pointer-events: none;
    }

    &-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      position: relative;
      z-index: 1;
    }

    &-title {
      font-size: calc(var(--fontSize, 14px) * 1);
      font-weight: 400;
      color: #333333;
      line-height: 21px;
      position: relative;
      z-index: 1;
    }
  }

  &-body {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  &-legend {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;

    &-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: opacity 0.2s;

      &.is-active {
        opacity: 1;
      }

      &:not(.is-active) {
        opacity: 0.4;
      }
    }

    &-dot {
      width: 10px;
      height: 10px;
      border-radius: 1.6px;
      flex-shrink: 0;
    }

    &-text {
      font-size: calc(var(--fontSize, 14px) * 0.857);
      color: #333333;
      line-height: 18px;
      white-space: nowrap;
    }
  }

  &-chart {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
}
</style>