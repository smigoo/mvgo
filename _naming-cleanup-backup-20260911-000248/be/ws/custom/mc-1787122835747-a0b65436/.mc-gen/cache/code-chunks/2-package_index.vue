<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-root" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <TotalTraffic />
      <HourlyFlowChart />
      <VehicleTypeDistribution />
      <FlowForecast />
    </div>
  </base-panel>
</template>