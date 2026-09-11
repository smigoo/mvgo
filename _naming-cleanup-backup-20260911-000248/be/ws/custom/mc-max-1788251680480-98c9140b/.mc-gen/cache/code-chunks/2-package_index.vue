<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 监测类型切换 + 右侧控件组 -->
      <div class="c-env-monitor-header">
        <MonitorTypeTabs />
        <HeaderControls />
      </div>

      <!-- 折线图表区 -->
      <div class="c-env-monitor-chart-section">
        <ChartArea />
      </div>
    </div>
  </base-panel>
</template>
