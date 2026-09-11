<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-1785980184402-c71ffb16-container">
      <!-- 设备状态统计 -->
      <div 
        class="c-mc-1785980184402-c71ffb16-stats-section"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div 
          v-for="stat in statsData" 
          :key="stat.key" 
          class="c-mc-1785980184402-c71ffb16-stat-item"
        >
          <img :src="stat.icon" class="c-mc-1785980184402-c71ffb16-stat-icon" />
          <div class="c-mc-1785980184402-c71ffb16-text-group">
            <span class="c-mc-1785980184402-c71ffb16-stat-label">{{ stat.label }}</span>
            <span class="c-mc-1785980184402-c71ffb16-stat-value">{{ stat.value }}</span>
          </div>
        </div>
      </div>

      <!-- 设备状态分布图表 -->
      <div class="c-mc-1785980184402-c71ffb16-chart-section">
        <div class="c-mc-1785980184402-c71ffb16-section-header">
          <span class="c-mc-1785980184402-c71ffb16-section-title">设备状态分布</span>
        </div>
        <div class="c-mc-1785980184402-c71ffb16-chart-wrapper">
          <div ref="chartRef" class="c-mc-1785980184402-c71ffb16-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>