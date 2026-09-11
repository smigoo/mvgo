<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-root" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- 顶部核心指标统计区 -->
      <div class="c-monitor-stats-section">
        <TotalStats 
          :stat-icons="[icon1, icon2, icon3, icon4]" 
        />
      </div>

      <!-- 中部流量趋势分析区 -->
      <div class="c-monitor-trend-section">
        <FlowTrend />
      </div>

      <!-- 底部车型分布与实时过车区 -->
      <div class="c-monitor-distribution-section">
        <VehicleDistribution />
      </div>
    </div>
  </base-panel>
</template>