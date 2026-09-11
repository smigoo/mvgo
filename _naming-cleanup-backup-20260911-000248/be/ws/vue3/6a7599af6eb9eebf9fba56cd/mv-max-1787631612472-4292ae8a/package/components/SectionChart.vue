<template>
  <!-- 图表区域容器，应用背景图 -->
  <div 
    class="section-chart" 
    :style="{ backgroundImage: `url(${bg2})` }"
  >
    <!-- ECharts 图表容器 -->
    <div class="chart-container" ref="chartRef"></div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'

// 组件用途：渲染环境监测面板的 CO 浓度趋势面积图，包含预警线与图例
// 数据来源：通过 ref 定义图表数据，支持后续 API 绑定覆盖
// 关键交互：ECharts 初始化、ResizeObserver 监听容器尺寸变化

import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// 系统自动注入的背景图变量 bg2 (bg-7890.png)，无需手动 import

// #region 1. 响应式状态（图表数据）
// X轴时间数据
const xData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
// Y轴浓度数据（模拟数据，支持 API 绑定覆盖）
const yData = ref([10, 15, 25, 35, 20, 10, 5, 15, 25, 30, 20, 10])
// #endregion

// #region 2. DOM 引用与实例
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 3. 方法
// 初始化 ECharts 图表
const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

  const option = {
    // 提示框配置
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e0e0e0',
      textStyle: { color: '#333', fontSize: 12 }
    },
    // 图例配置：右上角显示
    legend: {
      data: ['zk3+785CO浓度'],
      right: 10,
      top: 10,
      textStyle: { color: '#333', fontSize: 10 },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    // 网格配置：留出坐标轴和图例空间
    grid: {
      left: 40,
      right: 20,
      top: 40,
      bottom: 30
    },
    // X轴配置：时间（时）
    xAxis: {
      type: 'category',
      data: xData.value,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
      name: '时',
      nameTextStyle: { color: '#666', fontSize: 12, padding: [0, 0, 0, -20] }
    },
    // Y轴配置：数值（辆），0-40
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 12 },
      name: '辆',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'right' }
    },
    // 系列配置：面积图 + 预警线
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: yData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#0fcd7d', width: 2 },
        itemStyle: { color: '#0fcd7d', borderColor: '#fff', borderWidth: 1 },
        // 绿色渐变面积填充
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        // 红色虚线预警线（Y=30）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
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

  // 监听容器尺寸变化，自适应调整图表大小
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}
// #endregion

// #region 4. 生命周期
onMounted(async () => {
  // 等待 DOM 更新，确保 flex 布局计算完成
  await nextTick()
  // 使用 requestAnimationFrame 确保容器尺寸 settle 后再初始化
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理资源，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 图表区域容器：承载背景图与图表实例 */
.section-chart {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  /* 背景图精确还原 Figma 标注 */
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;

  /* ECharts 图表容器：撑满父级 */
  .chart-container {
    width: 100%;
    height: 100%;
  }
}</style>