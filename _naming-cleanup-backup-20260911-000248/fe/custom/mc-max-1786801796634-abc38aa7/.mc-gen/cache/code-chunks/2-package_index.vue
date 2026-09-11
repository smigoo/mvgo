<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-root" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-monitor-content">
        <div class="c-monitor-header-section">
          <SummaryStats />
        </div>
        
        <div class="c-monitor-body-section">
          <div class="c-monitor-left-panel">
            <FlowTrend />
          </div>
          <div class="c-monitor-right-panel">
            <VehicleDistribution />
          </div>
        </div>
        
        <div class="c-monitor-footer-section">
          <TrafficForecast />
        </div>
      </div>
    </div>
  </base-panel>
</template>