<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 指标切换与工具栏：监测指标 Tab + 视图切换图标 -->
      <EnvMonitorControls
        class="c-env-monitor-controls-block"
        :tabs="tabs"
        :active-tab="activeTab"
        :active-view="activeView"
        :view-badge="viewBadge"
        @tab-change="handleTabChange"
        @view-change="handleViewChange"
      />

      <!-- 浓度趋势图区域 -->
      <EnvMonitorChart
        class="c-env-monitor-chart-block"
        :active-tab="activeTab"
        :chart-data="chartData"
      />
    </div>
  </base-panel>
</template>