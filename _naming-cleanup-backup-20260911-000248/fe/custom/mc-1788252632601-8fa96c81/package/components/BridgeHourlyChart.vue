<template>
  <div class="c-monitor-bridge-hourly">
    <!-- 区块标题 -->
    <div class="c-monitor-bridge-header">
      <div class="c-monitor-bridge-title"><img :src="icon3" class="auto-mounted-icon" alt="icon" />
        <span class="c-monitor-bridge-icon"></span>
        <span class="c-monitor-bridge-title-text">江阴大桥</span>
      </div>
    </div>

    <!-- 图表主体（背景图通过 :style 绑定） -->
<div class="c-monitor-bridge-chart-body" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }" >
      <!-- 自定义图例 -->
      <div class="c-monitor-bridge-legend">
<span class="c-monitor-bridge-legend-item" :class="{ active: legendState.beijing }" @click="toggleLegend('北京方向')"  :style="legendState.beijing ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
          <i class="c-monitor-bridge-legend-dot c-monitor-bridge-legend-dot-blue"></i>
          <span class="c-monitor-bridge-legend-text">北京方向</span>
        </span>
<span class="c-monitor-bridge-legend-item" :class="{ active: legendState.shanghai }" @click="toggleLegend('上海方向')" >
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
import icon3 from '../../resources/images/icon-3573.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg5 from '../../resources/images/bg-3525.png'


import * as echarts from 'echarts'

// 背景图资源（由父组件通过 props 传入或在此声明）

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({ beijing: true, shanghai: true })

// 模拟数据（实际应从 API 获取）
const chartData = ref({ hours: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'], beijing: [200, 180, 220, 350, 580, 620, 720, 825, 680, 520, 380, 280], shanghai: [180, 160, 200, 320, 560, 600, 700, 831, 660, 500, 360, 260], threshold: 3000
})

// 切换图例
const toggleLegend = (name) => { if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => { if (!chart) return
  
const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: 'rgba(161, 206, 255, 1)', borderWidth: 1, textStyle: { color: '#333333', fontSize: 12
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
const initChart = () => { if (!chartRef.value) return
  
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
const handleResize = () => { if (chart) chart.resize()
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

.c-monitor-bridge-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
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
  font-size: @fontSize;
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
  font-size: calc(@fontSize * 0.8571);
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