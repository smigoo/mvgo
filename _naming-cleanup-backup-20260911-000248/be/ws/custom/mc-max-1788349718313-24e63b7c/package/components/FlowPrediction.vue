<template>
  <div class="c-monitor-flow-prediction-root">
    <!-- 标题行 -->
    <div class="c-monitor-flow-prediction-header">
      <div class="c-monitor-flow-prediction-title">
        <img :src="icon3" class="c-monitor-flow-prediction-icon" alt="流量预测图标" />
        <span class="c-monitor-flow-prediction-title-text">流量预测</span>
      </div>
      <!-- Tab 切换 -->
      <div class="c-monitor-flow-prediction-tabs">
        <div
          class="c-monitor-flow-prediction-tab"
          :class="{ 'c-monitor-flow-prediction-tab--active': activeTab === 'tunnel' }"
          @click="handleTabChange('tunnel')"
        >
          江阴靖江长江隧道
        </div>
        <div
          class="c-monitor-flow-prediction-tab"
          :class="{ 'c-monitor-flow-prediction-tab--active': activeTab === 'bridge' }"
          @click="handleTabChange('bridge')"
        >
          江阴大桥
        </div>
      </div>
      <!-- 节假日预测按钮 -->
      <a-button
        type="link"
        class="c-monitor-flow-prediction-holiday-btn"
        @click="handleHolidayPrediction"
      >
        节假日预测
      </a-button>
    </div>

    <!-- 图表图例 -->
    <div class="c-monitor-flow-prediction-legend">
      <div
        class="c-monitor-flow-prediction-legend-item"
        :class="{ 'c-monitor-flow-prediction-legend-item--inactive': !legendState.actual }"
        @click="toggleLegend('实际流量')"
      >
        <span class="c-monitor-flow-prediction-legend-line c-monitor-flow-prediction-legend-line--actual"></span>
        <span class="c-monitor-flow-prediction-legend-dot c-monitor-flow-prediction-legend-dot--actual"></span>
        <span class="c-monitor-flow-prediction-legend-label">实际流量</span>
      </div>
      <div
        class="c-monitor-flow-prediction-legend-item"
        :class="{ 'c-monitor-flow-prediction-legend-item--inactive': !legendState.predicted }"
        @click="toggleLegend('预测流量')"
      >
        <span class="c-monitor-flow-prediction-legend-line c-monitor-flow-prediction-legend-line--predicted"></span>
        <span class="c-monitor-flow-prediction-legend-dot c-monitor-flow-prediction-legend-dot--predicted"></span>
        <span class="c-monitor-flow-prediction-legend-label">预测流量</span>
      </div>
    </div>

    <!-- ECharts 图表区 -->
    <div class="c-monitor-flow-prediction-chart-wrap">
      <div ref="chartRef" class="c-monitor-flow-prediction-chart"></div>
    </div>

    <!-- 准确率标注 -->
    <div class="c-monitor-flow-prediction-accuracy">
      <span class="c-monitor-flow-prediction-accuracy-item">准确率98%</span>
      <span class="c-monitor-flow-prediction-accuracy-item">准确率96%</span>
      <span class="c-monitor-flow-prediction-accuracy-item">准确率92%</span>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'


const props = defineProps({
  icon3: {
    type: String,
    default: ''
  }
})

// Tab 状态
const activeTab = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, predicted: true })

// 图表 ref
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Mock 数据（两个地点各自独立数据）
const chartDataMap = {
  'c-monitor-tunnel': {
    actual: [1200, 1800, 2400, 2100, null, null],
    predicted: [null, null, null, 2100, 2600, 2900]
  },
  'c-monitor-bridge': {
    actual: [2200, 3000, 3400, 3100, null, null],
    predicted: [null, null, null, 3100, 3500, 3800]
  }
}

const xAxisData = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

// 构建图表配置
const buildOption = () => {
  const data = chartDataMap[activeTab.value]
  // 实际流量覆盖前3个点（2小时前、1小时前、当前时间）
  const actualData = [data.actual[0], data.actual[1], data.actual[2], data.actual[3], null, null]
  // 预测流量覆盖后3个点（当前时间、1小时后、2小时后）
  const predictedData = [null, null, data.predicted[3], data.predicted[4], data.predicted[5]]

  return {
    grid: {
      left: 40,
      right: 16,
      top: 16,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(24, 144, 255, 0.3)',
      borderWidth: 1,
      borderRadius: 4,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `<div style="font-weight:500;margin-bottom:4px;">${params[0]?.axisValue || ''}</div>`
        params.forEach(p => {
          if (p.value !== null && p.value !== undefined) {
            result += `<div>${p.marker}${p.seriesName}: <span style="font-weight:600">${p.value}</span> 辆</div>`
          }
        })
        return result
      }
    },
    legend: {
      show: false
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        show: true,
        fontSize: 12,
        color: '#666666',
        fontFamily: 'Source Han Sans CN'
      },
      axisTick: { show: true, lineStyle: { color: '#d9d9d9' } },
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        fontSize: 12,
        color: '#666666',
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        show: true,
        fontSize: 12,
        color: '#666666',
        fontFamily: 'Roboto'
      },
      axisTick: { show: true, lineStyle: { color: '#d9d9d9' } },
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [data.actual[0], data.actual[1], data.actual[2], data.actual[3], null],
        connectNulls: false,
        smooth: true,
        lineStyle: {
          color: '#3385ff',
          width: 2,
          type: 'solid'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1
        },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.35)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
          ])
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 4,
            shadowColor: 'rgba(51,133,255,0.3)'
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: [null, null, data.predicted[3], data.predicted[4], data.predicted[5]],
        connectNulls: false,
        smooth: true,
        lineStyle: {
          color: '#00cccc',
          width: 2,
          type: 'solid'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
        },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.35)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
          ])
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 4,
            shadowColor: 'rgba(0,204,204,0.3)'
          }
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// Tab 切换
const handleTabChange = (tab) => {
  if (activeTab.value === tab) return
  activeTab.value = tab
}

watch(activeTab, () => {
  updateChart()
})

// 图例联动
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '实际流量') {
    legendState.value.actual = !legendState.value.actual
  } else {
    legendState.value.predicted = !legendState.value.predicted
  }
}

// 节假日预测按钮
const handleHolidayPrediction = () => {
  // 预留交互，按设计稿当前为未激活态
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction-root {width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 174 1 0;
  box-sizing: border-box;
  font-size: var(--fontSize, 14px);

}
.c-monitor-flow-prediction-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  margin-bottom: 4px;
}

.c-monitor-flow-prediction-title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  white-space: nowrap;
  text-shadow: 0px 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-flow-prediction-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  flex-shrink: 0;
}

.c-monitor-flow-prediction-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  height: 19px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: var(--fontSize, 14px);
  font-weight: 400;
  color: #ffffff;
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  border-radius: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;

  &--active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    font-weight: 500;
  }

  &:hover:not(&--active) {
    background: #7a92b5;
  }
}

.c-monitor-flow-prediction-holiday-btn {
  margin-left: auto;
  flex-shrink: 0;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #1990ff !important;

  :deep(.ant-btn-link) {
    color: #1990ff;
  }
}

.c-monitor-flow-prediction-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  justify-content: flex-end;
  margin-bottom: 4px;
  height: 18px;
}

.c-monitor-flow-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;

  &--inactive {
    opacity: 0.4;
  }
}

.c-monitor-flow-prediction-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  border-radius: 1px;

  &--actual {
    background: #3385ff;
  }

  &--predicted {
    background: #00cccc;
  }
}

.c-monitor-flow-prediction-legend-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;

  &--actual {
    border: 1px solid #3385ff;
    box-shadow: 0px 1px 1px rgba(0, 204, 204, 0.3);
  }

  &--predicted {
    border: 1px solid #00cccc;
    box-shadow: 0px 1px 1px rgba(0, 204, 204, 0.3);
  }
}

.c-monitor-flow-prediction-legend-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #666666;
  line-height: 18px;
  white-space: nowrap;
}

.c-monitor-flow-prediction-chart-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-flow-prediction-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-flow-prediction-accuracy {
  display: flex;
  align-items: center;
  gap: 21px;
  flex-shrink: 0;
  height: 12px;
  margin-top: 4px;
  padding-left: 40px;
}

.c-monitor-flow-prediction-accuracy-item {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  color: #52c41a;
  line-height: 12px;
  text-align: center;
  white-space: nowrap;
}
</style>