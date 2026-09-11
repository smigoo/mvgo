<template>
  <base-panel panelKey="default-panel">
    <template #title_right>
      <span class="c-monitor-header-tip">*数据实时更新</span>
    </template>
    <div class="c-monitor-root">
      <TotalTraffic />
      <TunnelChart />
      <BridgeChart />
      <VehicleType />
      <FlowPrediction />
    </div>
  </base-panel>
</template>