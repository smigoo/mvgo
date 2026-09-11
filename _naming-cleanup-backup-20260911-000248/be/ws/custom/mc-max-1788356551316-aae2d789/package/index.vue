<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-view-toggle">
        <div
          class="c-env-monitor-view-btn"
          :class="{ active: viewMode === 'chart' }"
          @click="viewMode = 'chart'"
        >
          <img class="c-env-monitor-view-icon" alt="图表视图" />
        </div>
        <div
          class="c-env-monitor-view-btn"
          :class="{ active: viewMode === 'list' }"
          @click="viewMode = 'list'"
        >
          <img class="c-env-monitor-view-icon" alt="列表视图" />
        </div>
      </div>
    </template>

    <div class="c-env-monitor-body">
      <TabSwitcher
        :active-tab="activeTab"
        :bg-tab-active="bgtabActive"
        @tab-change="handleTabChange"
      />
      <StatsControls
        :current-value="currentValue"
        :location-text="locationText"
        :threshold-text="thresholdText"
        :bg2="bg2"
      />
      <ChartArea
        :active-tab="activeTab"
      />
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-tab-active-7891.png'
const bgtabActive = bg2


import { ref, onMounted} from 'vue'
import TabSwitcher from './components/TabSwitcher.vue'
import StatsControls from './components/StatsControls.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 解构（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 视图模式：图表/列表
const viewMode = ref('chart')

// 当前激活的 Tab
const activeTab = ref('一氧化碳')

// 统计数值区状态
const currentValue = ref('40')
const locationText = ref('zk3+785CO浓度')
const thresholdText = ref('预警线')

// Tab 切换处理
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
</style>