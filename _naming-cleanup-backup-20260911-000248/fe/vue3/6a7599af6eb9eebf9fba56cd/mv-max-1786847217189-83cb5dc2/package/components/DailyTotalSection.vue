<template>
  <section class="daily-total-section">
    <div class="section-header">
      <div class="section-title-wrap">
        <img :src="titleIcon" alt="" class="section-title-icon" />
        <h2 class="section-title">当日总流量</h2>
      </div>

      <a-select
        class="time-selector"
        :value="activeTime"
        size="small"
        :bordered="false"
        @change="handleTimeSelect"
      >
        <a-select-option
          v-for="option in timeOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </a-select-option>
      </a-select>
    </div>

    <div
      class="daily-total-body"
      :style="{ backgroundImage: `url(${sectionBg})` }"
    >
      <div class="daily-stat-row">
        <article
          v-for="stat in statList"
          :key="stat.id"
          class="daily-stat-card"
          :class="`daily-stat-card--${stat.id}`"
        >
          <div class="daily-stat-name">{{ stat.name }}</div>
          <div class="daily-stat-value" :class="stat.valueClass">{{ stat.value }}</div>
        </article>
      </div>
    </div>

    <div class="daily-chart-list">
      <article
        v-for="chart in barChartList"
        :key="chart.id"
        class="bar-chart-card"
      >
        <div class="bar-chart-title-row">
          <span class="chart-title-marker"></span>
          <span class="bar-chart-title">{{ chart.title }}</span>
        </div>
        <div class="chart-shell">
          <div :ref="el => setChartRef(el, chart.id)" class="chart-canvas"></div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

// 当日总流量区块：还原标题、右侧 24 小时下拉、总量背景卡与两个小时流量柱状图；图表数据通过 props 传入并监听更新，便于主组件或 API 绑定系统刷新。
const props = defineProps({
  timeOptions: { type: Array, default: () => [] },
  activeTime: { type: String, default: '24小时' },
  statList: { type: Array, default: () => [] },
  barChartList: { type: Array, default: () => [] },
  sectionBg: { type: String, default: '' },
  titleIcon: { type: String, default: '' }
})

const emit = defineEmits(['update:active-time'])

const chartRefs = ref({})
const chartInstances = ref({})
const resizeObservers = ref({})

const handleTimeSelect = value => {
  // 下拉框交互只透传当前选择，不臆造 Figma 未给出的额外时间选项。
  emit('update:active-time', value)
}

const setChartRef = (el, id) => {
  // v-for 下按稳定 id 保存 DOM 引用，避免图表重排后 ref 顺序错位。
  if (el) {
    chartRefs.value[id] = el
  }
}

const getBarChartOption = chart => {
  const xAxisData = chart.xAxis || []
  const beijingData = chart.beijingData || []
  const shanghaiData = chart.shanghaiData || []

  return {
    color: ['#1890ff', '#38bdf8'],
    grid: {
      top: 34,
      right: 18,
      bottom: 22,
      left: 38,
      containLabel: false
    },
    legend: {
      show: true,
      top: 0,
      right: 0,
      orient: 'horizontal',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: {
        color: '#333333',
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Source Han Sans CN, Noto Sans SC, Arial, sans-serif'
      },
      data: ['北京方向', '上海方向']
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(24, 144, 255, 0.2)',
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: params => {
        const title = params?.[0]?.axisValue ? `${params[0].axisValue}时` : ''
        const rows = params.map(item => {
          const value = item.value ?? 0
          return `${item.marker}${item.seriesName}&nbsp;&nbsp;<b>${value}</b> 辆`
        })
        return [title, ...rows].join('<br/>')
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: '时',
      nameLocation: 'end',
      nameGap: 4,
      axisTick: { show: false },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(91, 187, 239, 0.75)', width: 1 }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto, Arial, sans-serif'
      },
      nameTextStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN, Noto Sans SC, Arial, sans-serif'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameLocation: 'end',
      nameGap: 8,
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(91, 187, 239, 0.22)', width: 1 }
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(91, 187, 239, 0.75)', width: 1 }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto, Arial, sans-serif'
      },
      nameTextStyle: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN, Noto Sans SC, Arial, sans-serif'
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        barWidth: 4,
        barGap: '20%',
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: '#1890ff'
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: {
            show: true,
            formatter: '建议分流',
            color: '#fa8c16',
            fontSize: 12,
            position: 'insideEndTop'
          },
          lineStyle: {
            color: '#fa8c16',
            type: 'dashed',
            width: 1
          },
          data: [{ yAxis: chart.threshold || 3000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        barWidth: 4,
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: '#38bdf8'
        }
      }
    ]
  }
}

const renderChart = chart => {
  const dom = chartRefs.value[chart.id]
  if (!dom) return

  if (!chartInstances.value[chart.id]) {
    chartInstances.value[chart.id] = echarts.init(dom)
  }
  chartInstances.value[chart.id].setOption(getBarChartOption(chart), true)

  if (!resizeObservers.value[chart.id]) {
    // 使用 ResizeObserver 跟随 flex 容器变化，避免 iframe/面板缩放后 canvas 尺寸失真。
    const observer = new ResizeObserver(() => {
      chartInstances.value[chart.id]?.resize()
    })
    observer.observe(dom)
    resizeObservers.value[chart.id] = observer
  }
}

const initCharts = async () => {
  await nextTick()
  requestAnimationFrame(() => {
    props.barChartList.forEach(chart => renderChart(chart))
  })
}

watch(
  () => props.barChartList,
  () => {
    // 数据变化后等待 DOM 与 flex 高度稳定，再更新 ECharts，确保 API 注入后图表同步刷新。
    initCharts()
  },
  { deep: true }
)

onMounted(async () => {
  await initCharts()
})

onUnmounted(() => {
  Object.values(resizeObservers.value).forEach(observer => observer?.disconnect())
  Object.values(chartInstances.value).forEach(instance => instance?.dispose())
  resizeObservers.value = {}
  chartInstances.value = {}
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.daily-total-section {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.section-header {
  flex: 0 0 31px;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
}

.section-title-wrap {
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

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5.0479230881px 5.0479230881px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.time-selector {
  flex: 0 0 100px;
  width: 100px;
  height: 30px;
}

/* scoped 下覆盖 antd 内部结构必须使用 :deep，保持 Figma 中 100×30 的轻量下拉外观。 */
.time-selector :deep(.ant-select-selector) {
  height: 30px !important;
  padding: 0 10px !important;
  border-radius: 0 !important;
  border: 1px solid rgba(24, 144, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.72) !important;
  box-shadow: none !important;
}

.time-selector :deep(.ant-select-selection-item) {
  font-size: 14px;
  font-weight: 400;
  line-height: 30px !important;
  color: #333333;
}

.time-selector :deep(.ant-select-arrow) {
  right: 10px;
  color: #333333;
  font-size: 10px;
}

.daily-total-body {
  flex: 0 0 91px;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  overflow: hidden;
  background-size: 426px 91px;
  background-position: center center;
  background-repeat: no-repeat;
}

.daily-stat-row {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px 18px 34px;
  box-sizing: border-box;
}

.daily-stat-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.daily-stat-card--tunnel {
  align-items: flex-end;
  text-align: right;
}

.daily-stat-card--bridge {
  align-items: flex-start;
  text-align: left;
}

.daily-stat-name {
  max-width: 132px;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.daily-stat-value {
  font-family: Roboto, DIN Alternate, Arial, sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28.125px;
  white-space: nowrap;
}

.daily-chart-list {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 3px 0;
  box-sizing: border-box;
  overflow: hidden;
}

.bar-chart-card {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bar-chart-title-row {
  flex: 0 0 21px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.chart-title-marker {
  width: 3px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
}

.bar-chart-title {
  min-width: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-shell {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chart-canvas {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}</style>