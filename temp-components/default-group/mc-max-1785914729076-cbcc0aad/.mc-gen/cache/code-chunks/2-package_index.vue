<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1785914729076-cbcc0aad-main" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 环境指标卡片 -->
      <div class="c-mc-max-1785914729076-cbcc0aad-stats-grid">
        <div class="c-mc-max-1785914729076-cbcc0aad-stat-item">
          <img :src="icon1" class="c-mc-max-1785914729076-cbcc0aad-stat-icon" />
          <div class="c-mc-max-1785914729076-cbcc0aad-stat-text">
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-label">温度</span>
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-value">24.5<small>℃</small></span>
          </div>
        </div>
        <div class="c-mc-max-1785914729076-cbcc0aad-stat-item">
          <img :src="icon2" class="c-mc-max-1785914729076-cbcc0aad-stat-icon" />
          <div class="c-mc-max-1785914729076-cbcc0aad-stat-text">
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-label">湿度</span>
            <span class="c-mc-max-1785914729076-cbcc0aad-stat-value">65<small>%</small></span>
          </div>
        </div>
      </div>

      <!-- 趋势图表 -->
      <div class="c-mc-max-1785914729076-cbcc0aad-chart-section">
        <div class="c-mc-max-1785914729076-cbcc0aad-chart-header">
          <span class="c-mc-max-1785914729076-cbcc0aad-section-title">24小时环境趋势</span>
        </div>
        <div class="c-mc-max-1785914729076-cbcc0aad-chart-wrapper">
          <div ref="chartRef" class="c-mc-max-1785914729076-cbcc0aad-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>