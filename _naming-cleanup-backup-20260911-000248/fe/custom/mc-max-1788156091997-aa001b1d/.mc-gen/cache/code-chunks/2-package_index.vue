<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-icons">
        <img :src="icon1" class="c-env-monitor-icon" alt="图表图标" />
        <img :src="icon2" class="c-env-monitor-icon" alt="文档图标" />
      </div>
    </template>

    <div class="c-env-monitor-root">
      <!-- 1. 指标切换tabs区 -->
      <TabSwitch
        :active-tab="activeTab"
        @tab-change="handleTabChange"
      />

      <!-- 2. 面积图区域 -->
      <ChartArea
        :chart-type="activeTab"
      />
    </div>
  </base-panel>
</template>
