<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <TabControls 
        :tabs="tabs" 
        :active-tab="activeTab"
        @tab-change="handleTabChange"
      />

      <!-- 统计数值区 -->
      <StatsValue :stats-data="statsData" />

      <!-- 面积图区域 -->
      <ChartArea 
        :chart-data="chartData"
        :active-tab="activeTab"
      />
    </div>
  </base-panel>
</template>
