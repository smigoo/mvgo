<template>
  <section class="vehicle-type-section">
    <header class="section-sub-header">
      <div class="section-title-wrap">
        <img :src="titleIcon" alt="" class="section-title-icon" />
        <h2 class="section-title">车型分布</h2>
      </div>
    </header>

    <div class="vehicle-card-row">
      <article
        v-for="(item, index) in vehicleList"
        :key="item.id || item.title"
        class="vehicle-distribution-card"
      >
        <div
          class="vehicle-card-visual m-container"
          :style="{ backgroundImage: `url(${index === 0 ? tunnelBg : bridgeBg})` }"
        >
          <div class="vehicle-metric vehicle-metric--passenger">
            <span class="vehicle-label">{{ item.passengerLabel }}</span>
            <strong class="vehicle-value vehicle-value--passenger">{{ item.passengerValue }}</strong>
          </div>

          <div class="vehicle-chart-shell">
            <div :ref="el => setChartRef(el, index)" class="vehicle-donut-chart"></div>
          </div>

          <div class="vehicle-metric vehicle-metric--truck">
            <span class="vehicle-label">{{ item.truckLabel }}</span>
            <strong class="vehicle-value vehicle-value--truck">{{ item.truckValue }}</strong>
          </div>
        </div>

        <div
          class="vehicle-title-bg bg-container"
          :style="{ backgroundImage: `url(${index === 0 ? tunnelTitleBg : bridgeTitleBg})` }"
        >
          <span class="vehicle-place-title">{{ item.title }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

// 车型分布区块：负责渲染两个地点的客车/货车数据与环形图；背景图由主组件注入，图表数据使用 ref/props 响应式驱动，便于 API 绑定后刷新。
const props = defineProps({
  vehicleList: { type: Array, default: () => [] },
  tunnelBg: { type: String, default: '' },
  bridgeBg: { type: String, default: '' },
  tunnelTitleBg: { type: String, default: '' },
  bridgeTitleBg: { type: String, default: '' },
  titleIcon: { type: String, default: '' }
})

const emit = defineEmits(['chart-ready'])

const chartRefs = ref([])
const chartInstances = ref([])
const resizeObservers = ref([])

const setChartRef = (el, index) => {
  // v-for 下使用函数 ref，确保每个环形图 DOM 与数据索引稳定对应。
  if (el) {
    chartRefs.value[index] = el
  }
}

const buildDonutOption = item => {
  const passengerValue = Number(item.passengerData ?? item.passengerValue ?? 0)
  const truckValue = Number(item.truckData ?? item.truckValue ?? 0)

  return {
    color: ['#2ba0ff', '#ffa22f'],
    tooltip: {
      trigger: 'item',
      formatter: params => `${params.name}<br/>${params.value}辆 (${params.percent}%)`
    },
    legend: {
      show: false
    },
    series: [
      {
        name: item.title,
        type: 'pie',
        radius: ['62%', '82%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: '#edf4fb',
          borderWidth: 2
        },
        data: [
          { name: item.passengerLabel, value: passengerValue },
          { name: item.truckLabel, value: truckValue }
        ]
      }
    ]
  }
}

const renderCharts = () => {
  // 数据变化时复用已创建实例，仅更新 option，避免频繁 dispose 造成闪烁。
  props.vehicleList.forEach((item, index) => {
    const chart = chartInstances.value[index]
    if (chart) {
      chart.setOption(buildDonutOption(item), true)
      chart.resize()
    }
  })
}

const initCharts = () => {
  chartRefs.value.forEach((el, index) => {
    if (!el || chartInstances.value[index]) return

    const chart = echarts.init(el)
    chart.setOption(buildDonutOption(props.vehicleList[index] || {}))
    chartInstances.value[index] = chart

    // 使用 ResizeObserver 监听卡片尺寸，保证 flex 百分比布局变化后 canvas 同步缩放。
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)
    resizeObservers.value[index] = observer
  })

  emit('chart-ready')
}

watch(
  () => props.vehicleList,
  () => {
    renderCharts()
  },
  { deep: true }
)

onMounted(async () => {
  // 等待 Vue DOM 与 flex 布局稳定后再初始化 ECharts，避免图表容器高度未 settle。
  await nextTick()
  requestAnimationFrame(() => {
    initCharts()
  })
})

onUnmounted(() => {
  // 组件卸载时清理监听与图表实例，避免多次进入页面造成内存泄漏。
  resizeObservers.value.forEach(observer => observer?.disconnect())
  chartInstances.value.forEach(chart => chart?.dispose())
  resizeObservers.value = []
  chartInstances.value = []
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.vehicle-type-section {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.section-sub-header {
  flex: 0 0 24px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.section-title-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-width: 0;
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
}

.vehicle-card-row {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: space-between;
  gap: 3px;
  overflow: hidden;
}

.vehicle-distribution-card {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: hidden;
}

/* 背景图按 Figma 资源原始尺寸铺放，避免 cover 导致 191×80 装饰面板被裁切。 */
.vehicle-card-visual {
  position: relative;
  width: 100%;
  flex: 0 0 81px;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 17px 8px 10px;
  box-sizing: border-box;
  overflow: hidden;
  background-size: 100% 100%;
  background-position: left top;
  background-repeat: no-repeat;
}

.vehicle-metric {
  position: relative;
  z-index: 1;
  flex: 0 0 43px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.vehicle-metric--passenger {
  align-items: flex-start;
  text-align: left;
}

.vehicle-metric--truck {
  align-items: flex-end;
  text-align: right;
}

.vehicle-label {
  font-family: 'Alibaba PuHuiTi', 'Source Han Sans CN', Arial, sans-serif;
  font-size: 11.8px;
  font-weight: 400;
  line-height: 17.7px;
  color: #333333;
  white-space: nowrap;
}

.vehicle-value {
  font-family: Roboto, DIN Alternate, Arial, sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 17.7px;
  white-space: nowrap;
}

.vehicle-value--passenger {
  color: #1399ff;
}

.vehicle-value--truck {
  color: #ff6a00;
}

.vehicle-chart-shell {
  position: relative;
  z-index: 1;
  flex: 0 0 53px;
  width: 53px;
  height: 53px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.vehicle-donut-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.vehicle-title-bg {
  width: 130px;
  height: 25px;
  margin-top: 3px;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0;
  box-sizing: border-box;
  background-size: 130px 9px;
  background-position: center top;
  background-repeat: no-repeat;
}

.vehicle-place-title {
  max-width: 122px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Source Han Sans CN', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 17.7px;
  color: #333333;
  text-align: center;
}</style>