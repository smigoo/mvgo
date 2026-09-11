<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-view-toggle">
        <div
          class="c-env-monitor-view-btn"
          :class="{ active: viewMode === 'chart' }"
          @click="viewMode = 'chart'"
        >
          <img :src="icon2" class="c-env-monitor-view-icon" alt="图表视图" />
        </div>
        <div
          class="c-env-monitor-view-btn"
          :class="{ active: viewMode === 'list' }"
          @click="viewMode = 'list'"
        >
          <img :src="icon1" class="c-env-monitor-view-icon" alt="列表视图" />
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