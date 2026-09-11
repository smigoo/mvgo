<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 环境类型切换区 -->
      <HeaderTabs />
      
      <!-- 统计指标区 -->
      <StatsRow />
      
      <!-- 趋势图表区 -->
      <ChartArea />
    </div>
  </base-panel>
</template>
