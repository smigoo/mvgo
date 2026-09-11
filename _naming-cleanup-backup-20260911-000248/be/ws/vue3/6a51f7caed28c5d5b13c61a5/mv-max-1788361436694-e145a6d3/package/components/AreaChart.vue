<template>
  <!-- 面积图组件：ECharts渲染CO浓度趋势面积图，含Y轴单位标注 -->
  <div class="area-chart-root">
    <!-- Y轴单位标注（Figma：辆/时 标注在图表外侧左上角） -->
    <div class="area-chart-yaxis-unit">辆</div>

    <!-- ECharts容器：flex:1 填充剩余空间，min-height:0 防撑破 -->
    <div class="area-chart-wrapper">
      <div ref="chartRef" class="area-chart-canvas"></div>
    </div>

    <!-- X轴单位标注（Figma：时，位于X轴右下角） -->
    <div class="area-chart-xaxis-unit">时</div>
  </div>
</template>

<script setup>
// 面积图子组件：ECharts渲染CO浓度24小时趋势面积图
// X轴为时间刻度(2-24时，间隔2)，Y轴为浓度值(0-50，间隔10)
// 含红色虚线预警阈值线、绿色半透明面积填充
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({ // 图表数据（{ time, value }数组，来自父组件） chartData: { type: Array, default: () => [] }, // 当前激活的tab索引（用于切换图表标题/配置） activeTab: { type: Number, default: 0 }
})
// #endregion

// #region 2. 响应式状态

// ECharts DOM引用
const chartRef = ref(null)

// ECharts实例（非响应式，直接let 存储）
let chartInstance = null

// ResizeObserver实例（用于监听容器尺寸变化）
let resizeObserver = null
// #endregion

// #region 3. 图表配置

// 从chartData提取X轴时间数据
const getXAxisData = () => { if (props.chartData && props.chartData.length > 0) { return props.chartData.map(d => d.time)
  }
  // 默认X轴刻度：2-24时，间隔2（Figma标注值）
  return [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
}

// 从chartData提取Y轴数值数据
const getSeriesData = () => { if (props.chartData && props.chartData.length > 0) { return props.chartData.map(d => d.value)
  }
  // 默认占位数据
  return [5, 12, 8, 25, 18, 32, 28, 35, 22, 15, 20, 10]
}

// 构建ECharts option（按Figma面积图配置）
const buildChartOption = () => {
  const xData = getXAxisData()
  const seriesData = getSeriesData()

  return {
    // 图表内边距：为Y轴刻度、X轴刻度留空间
    grid: {
      top: 10,
      right: 10,
      bottom: 20,
      left: 30,
      containLabel: false
    },
    // X轴：时间刻度（2-24时，Figma明确标注）
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(102,102,102,0.3)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(102,102,102,0.3)' }
      },
      axisLabel: {
        show: true,
        fontSize: 12,
        color: '#333333',
        fontFamily: 'Roboto',
        interval: 0
      },
      splitLine: { show: false }
    },
    // Y轴：浓度值(0-50，间隔10，Figma明确标注刻度值：0 10 20 30 40 50)
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        fontSize: 9.6,
        color: '#333333',
        fontFamily: 'Roboto',
        align: 'right'
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(102,102,102,0.15)',
          type: 'solid',
          width: 1
        }
      }
    },
    // tooltip：鼠标悬停显示时间和浓度值
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params) => {
        if (params && params[0]) {
          const p = params[0]
          return `时间：${p.axisValue}时<br/>浓度：${p.value}`
        }
        return ''
      }
    },
    // 面积图series（绿色半透明填充 + 绿色边线 + 红色虚线预警阈值）
    series: [
      {
        name: 'CO浓度',
        type: 'line',
        data: seriesData,
        smooth: true,
        // 绿色半透明面积填充（Figma：rgba(82,196,26,0.3)）
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.5)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        // 绿色边线（Figma Vector 1303 stroke：rgba(15,205,125,1)）
        lineStyle: {
          color: 'rgba(15,205,125,1)',
          width: 1.5
        },
        itemStyle: {
          color: 'rgba(15,205,125,1)'
        },
        symbol: 'none'
      },
      {
        // 红色虚线预警阈值线（Figma：预警线标注，红色虚线）
        name: '预警线',
        type: 'line',
        // 预警阈值固定在30（Y轴中偏上位置，与Figma视觉比例接近）
        data: xData.map(() => 30),
        smooth: false,
        symbol: 'none',
        lineStyle: {
          color: '#d32f2f',
          width: 1.5,
          type: 'dashed'
        },
        areaStyle: { color: 'transparent' },
        itemStyle: { color: '#d32f2f' },
        // 不在legend中显示（图表内已有文字标注）
        showInLegend: false,
        tooltip: { show: false }
      }
    ]
  }
}
// #endregion

// #region 4. 图表初始化与生命周期

// 初始化ECharts实例（遵循规范：await nextTick + requestAnimationFrame）
const initChart = () => { if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())

  // 挂载ResizeObserver监听容器尺寸变化，自动resize图表
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

onMounted(async () => {
  // 等待DOM settle后再初始化（flex百分比高度需要nextTick+rAF才稳定）
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理ResizeObserver和ECharts实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})

// 监听chartData变化，联动更新图表（tab切换后数据刷新）
watch(
  () => props.chartData,
  () => {
    if (chartInstance) {
      chartInstance.setOption(buildChartOption())
    }
  },
  { deep: true }
)

// 监听activeTab变化，联动刷新图表配置（切换监测指标）
watch(
  () => props.activeTab,
  () => {
    if (chartInstance) {
      chartInstance.setOption(buildChartOption())
    }
  }
)
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 面积图根容器：纵向弹性布局，填充ChartArea的剩余空间
.area-chart-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0 8px 4px 8px;
}

// Y轴单位标注（Figma 辆：12px #666666，位于图表左上角外侧）
.area-chart-yaxis-unit {
  position: absolute;
  top: 0;
  left: 8px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  color: #666666;
  z-index: 1;
  pointer-events: none;
}

// 图表主体wrapper：flex:1 填充，min-height:0 防止撑破父容器
.area-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  // 为Y轴单位留出顶部空间
  padding-top: 16px;
  box-sizing: border-box;
}

// ECharts DOM容器：100%宽高，禁止margin（规范要求）
.area-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

// X轴单位标注（Figma 时：12px #666666，位于X轴右下角）
.area-chart-xaxis-unit {
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 12px;
  color: #666666;
  pointer-events: none;
}
</style>