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
      <EnvStatsOverview
        class="c-env-monitor-stats"
        :point-icon="icon1"
        :alarm-icon="icon2"
        :point-count="pointCount"
        :alarm-count="alarmCount"
      />

      <EnvMonitorTabs
        class="c-env-monitor-tabs"
        :tabs="monitorTabs"
        :active-tab="activeTab"
        :active-bg="bgtabActive"
        :tab-icon="icontabsIcon"
        @tab-change="handleTabChange"
      />

      <EnvMonitorChart
        class="c-env-monitor-chart"
        :active-tab="activeTab"
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


import EnvStatsOverview from './components/EnvStatsOverview.vue'
import EnvMonitorTabs from './components/EnvMonitorTabs.vue'
import EnvMonitorChart from './components/EnvMonitorChart.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[c-env-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const pointCount = ref(128)
const alarmCount = ref(3)

const monitorTabs = ref([
  { key: 'temperature', label: '温度' },
  { key: 'humidity', label: '湿度' },
  { key: 'co2', label: 'CO2浓度' },
  { key: 'visibility', label: '能见度' }
])

const activeTab = ref('temperature')

// --- 事件处理 ---
const handleTabChange = (tabKey) => {
  activeTab.value = tabKey
}

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听或定时器
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>