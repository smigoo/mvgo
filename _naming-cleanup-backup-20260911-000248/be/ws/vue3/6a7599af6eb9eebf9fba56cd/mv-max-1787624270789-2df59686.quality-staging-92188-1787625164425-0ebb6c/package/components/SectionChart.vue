<template>
  <div class="section-chart-root" :style="{ backgroundImage: `url(${bg2})` }">
    <div class="chart-wrapper">
      <div class="chart-container" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'

/**
 * SectionChart - 环境监测图表区
 * 展示 CO 浓度趋势面积图，包含预警线标注
 * 数据来源：API 绑定 chartData
 */
import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// 图表数据（API 绑定目标，需使用 ref 包裹）
const chartData = ref([]) /* 🎯 待接入：数据源需绑定后端 API */

const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 初始化图表配置与实例
const initChart = () => { if (!chartRef.value) return
  
  const xData = chartData.value.map(item => item.time)
  const yData = chartData.value.map(item => item.value)

const option = { tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: {
        color: '#333',
        fontSize: 10
      },
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect'
    },
    grid: {
      top: 25,
      left: 35,
      right: 15,
      bottom: 25
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 10 },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 10, padding: [0, 0, 0, -5] }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 10 },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 10, align: 'right' }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: yData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
            ]
          }
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: 30,
              lineStyle: {
                color: '#d32f2f',
                type: 'dashed',
                width: 1
              },
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 10,
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  }

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(option)
  
  // 监听容器尺寸变化，确保图表自适应
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

onMounted(async () => {
  // 等待 DOM 更新与布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理监听器与图表实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 图表区根容器：承载背景图并作为 flex 子项撑满剩余空间 */
.section-chart-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 8px 12px;
}

/* 图表包裹层：贯通 flex 布局链 */
.chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 图表实际渲染容器：必须 min-height: 0 防止 flex 挤压 */
.chart-container {
  flex: 1;
  min-height: 160px;
  width: 100%;
}</style>