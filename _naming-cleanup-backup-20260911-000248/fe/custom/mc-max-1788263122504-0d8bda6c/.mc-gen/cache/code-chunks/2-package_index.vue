<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <DailyTotalFlow class="c-monitor-section" />
      <TunnelHourlyChart class="c-monitor-section" />
      <BridgeHourlyChart class="c-monitor-section" />
      <VehicleTypeDistribution class="c-monitor-section" />
      <FlowPrediction class="c-monitor-section" />
    </div>
  </base-panel>
</template>
