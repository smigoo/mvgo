<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-right">
        <HeaderTabs />
        <StatsRow />
      </div>
    </template>

    <div class="c-env-monitor-root">
      <ChartContainer />
    </div>
  </base-panel>
</template>
