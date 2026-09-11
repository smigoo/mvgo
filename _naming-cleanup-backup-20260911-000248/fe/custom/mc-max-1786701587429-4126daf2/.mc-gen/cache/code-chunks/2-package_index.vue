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
      <div class="c-monitor-filter-bar">
        <div class="c-monitor-time-filter">
          <span class="c-monitor-time-item active">24小时</span>
          <span class="c-monitor-time-item">7天</span>
          <span class="c-monitor-time-item">30天</span>
        </div>
      </div>

      <MonitorStats />

      <div class="c-monitor-content">
        <div class="c-monitor-trend-section">
          <div class="c-monitor-section-header">
            <span class="c-monitor-section-title">流量趋势</span>
          </div>
          <MonitorTrend />
        </div>
        
        <div class="c-monitor-dist-section">
          <div class="c-monitor-section-header">
            <span class="c-monitor-section-title">车型分布</span>
          </div>
          <MonitorDistribution />
        </div>
      </div>
    </div>
  </base-panel>
</template>