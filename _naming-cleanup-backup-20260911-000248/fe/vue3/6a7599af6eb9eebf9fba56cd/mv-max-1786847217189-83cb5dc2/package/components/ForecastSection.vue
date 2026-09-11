<template>
  <section class="forecast-section-root">
    <div class="section-header forecast-header">
      <div class="section-title-wrap">
        <img :src="titleIcon" alt="" class="section-title-icon" />
        <h2 class="section-title-text">流量预测</h2>
      </div>

      <div class="forecast-header-actions">
        <div class="forecast-tabs" role="tablist" aria-label="流量预测地点切换">
          <button
            v-for="(tab, index) in tabs"
            :key="tab"
            type="button"
            :class="['forecast-tab-button', { 'forecast-tab-button--active': index === currentActiveIndex }]"
            role="tab"
            :aria-selected="index === currentActiveIndex"
            @click="handleTabClick(index)"
          >
            {{ tab }}
          </button>
        </div>

        <button type="button" class="holiday-link" @click="handleHolidayClick">
          节假日预测&gt;
        </button>
      </div>
    </div>

    <div class="forecast-body">
      <div class="forecast-chart-card">
        <div ref="chartRef" class="forecast-chart" aria-label="流量预测趋势图"></div>
        <div class="accuracy-row">
          <span v-for="item in accuracyList" :key="item" class="accuracy-item">{{ item }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 流量预测区块：还原标题、地点 Tab、节假日预测入口与折线面积图；图表数据来自父组件 ref 传入，便于 API 绑定后驱动刷新。
const props = defineProps({
  tabs: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  forecastData: {
    type: Object,
    default: () => ({
      xAxis: [],
      actual: [],
      predict: []
    })
  },
  accuracyList: { type: Array, default: () => [] },
  titleIcon: { type: String, default: '' }
})

const emit = defineEmits(['tab-change', 'holiday-click'])

const chartRef = ref(null)
const currentActiveIndex = ref(props.activeIndex)

let chartInstance
let resizeObserver

const buildChartOption = () => {
  // ECharts option 每次从响应式 props 读取，避免 API 替换数据后图表仍停留在旧字面量。
  const xAxisData = props.forecastData?.xAxis || []
  const actualData = props.forecastData?.actual || []
  const predictData = props.forecastData?.predict || []

  return {
    color: ['#1890ff', '#38bdf8'],
    grid: {
      top: 34,
      right: 14,
      bottom: 42,
      left: 34,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(24, 144, 255, 0.24)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#8bc6ff',
          width: 1,
          type: 'dashed'
        }
      },
      formatter: params => {
        const title = params?.[0]?.axisValue || ''
        const rows = params
          .filter(item => item.value !== null && item.value !== undefined)
          .map(item => `${item.marker}${item.seriesName}：${item.value}辆`)
        return [title, ...rows].join('<br/>')
      }
    },
    legend: {
      show: true,
      top: 0,
      right: 0,
      orient: 'horizontal',
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 10,
      icon: 'roundRect',
      textStyle: {
        color: '#333333',
        fontSize: 12,
        lineHeight: 18
      },
      data: ['实际流量', '预测流量']
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: {
        lineStyle: {
          color: '#d6e6f6'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#66788a',
        fontSize: 12,
        margin: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#66788a',
        fontSize: 12,
        padding: [0, 18, 0, 0]
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#d6e6f6'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#66788a',
        fontSize: 12,
        formatter: value => `${value}`
      },
      splitLine: {
        lineStyle: {
          color: '#dcecf8',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        data: actualData,
        lineStyle: {
          width: 1,
          color: '#1890ff'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#1890ff',
          borderWidth: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.24)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
          ])
        },
        emphasis: {
          focus: 'series'
        }
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        data: predictData,
        lineStyle: {
          width: 1,
          color: '#00cccc'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.22)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
          ])
        },
        emphasis: {
          focus: 'series'
        }
      }
    ]
  }
}

const renderChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), true)
}

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  renderChart()

  // 监听容器尺寸变化，保证父级 flex 拉伸或 iframe 尺寸变化时 canvas 同步自适应。
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

const handleTabClick = index => {
  if (index === currentActiveIndex.value) return
  currentActiveIndex.value = index
  emit('tab-change', index)

  // Tab 切换后等待 DOM 状态更新再 resize，避免高亮切换导致图表尺寸计算滞后。
  nextTick(() => {
    chartInstance?.resize()
    renderChart()
  })
}

const handleHolidayClick = () => {
  // 设计稿只提供入口，不内置未知路由跳转，统一交给父组件处理。
  emit('holiday-click')
}

watch(
  () => props.activeIndex,
  value => {
    currentActiveIndex.value = value
  }
)

watch(
  () => props.forecastData,
  () => {
    renderChart()
  },
  { deep: true }
)

watch(
  () => props.tabs,
  () => {
    if (currentActiveIndex.value > props.tabs.length - 1) {
      currentActiveIndex.value = 0
    }
  },
  { deep: true }
)

onMounted(async () => {
  // 必须等待 nextTick 与下一帧，确保 flex 百分比高度完成计算后再初始化 ECharts。
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理 ResizeObserver 与 ECharts 实例，避免组件销毁后仍持有 DOM 引用。
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  resizeObserver = undefined
  chartInstance = undefined
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.forecast-section-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.forecast-header {
  flex: 0 0 24px;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.section-title-wrap {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.section-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  object-fit: contain;
}

.section-title-text {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5.0479230881px 5.0479230881px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.forecast-header-actions {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}

/* Tab 区域按 Figma 的 HORIZONTAL 节点还原，按钮宽度依据文本差异设置，避免平均分配导致主地点被截断。 */
.forecast-tabs {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.forecast-tab-button {
  height: 19px;
  min-width: 68px;
  max-width: 128px;
  padding: 0 8px;
  border: 0.730769217px solid rgba(172, 196, 225, 1);
  border-radius: 20.461538315px;
  background: #6680a0;
  box-sizing: border-box;
  cursor: pointer;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 18px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.forecast-tab-button--active {
  min-width: 128px;
  background: #1990ff;
  border-color: rgba(199, 224, 255, 1);
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(25, 144, 255, 0.24);
}

.holiday-link {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #1990ff;
  white-space: nowrap;
}

.forecast-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.forecast-chart-card {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.forecast-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.accuracy-row {
  position: absolute;
  left: 118px;
  right: 42px;
  bottom: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 21px;
  pointer-events: none;
}

.accuracy-item {
  flex: 0 0 auto;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 12px;
  color: #3385ff;
  white-space: nowrap;
}

@media (max-width: 360px) {
  .forecast-header {
    gap: 6px;
  }

  .forecast-header-actions {
    gap: 6px;
  }

  .forecast-tabs {
    gap: 5px;
  }

  .forecast-tab-button,
  .forecast-tab-button--active {
    min-width: 58px;
    max-width: 105px;
    padding: 0 6px;
    font-size: 12px;
  }

  .holiday-link {
    font-size: 11px;
  }

  .accuracy-row {
    left: 86px;
    right: 20px;
    gap: 10px;
  }
}</style>