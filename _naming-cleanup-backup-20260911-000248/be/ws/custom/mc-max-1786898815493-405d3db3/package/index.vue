<template>
  <base-panel panelKey="default-panel">
    <div
      class="c-env-monitor-root"
      :style="{
        backgroundImage: `url(${bg3})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <EnvironmentTabs
        :tabs="tabList"
        :active-tab="activeTab"
        :active-background="bgtabActive"
        :tab-icon="icontabsIcon"
        @tab-change="handleTabChange"
      />
      <MetricCards
        :cards="metricCards"
        :icon1="icon1"
        :icon2="icon2"
      />
      <TrendChart
        :chart-data="trendData"
        :loading="chartLoading"
      />
    </div>
  </base-panel>
</template>
<script setup>
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/g-7883.png'
import icon2 from '../resources/images/tabs-icon-43.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import EnvironmentTabs from './components/EnvironmentTabs.vue'
import MetricCards from './components/MetricCards.vue'
import TrendChart from './components/TrendChart.vue'

let runtimeBuilder = null
let componentApi = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'c-env-monitor',
        componentProps: {},
        componentName: '环境监测'
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentApi = builder?.componentApi || null
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-env-monitor] $mcComponentBuilder 失败:', e)
}

const tabList = [
  { key: 'air', label: '空气质量' },
  { key: 'noise', label: '噪声监测' },
  { key: 'water', label: '水质监测' }
]

const activeTab = ref('air')
const metricCards = ref([])
const trendData = ref({
  categories: [],
  series: []
})
const chartLoading = ref(false)

const tabDataMap = {
  air: {
    cards: [
      { id: 'pm25', label: 'PM2.5', value: 18, unit: 'μg/m³', iconType: 'icon1', status: 'good' },
      { id: 'pm10', label: 'PM10', value: 36, unit: 'μg/m³', iconType: 'icon2', status: 'good' },
      { id: 'temp', label: '温度', value: 24.6, unit: '℃', iconType: 'icon1', status: 'normal' },
      { id: 'humidity', label: '湿度', value: 62, unit: '%RH', iconType: 'icon2', status: 'normal' },
      { id: 'wind', label: '风速', value: 2.4, unit: 'm/s', iconType: 'icon1', status: 'normal' },
      { id: 'noise', label: '噪声', value: 48, unit: 'dB', iconType: 'icon2', status: 'good' }
    ],
    trend: {
      categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      series: [
        { name: 'PM2.5', data: [22, 20, 18, 16, 17, 19, 18] },
        { name: 'PM10', data: [40, 38, 35, 33, 34, 36, 36] }
      ]
    }
  },
  noise: {
    cards: [
      { id: 'noise-avg', label: '平均噪声', value: 52, unit: 'dB', iconType: 'icon1', status: 'normal' },
      { id: 'noise-max', label: '最大噪声', value: 71, unit: 'dB', iconType: 'icon2', status: 'bad' },
      { id: 'noise-min', label: '最小噪声', value: 36, unit: 'dB', iconType: 'icon1', status: 'good' },
      { id: 'noise-count', label: '超标次数', value: 3, unit: '次', iconType: 'icon2', status: 'bad' },
      { id: 'noise-cover', label: '监测覆盖率', value: 98, unit: '%', iconType: 'icon1', status: 'good' },
      { id: 'noise-points', label: '监测点位', value: 12, unit: '个', iconType: 'icon2', status: 'normal' }
    ],
    trend: {
      categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      series: [
        { name: '平均噪声', data: [46, 44, 52, 58, 56, 50, 48] },
        { name: '最大噪声', data: [62, 58, 70, 75, 72, 66, 64] }
      ]
    }
  },
  water: {
    cards: [
      { id: 'ph', label: 'pH值', value: 7.2, unit: '', iconType: 'icon1', status: 'good' },
      { id: 'turbidity', label: '浊度', value: 1.8, unit: 'NTU', iconType: 'icon2', status: 'good' },
      { id: 'do', label: '溶解氧', value: 6.4, unit: 'mg/L', iconType: 'icon1', status: 'normal' },
      { id: 'cod', label: 'COD', value: 12.5, unit: 'mg/L', iconType: 'icon2', status: 'normal' },
      { id: 'nh3', label: '氨氮', value: 0.12, unit: 'mg/L', iconType: 'icon1', status: 'good' },
      { id: 'flow', label: '流量', value: 1.6, unit: 'm³/s', iconType: 'icon2', status: 'normal' }
    ],
    trend: {
      categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      series: [
        { name: '浊度', data: [1.2, 1.4, 2.0, 2.3, 1.9, 1.6, 1.5] },
        { name: '溶解氧', data: [7.0, 6.8, 6.2, 5.8, 6.1, 6.5, 6.4] }
      ]
    }
  }
}

const updateDataByTab = (key) => {
  const data = tabDataMap[key] || tabDataMap[tabList[0].key]
  chartLoading.value = true
  metricCards.value = data.cards
  trendData.value = data.trend
  // 用微任务结束 loading 状态，模拟数据切换完成
  queueMicrotask(() => { chartLoading.value = false })
}

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  updateDataByTab(key)
}

onMounted(() => {
  updateDataByTab(activeTab.value)

  if (runtimeBuilder) {
    try {
      runtimeBuilder.publishEvent('env-monitor-onload', {
        componentId: 'c-env-monitor',
        timestamp: Date.now()
      })
    } catch (e) {
      console.warn('[c-env-monitor] onload 事件发布失败:', e)
    }
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>