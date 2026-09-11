<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <div class="c-monitor-title-row">
        <h1 class="c-monitor-title">流量监测</h1>
        <button class="c-monitor-time-select" type="button" @click="handleTabChange('24h')">
          24小时
          <span class="c-monitor-time-arrow">⌄</span>
        </button>
      </div>

      <section class="c-monitor-stats-section">
        <MonitorStats :stats="statsData" :icons="[icon1, icon2, icon3]" />
      </section>

      <section class="c-monitor-content-section">
        <MonitorTrend :time-tab="activeTimeTab" />
      </section>

      <section class="c-monitor-distribution-section">
        <div class="c-monitor-section-heading">车型分布</div>
        <MonitorDistribution :time-tab="activeTimeTab" />
      </section>

      <section class="c-monitor-prediction-section">
        <MonitorPrediction :time-tab="activeTimeTab" />
      </section>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, defineAsyncComponent, onMounted } from 'vue'
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/Vector-3549.png'
import icon3 from '../resources/images/icon-3561.png'

const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
const runtimeBuilder = builder?.runtimeBuilder || null
const componentProps = builder?.componentProps || {}

const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
const MonitorTrend = defineAsyncComponent(() => import('./components/MonitorTrend.vue'))
const MonitorDistribution = defineAsyncComponent(() => import('./components/MonitorDistribution.vue'))
const MonitorPrediction = defineAsyncComponent(() => import('./components/MonitorPrediction.vue'))

const activeTimeTab = ref('24h')
const timeTabs = [{ label: '24小时', value: '24h' }]
const statsData = ref([
  { label: '江阴靖江长江隧道', value: '34,620', unit: '辆' },
  { label: '江阴大桥', value: '82,379', unit: '辆' }
])

const handleTabChange = (value) => {
  if (timeTabs.some((tab) => tab.value === value)) activeTimeTab.value = value
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: componentProps.componentId || 'monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less">
@import '../resources/styles/index.less';

.c-monitor-stats-section {
  background-image: url('../resources/images/bg-_m-34.png');
}
</style>
