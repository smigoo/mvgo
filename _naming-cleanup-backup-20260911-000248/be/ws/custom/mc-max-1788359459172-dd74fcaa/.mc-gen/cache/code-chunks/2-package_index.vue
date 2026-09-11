<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-icons">
        <img :src="icon1" class="c-env-monitor-header-icon" alt="柱状图" title="图表视图" />
        <div class="c-env-monitor-header-icon-badge-wrapper">
          <img :src="icon2" class="c-env-monitor-header-icon" alt="表格" title="表格视图" />
          <span class="c-env-monitor-badge">6</span>
        </div>
      </div>
    </template>

    <div class="c-env-monitor-body">
      <TabsSection
        :active-tab="activeTab"
        :bg2="bg2"
        @tab-change="handleTabChange"
      />
      <ChartSection :active-tab="activeTab" />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'

const TabsSection = defineAsyncComponent(() => import('./components/TabsSection.vue'))
const ChartSection = defineAsyncComponent(() => import('./components/ChartSection.vue'))

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const activeTab = ref('co')

const handleTabChange = (tab) => {
  activeTab.value = tab
}

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-header-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-header-icon-badge-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.c-env-monitor-header-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  background: #f53f3f;
  color: #ffffff;
  border-radius: 29px;
  font-family: 'PingFang SC', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  padding: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-env-monitor-body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
</style>