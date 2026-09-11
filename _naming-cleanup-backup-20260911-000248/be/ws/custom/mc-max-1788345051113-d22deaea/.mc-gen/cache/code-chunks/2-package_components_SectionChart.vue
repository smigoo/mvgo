<template>
  <div class="c-env-monitor-chart-section" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <div class="c-env-monitor-chart-header">
      <div class="c-env-monitor-legend">
        <span class="c-env-monitor-legend-item">
          <i class="c-env-monitor-legend-dot"></i>
          zk3+785CO浓度
        </span>
      </div>
    </div>
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>