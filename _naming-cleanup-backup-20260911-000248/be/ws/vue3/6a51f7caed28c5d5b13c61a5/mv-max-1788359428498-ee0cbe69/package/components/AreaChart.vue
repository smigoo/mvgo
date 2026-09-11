<template>
  <!-- 面积图容器：ECharts 挂载点，flex:1 填满剩余高度 -->
  <div class="area-chart" ref="chartRef"></div>
</template>

<script setup>

/**
 * AreaChart - 面积图组件（ECharts）
 * 渲染 24 小时环境监测趋势面积图，含红色预警虚线
 * Y 轴刻度：0/10/20/30/40（ppm），X 轴刻度：2/4/6/.../24（时）
 * 切换 activeTab 时更新图表配置（单位/数据/Y轴范围）
 * 遵循 echarts 初始化时序：nextTick → requestAnimationFrame → init
 */
import { ref, watch, onMounted, onUnmounted, defineProps } from 'vue'
import * as echarts from 'echarts'

// #region Props 定义
const props = defineProps({
  // 图表数据，ref() 变量，支持 API 绑定替换
  chartData: {
    type: Array,
    default: () => [5, 8, 12, 7, 6, 9, 15, 22, 18, 14, 11, 8, 10, 13, 9, 6, 8, 11, 7, 5, 9, 12, 10, 7]
  },
  // 当前激活的 tab 索引（0=氧化碳, 1=能见度, 2=洞内照明, 3=洞外光强）
  activeTab: {
    type: Number,
    default: 0
  }
})
// #endregion

// #region 响应式状态
const chartRef = ref(null)
// #endregion

// #region ECharts 实例与 ResizeObserver
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 各 Tab 对应 Y 轴配置
// Y 轴刻度按 Figma 标注：0, 10, 20, 30, 40（ppm 对应氧化碳；其他 tab 可扩展）
const yAxisConfigMap = [
  { max: 40, interval: 10, unit: 'ppm' },   // 氧化碳
  { max: 600, interval: 200, unit: 'm' },   // 能见度（Figma chartDataHints 中有 600/400/200/0）
  { max: 600, interval: 200, unit: 'lux' }, // 洞内照明
  { max: 600, interval: 200, unit: 'lux' }  // 洞外光强
]
// 预警线位置（Y轴值）
const warningLineMap = ref([30, 400, 300, 300])
// #endregion

// #region 构建 ECharts option
const buildOption = () => {
  const tabIdx = props.activeTab ?? 0
  const yConf = yAxisConfigMap[tabIdx] || yAxisConfigMap[0]
  const warningVal = warningLineMap[tabIdx] ?? 30

  // X 轴刻度：2, 4, 6, ..., 24（单位：时）
  const xData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

  // 使用 props.chartData，若长度不足则补充默认值（确保 24 个点）
  const seriesData = props.chartData && props.chartData.length >= 12
    ? props.chartData
    : [5, 8, 12, 7, 6, 9, 15, 22, 18, 14, 11, 8, 10, 13, 9, 6, 8, 11, 7, 5, 9, 12, 10, 7]

  return {
    // 图表内边距，为轴标签预留空间
    grid: {
      top: 16,
      right: 16,
      bottom: 24,
      left: 40,
      containLabel: false
    },
    // tooltip：鼠标悬停显示具体时间点和数值
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}：${p.value} ${yConf.unit}`
      },
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'rgba(85,158,255,0.3)',
      textStyle: { color: 'rgba(0,0,0,0.85)', fontSize: 12 }
    },
    // X 轴：时间刻度（单位：时）
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: {
        show: true,
        fontSize: 12,
        color: '#666666',
        fontFamily: 'Roboto, sans-serif',
        // 在最后一个刻度后方追加"时"单位（通过 name 实现）
        formatter: (val, idx) => idx === xData.length - 1 ? `${val}` : val
      },
      axisTick: { show: true, alignWithLabel: true },
      axisLine: { show: true, lineStyle: { color: 'rgba(85,158,255,0.2)' } },
      splitLine: { show: false },
      // X 轴末尾单位"时"通过 nameTextStyle 显示
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN, sans-serif',
        padding: [0, 0, 0, 4]
      }
    },
    // Y 轴：浓度值（ppm），刻度 0/10/20/30/40
    yAxis: {
      type: 'value',
      min: 0,
      max: yConf.max,
      interval: yConf.interval,
      axisLabel: {
        show: true,
        fontSize: 12,
        color: '#333333',
        fontFamily: 'Roboto, sans-serif',
        formatter: (val) => val
      },
      axisTick: { show: true },
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(85,158,255,0.15)', type: 'solid' }
      }
    },
    // 数据系列：面积图，浅蓝色渐变填充
    series: [
      {
        name: '氧化碳浓度',
        type: 'line',
        data: seriesData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(85, 158, 255, 1)',
          width: 2
        },
        areaStyle: {
          // 面积图渐变填充：顶部不透明 → 底部透明
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(85, 158, 255, 0.5)' },
            { offset: 1, color: 'rgba(85, 158, 255, 0.05)' }
          ])
        }
      },
      // 预警线：红色虚线 markLine
      {
        name: '预警线',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(255, 77, 79, 1)',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: false
          },
          data: [
            { yAxis: warningVal }
          ]
        }
      }
    ]
  }
}
// #endregion

// #region 初始化 ECharts（nextTick → rAF → init，确保 flex 高度已 settle）
const { nextTick } = await import('vue').catch(() => ({ nextTick: (fn) => Promise.resolve().then(fn) }))

onMounted(async () => {
  // 等待 DOM 尺寸稳定后再初始化，避免 canvas 定格在小尺寸
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(buildOption())

      // 挂载 ResizeObserver，容器尺寸变化时自动 resize
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})
// #endregion

// #region 监听 activeTab / chartData 变化，联动刷新图表配置
watch(
  () => [props.activeTab, props.chartData],
  () => {
    if (chartInstance) {
      // 切换 tab 或数据更新时重新 setOption
      chartInstance.setOption(buildOption(), { notMerge: true })
    }
  },
  { deep: true }
)
// #endregion

// #region 清理：断开 ResizeObserver + dispose 实例，防止内存泄漏
onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 面积图容器：占满 chart-section 剩余高度 */
.area-chart {
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;      /* 关键：让 flex 子项自然拉伸，不被内容撑破 */;
  width: 100%;
  height: 100%;
}
</style>