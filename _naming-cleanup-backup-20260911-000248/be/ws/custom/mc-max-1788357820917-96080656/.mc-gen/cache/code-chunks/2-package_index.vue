<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-right">
        <div class="c-env-monitor-icon-btn" @click="handleViewSwitch('chart')">
          <img :src="icon1" class="c-env-monitor-view-icon" :class="{ active: viewMode === 'chart' }" />
        </div>
        <div class="c-env-monitor-icon-btn" @click="handleViewSwitch('list')">
          <img :src="icon2" class="c-env-monitor-view-icon" :class="{ active: viewMode === 'list' }" />
        </div>
        <div class="c-env-monitor-badge">
          <span class="c-env-monitor-badge-num">6</span>
        </div>
      </div>
    </template>

    <div class="c-env-monitor-body">
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-list">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            class="c-env-monitor-tab-item"
            :class="{ active: activeTab === tab.value }"
            @click="handleTabChange(tab.value)"
          >
            <div
              v-if="activeTab === tab.value"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: 'url(' + bg2 + ')' }"
            ></div>
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <div class="c-env-monitor-chart-section" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
        <ChartArea :active-tab="activeTab" :view-mode="viewMode" />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'

const ChartArea = defineAsyncComponent(() => import('./components/ChartArea.vue'))

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const activeTab = ref('co')
const viewMode = ref('chart')

const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'inner-light' },
  { label: '洞外光强', value: 'outer-light' },
]

const handleTabChange = (value) => {
  activeTab.value = value
}

const handleViewSwitch = (mode) => {
  viewMode.value = mode
}

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now(),
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>