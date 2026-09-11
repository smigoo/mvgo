<template>
  <!-- 图表区子组件：含折线面积图、Y轴标签、X轴标签、预警线标注、位置标识 -->
  <div class="chart-section">
    <!-- 图表容器 -->
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region Props
const props = defineProps({ chartData: { type: Object, default: () => ({ xAxisData: [], seriesData: [], yAxisMax: 50, warningLine: 30
    })
  },
  activeTab: { type: Number, default: 0 }
})
// #endregion

// #region 图表实例
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 图表配置
const getChartOption = () => { return { grid: { left: 40, right: 20, top: 40, bottom: 30, containLabel: false
    },
    xAxis: {
      type: 'category',
      data: props.chartData.xAxisData,
      axisLine: { show: false },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        formatter: '{value}' // 显示时刻数字
      }
    },
    yAxis: {
      type: 'value',
      max: props.chartData.yAxisMax,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        formatter: '{value}'
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)',
          type: 'dashed',
          width: 1
        }
      }
    },
    series: [
      {
        type: 'line',
        data: props.chartData.seriesData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        }
      }
    ],
    // 预警线（红色虚线 Y=30）
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: '#d32f2f',
        type: 'dashed',
        width: 1.5
      },
      data: [
        {
          yAxis: props.chartData.warningLine,
          label: {
            show: false
          }
        }
      ]
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(85, 158, 255, 0.3)',
          width: 1
        }
      },
      formatter: (params) => {
        const point = params[0]
        return `${point.name}时<br/>${point.value}`
      }
    }
  }
}
// #endregion

// #region 图表初始化
const initChart = async () => { await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value && !chartInstance) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(getChartOption())

      // 挂载 ResizeObserver 监听容器尺寸变化
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
}
// #endregion

// #region 监听数据变化
// 监听 chartData 变化，刷新图表
watch(
  () => props.chartData,
  () => {
    if (chartInstance) {
      chartInstance.setOption(getChartOption())
    }
  },
  { deep: true }
)

// 监听 activeTab 变化（Tab 切换时重新渲染图表）
watch(
  () => props.activeTab,
  () => {
    if (chartInstance) {
      chartInstance.setOption(getChartOption())
    }
  }
)
// #endregion

// #region 生命周期
onMounted(() => {
  console.log('[ChartSection] 组件挂载，初始化图表')
  initChart()
})

onUnmounted(() => {
  console.log('[ChartSection] 组件卸载，销毁图表实例')
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表区容器：弹性填充剩余空间
.chart-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20px 16px;
  position: relative;
}

// 图表 DOM 容器
.chart-container {
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
  width: 100%;
  height: 100%;
}
</style>