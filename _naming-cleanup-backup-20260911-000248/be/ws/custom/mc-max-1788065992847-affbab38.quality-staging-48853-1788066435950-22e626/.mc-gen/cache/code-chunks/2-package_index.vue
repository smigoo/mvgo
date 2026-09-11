<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 1. 顶部统计栏 -->
      <HeaderStats
        :stats="headerStats"
        class="c-monitor-header-stats"
      />

      <!-- 2. 设备分类Tab -->
      <DeviceTabs
        :tabs="deviceTabs"
        :active-tab="activeTab"
        @tab-change="handleTabChange"
        class="c-monitor-device-tabs"
      />

      <!-- 3. 设备网格列表 -->
      <DeviceGrid
        :devices="currentDevices"
        class="c-monitor-device-grid"
      />
    </div>
  </base-panel>
</template>
