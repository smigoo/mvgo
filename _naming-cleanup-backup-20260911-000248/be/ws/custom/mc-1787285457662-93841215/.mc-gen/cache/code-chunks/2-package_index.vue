<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <TotalTraffic />
      <TunnelChart />
      <BridgeChart />
      <VehicleType />
      <FlowForecast />
    </div>
  </base-panel>
</template>