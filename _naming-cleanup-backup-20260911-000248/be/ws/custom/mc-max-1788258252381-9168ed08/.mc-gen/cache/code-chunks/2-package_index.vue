<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-monitor-header-diamond"></div>
    </template>
    <div class="c-monitor-root">
      <DailyTotalFlow />
      <TunnelHourlyFlow />
      <BridgeHourlyFlow />
      <VehicleTypeDistribution />
      <FlowPrediction />
    </div>
  </base-panel>
</template>