<template>
  <div class="data-display-root" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 当前数值显示 -->
    <div class="current-value-section">
      <span class="current-label">当前</span>
      <div class="value-group">
        <span class="value-text">{{ currentValue }}</span>
        <span class="status-label">预警线</span>
      </div>
    </div>

    <!-- 面积图表 -->
    <div class="chart-container">
      <div ref="chartRef" class="chart-element"></div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'

import { ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
import * as echarts from 'echarts'

// 图片资源变量（由系统自动注入，保留占位）

// #region Props定义
const props = defineProps({
  activeTab: { type: Number, default: 0 }
})
// #endregion

// #region 响应式状态
// 当前数值（根据激活的标签页切换）
const currentValue = ref('2k3+785CD火度')

// 图表数据（24小时趋势数据，数据槽位：接收 API 数据）
const chartData = ref([15, 18, 22, 25, 28, 32, 30, 28, 25, 22, 20, 18, 16, 15, 17, 19, 21, 23, 25, 27, 26, 24, 22, 20])
// #endregion

// #region 图表相关
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// ECharts 配置
const getChartOption = () => ({
  grid: {
    left: 30,
    right: 10,
    top: 10,
    bottom: 25,
    containLabel: false
  },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    axisTick: { show: true, lineStyle: { color: 'rgba(102, 102, 102, 0.3)' } },
    axisLabel: {
      show: true,
      color: 'rgba(102, 102, 102, 1)',
      fontSize: 10,
      formatter: '{value}'
    },
    axisLine: {
      show: true,
      lineStyle: { color: 'rgba(102, 102, 102, 0.3)' }
    },
    boundaryGap: false
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    interval: 10,
    axisTick: { show: true, lineStyle: { color: 'rgba(102, 102, 102, 0.3)' } },
    axisLabel: {
      show: true,
      color: 'rgba(102, 102, 102, 1)',
      fontSize: 10
    },
    axisLine: {
      show: true,
      lineStyle: { color: 'rgba(102, 102, 102, 0.3)' }
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: 'rgba(85, 158, 255, 0.15)',
        type: 'solid'
      }
    }
  },
  series: [
    {
      name: '氧化碳浓度',
      type: 'line',
      smooth: true,
      data: chartData.value,
      lineStyle: {
        color: 'rgba(85, 158, 255, 1)',
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
            { offset: 0, color: 'rgba(85, 158, 255, 0.4)' },
            { offset: 1, color: 'rgba(85, 158, 255, 0)' }
          ]
        }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          {
            yAxis: 30,
            label: {
              show: true,
              formatter: '预警线',
              position: 'end',
              color: 'rgba(245, 63, 63, 1)',
              fontSize: 10
            },
            lineStyle: {
              type: 'dashed',
              color: 'rgba(245, 63, 63, 1)',
              width: 1,
              dashOffset: 0
            }
          }
        ]
      }
    }
  ],
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: 'rgba(85, 158, 255, 1)',
    borderWidth: 1,
    textStyle: {
      color: '#ffffff',
      fontSize: 12
    },
    formatter: (params) => {
      const param = params[0]
      return `${param.axisValue}时<br/>${param.seriesName}: ${param.value}`
    }
  }
})

// 初始化图表（必须等待 nextTick + requestAnimationFrame 确保 flex 布局 settle）
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(getChartOption())
  
  // 监听容器尺寸变化
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

// 监听激活标签页变化，切换数据
watch(() => props.activeTab, (newTab) => {
  // 根据不同标签页切换不同数据（示例：切换后重新生成随机数据）
  const mockData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 20) + 15)
  chartData.value = mockData
  
  // 更新图表
  if (chartInstance) {
    chartInstance.setOption({
      series: [{ data: chartData.value }]
    })
  }
})

// 监听图表数据变化
watch(chartData, () => {
  if (chartInstance) {
    chartInstance.setOption({
      series: [{ data: chartData.value }]
    })
  }
}, { deep: true })
// #endregion

// #region 生命周期
onMounted(async () => {
  // 等待 DOM 渲染完成 + flex 布局 settle
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.data-display-root {
  flex: 1; // 占满剩余空间;
  min-height: 0; // flex 子项必须配套 min-height: 0，防止内容撑破;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 16px;
  border-radius: 0 8px 8px 8px;
  overflow: hidden;
}

/* 当前数值显示区 */
.current-value-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0; // 固定高度，不参与 flex 拉伸;
}

.current-label {
  font-size: 12px;
  color: rgba(102, 102, 102, 1);
  line-height: 1.2;
}

.value-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.value-text {
  font-size: 14px;
  color: rgba(102, 102, 102, 1);
  font-weight: normal;
  line-height: 1.2;
}

.status-label {
  font-size: 12px;
  color: rgba(245, 63, 63, 1);
  line-height: 1.2;
}

/* 图表容器（flex 布局链贯通，必须遵守 L0-4 铁律） */
.chart-container {
  flex: 1; // 吃满父级剩余高度;
  min-height: 0; // 配套 min-height: 0，防止内容撑破（P0-4 硬性配套）;
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.chart-element {
  width: 100%;
  height: 100%; // 百分比高度需要父链全部贯通;
  min-height: 80px; /* 🎯 防挤压：echarts 容器最小高度 */;
}

/* X 轴单位标注（"时"字） */
:deep(.echarts-x-axis-unit) {
  font-size: 12px;
  color: rgba(102, 102, 102, 1);
}

/* Y 轴单位标注（"辆"字） */
:deep(.echarts-y-axis-unit) {
  font-size: 12px;
  color: rgba(102, 102, 102, 1);
}
</style>