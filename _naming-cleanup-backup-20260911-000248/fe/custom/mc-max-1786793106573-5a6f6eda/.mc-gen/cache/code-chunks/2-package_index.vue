<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <MonitorStats />
      <div class="c-monitor-content">
        <FlowTrend />
        <VehicleType />
      </div>
    </div>
  </base-panel>
</template>