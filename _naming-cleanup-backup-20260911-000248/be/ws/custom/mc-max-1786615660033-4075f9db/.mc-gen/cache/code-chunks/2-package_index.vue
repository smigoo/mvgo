<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-layout" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-stats-section">
        <TotalTraffic />
      </div>

      <div class="c-monitor-trend-section">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">流量趋势</span>
          <div class="c-monitor-time-filter">
            <span 
              v-for="item in timeTabs" 
              :key="item.value" 
              :class="['c-monitor-filter-item', { 'is-active': activeTime === item.value }]"
              @click="activeTime = item.value"
            >
              {{ item.label }}
            </span>
          </div>
        </div>
        <div class="c-monitor-chart-area">
          <TrafficTrend :time-type="activeTime" />
        </div>
      </div>

      <div class="c-monitor-distribution-section">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">车型分布</span>
        </div>
        <div class="c-monitor-chart-area">
          <VehicleDistribution />
        </div>
      </div>
    </div>
  </base-panel>
</template>