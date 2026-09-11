<template>
  <div class="section-chart" :style="chartBgStyle">
    <div class="chart-wrapper" ref="chartRef"></div>
  </div>
</template>

<script setup>
const bg2 = new URL('../../resources/images/bg-7890.png', import.meta.url).href
/**
 * 环境监测面板 - 趋势图表区子组件
 * 功能：使用 ECharts 渲染 CO 浓度等监测指标的面积趋势图
 * - 包含红色虚线预警线（y=30）
 * - 图例位于右上角
 * - X轴为时间（2-24时），Y轴为数值（0-40，单位'辆'按视觉原样保留）
 * 
 * 交互：
 * - 监听 activeTab 变化，支持后续扩展不同指标的数据刷新
 */
import { ref, onMounted, onUnmounted, watch, computed} from 'vue'
import * as echarts from 'echarts'

// 接收父组件传递的当前激活 Tab 索引
const props = defineProps({
  activeTab: {
    type: Number,
    default: 0
  }
})

// 图表容器 DOM 引用
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 背景图样式（使用系统注入的 bg2 变量，直接落地 Figma 背景值）
const chartBgStyle = computed(() => ({
  backgroundImage: `url(${bg2})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat'
}))

// 模拟图表数据（实际业务中可通过 API 获取，此处为占位数据）
const generateChartData = () => {
  // 生成 12 个数据点，对应 X 轴的 2-24 时，包含超过预警线(30)的点
  return [12, 18, 15, 25, 28, 35, 32, 22, 18, 24, 16, 10]
}

// 初始化 ECharts 实例及配置
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    // 提示框配置
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e0e0e0',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#ccc' } }
    },
    // 图例配置（右上角）
    legend: {
      data: ['zk3+785CO浓度'],
      top: 4,
      right: 10,
      textStyle: { color: '#333333', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 16,
      itemStyle: { color: '#0fcd7d' }
    },
    // 网格配置（留出坐标轴标签空间）
    grid: {
      top: 35,
      left: 35,
      right: 15,
      bottom: 25
    },
    // X 轴配置
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#bed4e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#333333', fontSize: 12, margin: 8 },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12, padding: [0, 0, 0, -10] }
    },
    // Y 轴配置（单位'辆'按设计稿视觉原样保留）
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#bed4e8', width: 0.8 } },
      axisLabel: { color: '#333333', fontSize: 12 },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: '#666666', fontSize: 12, align: 'right', padding: [0, 20, 0, 0] }
    },
    // 数据系列配置
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: generateChartData(),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        // 预警线配置（红色虚线 y=30）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

// 监听 Tab 切换，刷新图表数据（预留接口）
watch(() => props.activeTab, () => {
  if (chartInstance) {
    // 实际业务中可根据 activeTab 请求不同指标的数据
    // 此处先做 resize 确保尺寸正确
    chartInstance.resize()
  }
})

// 生命周期：挂载时初始化图表并监听尺寸变化
onMounted(() => {
  initChart()
  
  // 使用 ResizeObserver 监听容器尺寸变化，实现图表自适应
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value)
  }
})

// 生命周期：卸载时清理资源，防止内存泄漏
onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表区根容器
.section-chart {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  box-sizing: border-box;
  overflow: hidden;
  
  // 图表容器
  .chart-wrapper {
    width: 100%;
    height: 100%;
    min-height: 100px;
  }
}</style>