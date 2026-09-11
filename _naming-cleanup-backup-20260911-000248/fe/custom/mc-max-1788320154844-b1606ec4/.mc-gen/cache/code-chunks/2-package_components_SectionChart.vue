<template>
  <div
    class="c-env-monitor-chart-section"
    :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <!-- 图例（右上角） -->
    <div class="c-env-monitor-chart-legend">
      <span class="c-env-monitor-legend-dot"></span>
      <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
    </div>
    <!-- CO 浓度面积图容器 -->
    <div ref="chartRef" class="c-env-monitor-chart-container"></div>
  </div>
</template>