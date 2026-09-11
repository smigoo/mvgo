<template>
  <base-panel panelKey="default-panel">
    <div class="c-traffic-monitor-root">
      <TotalTraffic />
      <HourlyFlowChart />
      <VehicleDistribution />
      <TrafficPrediction />
    </div>
  </base-panel>
</template>

<script setup>
import {ref, reactive, computed, watch, provide} from 'vue'
import TotalTraffic from './components/TotalTraffic.vue'
import HourlyFlowChart from './components/HourlyFlowChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficPrediction from './components/TrafficPrediction.vue'

// --- $mcComponentBuilder 初始化 ---
let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder({
    componentId: 'c-monitor',
    componentProps: {},
    componentName: 'c-monitor'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// --- 常量与配置 ---
const TIME_RANGE_OPTIONS = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

// --- 响应式状态 ---
const activeTimeRange = ref('24h')

const totalTrafficData = reactive({
  totalFlow: 0,
  passengerCars: 0,
  freightVehicles: 0,
  abnormalVehicles: 0
})

const hourlyFlowData = ref([])
const vehicleDistributionData = ref([])
const trafficPredictionData = ref([])

// --- 计算属性 ---
const timeRangeLabel = computed(() => {
  const item = TIME_RANGE_OPTIONS.find(opt => opt.value === activeTimeRange.value)
  return item ? item.label : '24小时'
})

// --- 数据共享 ---
provide('totalTrafficData', totalTrafficData)
provide('hourlyFlowData', hourlyFlowData)
provide('vehicleDistributionData', vehicleDistributionData)
provide('trafficPredictionData', trafficPredictionData)
provide('componentApi', componentApi)

// --- 工具函数定义 ---
const fetchTotalTraffic = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindOne({ timeRange: activeTimeRange.value }, 'totalTraffic')
    if (res) {
      Object.assign(totalTrafficData, res)
    }
  } catch (e) {
    console.error('获取总流量失败:', e)
  }
}

const fetchHourlyFlow = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindList({ timeRange: activeTimeRange.value }, 'hourlyFlow')
    hourlyFlowData.value = res || []
  } catch (e) {
    console.error('获取小时流量失败:', e)
  }
}

const fetchVehicleDistribution = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindList({ timeRange: activeTimeRange.value }, 'vehicleDistribution')
    vehicleDistributionData.value = res || []
  } catch (e) {
    console.error('获取车型分布失败:', e)
  }
}

const fetchTrafficPrediction = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindList({ timeRange: activeTimeRange.value }, 'trafficPrediction')
    trafficPredictionData.value = res || []
  } catch (e) {
    console.error('获取交通预测失败:', e)
  }
}

const fetchAllData = async () => {
  await Promise.all([
    fetchTotalTraffic(),
    fetchHourlyFlow(),
    fetchVehicleDistribution(),
    fetchTrafficPrediction()
  ])
}

// --- Watch 定义 ---
watch(activeTimeRange, () => {
  fetchAllData()
})

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-traffic-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 预留清理逻辑：父组件无监听及定时器，后续如需清理可在此补充
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>