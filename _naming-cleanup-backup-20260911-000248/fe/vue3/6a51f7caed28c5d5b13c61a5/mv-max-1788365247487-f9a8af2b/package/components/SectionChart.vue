<template>
  <!-- 图表区域子组件：CO浓度面积折线图，支持 Tab 切换与视图模式切换 -->
  <div class="section-chart">
    <!-- 图表底图背景容器 -->
<div class="chart-bg-wrapper" :style="bgChart ? { backgroundImage: `url(${bgChart})` } : {}" >
      <!-- 图表视图 -->
      <div v-if="activeView === 'chart'" class="chart-inner">
        <div ref="chartRef" class="chart-echarts"></div>
      </div>

      <!-- 列表视图（占位，暂无数据结构定义） -->
      <div v-else class="list-view-placeholder">
        <span class="list-view-tip">列表视图</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 图表区域子组件
// 职责：渲染 ECharts 面积折线图（CO浓度趋势），含预警线、图例、坐标轴
// 数据来源：父组件 index.vue 通过 props 传入 chartData / activeTab / activeView
// 关键交互：activeTab 切换时重新渲染图表；activeView 切换时显示/隐藏图表

import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region Props 定义
const props = defineProps({ // 当前激活 Tab 索引（0=一氧化碳, 1=能见度, 2=洞内照明, 3=洞外光强） activeTab: { type: Number, default: 0 }, // 当前视图模式（'chart' | 'list'） activeView: { type: String, default: 'chart' }, // 图表数据：[{ time: number, value: number }]
  chartData: { type: Array, default: () => [] },
  // 图表区底图变量（系统注入的图片字符串）
  bgChart: { type: String, default: '' }
})
// #endregion

// #region Tab 对应标题映射
const TAB_TITLES = ref(['zk3+785CO浓度', '能见度', '洞内照明', '洞外光强'])
// Y 轴单位对应各 Tab（当前设计图只明确 CO 为"辆/浓度单位"）
const TAB_Y_UNITS = ref(['辆', '', '', ''])
// #endregion

// #region ECharts 实例与 ref
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 构建 ECharts option
/**
 * 根据当前 chartData 和 activeTab 构建完整的 ECharts 配置
 * 包含：面积折线图、预警线 markLine、图例、坐标轴刻度
 */
const buildOption = () => {
  const tabTitle = TAB_TITLES[props.activeTab] || 'zk3+785CO浓度'
  const yUnit = TAB_Y_UNITS[props.activeTab] || ''

  // X 轴数据：从 chartData 提取，若为空则用 Figma 标注的固定刻度
  const xData = props.chartData.length > 0
    ? props.chartData.map(d => d.time)
    : [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

  // Y 轴数据
  const yData = props.chartData.length > 0
    ? props.chartData.map(d => d.value)
    : [8, 15, 22, 18, 25, 30, 28, 35, 20, 12, 10, 8]

  return {
    // 图表内边距：左侧留出 Y 轴刻度+单位空间，右侧留出图例空间
    grid: {
      top: 30,
      right: 20,
      bottom: 30,
      left: 40,
      containLabel: false
    },

    // 图例：右上角，水平排列，与 Figma legendPosition: top-right 对齐
    legend: {
      show: true,
      top: 4,
      right: 10,
      orient: 'horizontal',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      data: [tabTitle]
    },

    // X 轴：时间刻度（2~24，单位"时"）
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(255,255,255,0.2)' }
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(255,255,255,0.2)' }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto',
        // X 轴末尾追加"时"单位标注
        formatter: (val, idx) => {
          if (idx === xData.length - 1) return `${val}\n时`
          return String(val)
        }
      },
      splitLine: { show: false }
    },

    // Y 轴：浓度刻度（0~40，单位"辆"）
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Roboto',
        align: 'right'
      },
      // Y 轴顶部"辆"单位标注
      name: yUnit,
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right',
        padding: [0, 0, 0, -20]
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255,255,255,0.08)',
          type: 'solid'
        }
      }
    },

    // Tooltip：悬浮显示当前时间+浓度值
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20,30,50,0.9)',
      borderColor: 'rgba(85,158,255,0.3)',
      borderWidth: 1,
      textStyle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12
      },
      formatter: (params) => {
        if (!params || params.length === 0) return ''
        const p = params[0]
        return `${p.axisValue}时<br/>${p.seriesName}：${p.value}`
      }
    },

    // 系列：面积折线图，绿色系，含预警线 markLine
    series: [
      {
        name: tabTitle,
        type: 'line',
        data: yData,
        smooth: true,
        symbol: 'none',
        // 折线颜色：绿色
        lineStyle: {
          color: 'rgba(80,200,120,1)',
          width: 2
        },
        // 填充区域：半透明绿色
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(80,200,120,0.3)' },
            { offset: 1, color: 'rgba(80,200,120,0.05)' }
          ])
        },
        // 预警线：Y≈30 处红色虚线，附带"预警线"文字标注
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: {
            color: 'rgba(255,48,48,1)',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }
}
// #endregion

// #region ECharts 初始化
/**
 * 初始化图表实例：等待 nextTick + rAF 保证 flex 布局已 settle
 */
const initChart = async () => { await nextTick()
  requestAnimationFrame(() => {
    if (!chartRef.value) return
    // 销毁已有实例，防止重复初始化
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    chartInstance = echarts.init(chartRef.value)
    chartInstance.setOption(buildOption())

    // 挂载 ResizeObserver，容器尺寸变化时自动 resize
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize()
    })
    resizeObserver.observe(chartRef.value)
  })
}
// #endregion

// #region 生命周期
onMounted(() => {
  // 仅在图表视图下初始化
  if (props.activeView === 'chart') {
    initChart()
  }
})

onUnmounted(() => {
  // 清理 ResizeObserver 与 echarts 实例，避免内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion

// #region 监听 Props 变化
// 监听 activeTab 变化：切换不同监测指标时重新渲染图表
watch(() => props.activeTab, async () => {
  if (props.activeView !== 'chart') return
  if (chartInstance) {
    chartInstance.setOption(buildOption(), true)
  } else {
    await initChart()
  }
})

// 监听 chartData 变化：API 注入新数据后刷新图表
watch(() => props.chartData, () => {
  if (chartInstance && props.activeView === 'chart') {
    chartInstance.setOption(buildOption(), true)
  }
}, { deep: true })

// 监听视图切换：切换到图表视图时需重新初始化（DOM 节点重新挂载）
watch(() => props.activeView, async (newView) => {
  if (newView === 'chart') {
    // v-if 切换后 DOM 重新创建，需异步等待挂载
    await nextTick()
    initChart()
  } else {
    // 切换到列表视图时释放图表实例
    resizeObserver?.disconnect()
    chartInstance?.dispose()
    chartInstance = null
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表区域根容器：flex: 1 吃满父级剩余高度
.section-chart {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// 图表底图背景容器：使用 bg-7890.png 作为底图
// background-image 通过 :style 绑定变量，此处设置布局与尺寸
.chart-bg-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  // 底图精确还原：100% 100% 铺满，不重复（Figma: backgroundSize: "100% 100%"）
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  // 未注入底图时降级为深色透明背景
  background-color: transparent;
  padding: 8px;
  box-sizing: border-box;
  position: relative;
}

// ECharts 图表内层容器：flex 布局链贯通
.chart-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

// ECharts 挂载节点：必须设置 width/height 100%，min-height: 0 防止撑破
.chart-echarts {
  width: 100%;
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
}

// 列表视图占位区域
.list-view-placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list-view-tip {
  color: @color-text-secondary;
  font-size: @font-size-base;
  font-family: 'Source Han Sans CN', sans-serif;
}
</style>