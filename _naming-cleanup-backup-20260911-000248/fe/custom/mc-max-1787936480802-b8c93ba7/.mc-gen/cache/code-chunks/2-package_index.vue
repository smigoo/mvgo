<template>
  <base-panel panelKey="default-panel" :class="['c-monitor-root', componentProps.themeType]">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-content">
      <HeaderStats />
      <MainStats />
      <DeviceGrid />
    </div>
  </base-panel>
</template>