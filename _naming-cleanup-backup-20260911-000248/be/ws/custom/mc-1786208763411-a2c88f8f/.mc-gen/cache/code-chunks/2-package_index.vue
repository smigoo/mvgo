<template>
  <base-panel panelKey="default-panel">
    <div class="c-ff0ff1-container">
      <!-- 实时环境指标区域 -->
      <div class="c-ff0ff1-metrics-section">
        <EnvMetrics />
      </div>

      <!-- 环境趋势图表区域 -->
      <div 
        class="c-ff0ff1-trend-section" 
        :style="{ 
          backgroundImage: `url(${bg1})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <EnvTrend />
      </div>

      <!-- 设备状态与告警区域 -->
      <div class="c-ff0ff1-devices-section">
        <EnvDevices />
      </div>
    </div>
  </base-panel>
</template>