<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <HeaderTabs
        :active-tab="activeTab"
        :icon1="icon1"
        :icon2="icon2"
        @tab-change="handleTabChange"
      />
      <ChartArea
        :active-tab="activeTab"
        :bg1="bg1"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'

const HeaderTabs = defineAsyncComponent(() => import('./components/HeaderTabs.vue'))
const ChartArea = defineAsyncComponent(() => import('./components/ChartArea.vue'))

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const activeTab = ref('一氧化碳')

const handleTabChange = (tab) => {
  activeTab.value = tab
}

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>