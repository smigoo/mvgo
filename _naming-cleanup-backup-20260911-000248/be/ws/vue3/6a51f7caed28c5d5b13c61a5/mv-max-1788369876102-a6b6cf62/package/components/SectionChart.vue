<template>
  <!-- 图表/数据可视化区域：CO浓度折线图，支持多指标Tab切换 -->
  <div class="section-chart">
    <!-- 图表顶部信息行：图例 + Y轴单位 -->
    <div class="chart-top-bar">
      <!-- 图例：zk3+785CO浓度 -->
      <div class="chart-legend">
        <span class="chart-legend-line"></span>
        <span class="chart-legend-text">{{ legendLabel }}</span>
      </div>
      <!-- Y轴单位标签 -->
      <span class="chart-yaxis-unit">{{ yAxisUnit }}</span>
    </div>

    <!-- ECharts 折线图容器，flex:1 自适应剩余高度 -->
    <div ref="chartRef" class="chart-canvas"></div>

    <!-- X轴单位标签 -->
    <div class="chart-xaxis-unit-row">
      <span class="chart-xaxis-unit">{{ xAxisUnit }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * SectionChart — 图表区子组件
 * 渲染 CO浓度（及其他监测指标）折线面积图
 * 接收 chartData（来自父组件 ref 变量）、activeTab（当前指标）、activeView（图表/表格视图）
 * 使用 ECharts 初始化，含 ResizeObserver + onUnmounted 清理
 */
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import * as echarts from 'echarts'

// #region Props
const props = defineProps({
  // 图表数据（来自父组件，按 activeTab 切换）
  chartData: { type: Array, default: () => [] },
  // 当前激活的 Tab 索引（0=一氧化碳, 1=能见度, 2=洞内照明, 3=洞外光强）
  activeTab: { type: Number, default: 0 },
  // 当前视图（'chart' | 'table'）
  activeView: { type: String, default: 'chart' }
})
// #endregion

// #region 响应式状态
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// X 轴时间刻度（2~24时）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// 各指标默认图表数据（模拟曲线：低→升→峰→降，峰值约在14~16时）
const defaultSeriesMap = ref({
  0: [2, 4, 6, 8, 15, 22, 30, 35, 32, 25, 18, 10],   // 一氧化碳
  1: [10, 12, 15, 18, 22, 28, 32, 30, 25, 20, 15, 11], // 能见度
  2: [5, 8, 12, 18, 25, 30, 28, 26, 22, 16, 10, 6],    // 洞内照明
  3: [8, 10, 14, 20, 28, 35, 38, 36, 30, 22, 14, 8]    // 洞外光强
})

// 各指标图例文本
const legendMap = ref({
  0: 'zk3+785CO浓度',
  1: 'zk3+785能见度',
  2: 'zk3+785洞内照明',
  3: 'zk3+785洞外光强'
})

// Y轴单位
const yAxisUnit = ref('辆')
// X轴单位
const xAxisUnit = ref('时')
// #endregion

// #region 计算属性
// 当前图例标签
const legendLabel = computed(() => legendMap.value[props.activeTab] || 'zk3+785CO浓度')

// 当前系列数据：优先使用外部传入 chartData，否则用默认数据
const currentSeriesData = computed(() => {
  if (props.chartData && props.chartData.length > 0) {
    return props.chartData
  }
  return defaultSeriesMap.value[props.activeTab] || defaultSeriesMap.value[0]
})
// #endregion

// #region ECharts 配置生成
/**
 * 生成 ECharts option
 * 折线图 + 绿色面积填充 + 红色虚线预警线（Y=30处）
 */
function buildChartOption() {
  return {
    // 图表内边距，留出Y轴刻度文字空间
    grid: {
      top: 10,
      bottom: 16,
      left: 38,
      right: 12,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(30,40,60,0.9)',
      borderColor: 'rgba(85,158,255,0.4)',
      borderWidth: 1,
      textStyle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}时<br/>${legendLabel.value}：${p.value}`
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      // X轴时间刻度必须显示
      axisLabel: {
        show: true,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        interval: 0
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(255,255,255,0.2)' }
      },
      axisLine: {
        lineStyle: { color: 'rgba(255,255,255,0.2)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      // Y轴刻度值必须显示（40/30/20/10/0）
      axisLabel: {
        show: true,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        formatter: '{value}'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(255,255,255,0.2)' }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255,255,255,0.08)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: legendLabel.value,
        type: 'line',
        data: currentSeriesData.value,
        // 绿色折线
        lineStyle: {
          color: 'rgba(0,230,120,1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(0,230,120,1)'
        },
        symbol: 'none',
        // 折线下方绿色半透明面积填充
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0,230,120,0.3)' },
            { offset: 1, color: 'rgba(0,230,120,0)' }
          ])
        },
        // 红色虚线预警线，约在Y轴30处
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: 'rgba(245,63,63,1)',
            fontSize: 10
          },
          lineStyle: {
            color: 'rgba(245,63,63,1)',
            type: 'dashed',
            width: 1
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }
}
// #endregion

// #region ECharts 初始化与更新
/**
 * 初始化 ECharts 实例
 * 必须先 await nextTick() 再 requestAnimationFrame，确保 flex 布局高度 settle 后再 init
 */
onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(buildChartOption())

      // 挂载 ResizeObserver，容器尺寸变化时自动 resize
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

// 监听 activeTab 切换，重新渲染图表数据
watch(() => props.activeTab, async () => {
  await nextTick()
  if (chartInstance) {
    chartInstance.setOption(buildChartOption(), { notMerge: false })
  }
})

// 监听外部 chartData 变化，驱动图表更新
watch(() => props.chartData, async () => {
  await nextTick()
  if (chartInstance) {
    chartInstance.setOption(buildChartOption(), { notMerge: false })
  }
}, { deep: true })

// 监听视图切换，切回 chart 视图时重新 resize（避免隐藏期间尺寸失效）
watch(() => props.activeView, async (val) => {
  if (val === 'chart') {
    await nextTick()
    requestAnimationFrame(() => {
      chartInstance?.resize()
    })
  }
})

// 组件销毁时清理资源，防止内存泄漏
onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表区主容器：纵向 flex，撑满父级剩余空间
.section-chart {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  // Figma section-chart body 背景：rgba(237,244,251,0.05)
  background: rgba(237, 244, 251, 0.05);
  padding: 8px 8px 4px 8px;
  width: 100%;
  box-sizing: border-box;
}

// 图表顶部信息行：图例居左，Y轴单位居右
.chart-top-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  flex-shrink: 0;
}

// 图例：色块线 + 文字
.chart-legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

// 图例色块线（绿色矩形，Figma Rectangle 346241398：14×2）
.chart-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: rgba(0, 230, 120, 1);
  border-radius: 1px;
  flex-shrink: 0;
}

// 图例文字
.chart-legend-text {
  font-size: 10px;
  color: rgba(0, 230, 120, 1);
  line-height: 14px;
  white-space: nowrap;
}

// Y轴单位标签（右上角，Figma：辆，字色 rgba(255,255,255,0.6)）
.chart-yaxis-unit {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1;
  flex-shrink: 0;
}

// ECharts 画布容器：flex:1 吃满剩余高度，min-height:0 防止 flex 撑破
.chart-canvas {
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
  width: 100%;
}

// X轴单位行（右下角，Figma：时）
.chart-xaxis-unit-row {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  flex-shrink: 0;
  margin-top: 2px;
}

.chart-xaxis-unit {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1;
}
</style>