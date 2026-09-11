<template>
  <div class="chart-area-root" :style="{ backgroundImage: `url(${bg2})` }">
    <div class="chart-container">
      <div ref="chartRef" class="chart-canvas"></div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
/**
 * ChartArea 子组件
 * 用途：渲染环境监测的浓度趋势面积图（含预警线）
 * 数据来源：通过 props 接收 activeTab，内部维护图表模拟数据
 * 关键交互：响应 activeTab 变化刷新图表，容器尺寸变化时自适应
 */
import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 接收父组件传入的当前激活 Tab
const props = defineProps({ activeTab: { type: String, default: '一氧化碳' }
})

// 图表容器 ref
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（使用 ref 以支持 API 绑定，禁止硬编码在 option 中）
const chartData = ref([10, 15, 12, 25, 35, 28, 20, 15, 18, 22, 10, 5])

// 构建 ECharts 配置
const getChartOption = () => { return { tooltip: { trigger: 'axis', formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      top: 30,
      left: 35,
      right: 15,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#cccccc' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 },
      name: '时',
      nameTextStyle: { color: '#666666', fontSize: 12, align: 'right' },
      nameLocation: 'end'
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eeeeee', type: 'dashed' } },
      axisLabel: { color: '#333333', fontSize: 12 },
      name: '辆',
      nameTextStyle: { color: '#666666', fontSize: 12, align: 'right' },
      nameLocation: 'end',
      nameGap: 10
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#0fcd7d', width: 2 },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                position: 'insideStartTop',
                color: '#d32f2f',
                fontSize: 12,
                distance: 5
              }
            }
          ]
        }
      }
    ]
  }
}

// 监听 activeTab 变化，刷新图表（不臆造数据，仅重新渲染）
watch(() => props.activeTab, () => {
  if (chartInstance) {
    chartInstance.setOption(getChartOption())
  }
})

onMounted(async () => {
  // 必须等待 DOM 更新且 flex 布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(getChartOption())
      
      // 监听容器尺寸变化，自适应图表
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
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

/* 图表区域根容器，承载背景图并作为 flex 子项填充剩余空间 */
.chart-area-root {
  flex: 1;
  /* 🎯 防挤压：Figma 图表区实际高度兜底，防止被兄弟元素压扁（压到 ~10px 折线视觉变形） */
  min-height: 100px;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

/* 图表容器，确保 echarts 能够正确获取 100% 高度 */
.chart-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* echarts 挂载节点，必须设置宽高 100% 以撑满父容器 */
.chart-canvas {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}</style>