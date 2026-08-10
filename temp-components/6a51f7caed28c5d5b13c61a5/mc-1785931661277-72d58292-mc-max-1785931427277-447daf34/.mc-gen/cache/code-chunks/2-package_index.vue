<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1785931427277-447daf34-container"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-max-1785931427277-447daf34-stats-row">
        <!-- 温度 -->
        <div class="c-mc-max-1785931427277-447daf34-stat-item">
          <img :src="icon1" class="c-mc-max-1785931427277-447daf34-stat-icon" />
          <div class="c-mc-max-1785931427277-447daf34-stat-info">
            <span class="c-mc-max-1785931427277-447daf34-stat-label">温度</span>
            <div class="c-mc-max-1785931427277-447daf34-stat-value-group">
              <span class="c-mc-max-1785931427277-447daf34-stat-value">25.5</span>
              <span class="c-mc-max-1785931427277-447daf34-stat-unit">℃</span>
            </div>
          </div>
        </div>
        
        <!-- 湿度 -->
        <div class="c-mc-max-1785931427277-447daf34-stat-item">
          <img :src="icon2" class="c-mc-max-1785931427277-447daf34-stat-icon" />
          <div class="c-mc-max-1785931427277-447daf34-stat-info">
            <span class="c-mc-max-1785931427277-447daf34-stat-label">湿度</span>
            <div class="c-mc-max-1785931427277-447daf34-stat-value-group">
              <span class="c-mc-max-1785931427277-447daf34-stat-value">60</span>
              <span class="c-mc-max-1785931427277-447daf34-stat-unit">%</span>
            </div>
          </div>
        </div>

        <!-- CO2浓度 -->
        <div class="c-mc-max-1785931427277-447daf34-stat-item">
          <img :src="icon3" class="c-mc-max-1785931427277-447daf34-stat-icon" />
          <div class="c-mc-max-1785931427277-447daf34-stat-info">
            <span class="c-mc-max-1785931427277-447daf34-stat-label">CO2浓度</span>
            <div class="c-mc-max-1785931427277-447daf34-stat-value-group">
              <span class="c-mc-max-1785931427277-447daf34-stat-value">400</span>
              <span class="c-mc-max-1785931427277-447daf34-stat-unit">ppm</span>
            </div>
          </div>
        </div>

        <!-- 能见度 -->
        <div class="c-mc-max-1785931427277-447daf34-stat-item">
          <img :src="icon4" class="c-mc-max-1785931427277-447daf34-stat-icon" />
          <div class="c-mc-max-1785931427277-447daf34-stat-info">
            <span class="c-mc-max-1785931427277-447daf34-stat-label">能见度</span>
            <div class="c-mc-max-1785931427277-447daf34-stat-value-group">
              <span class="c-mc-max-1785931427277-447daf34-stat-value">100</span>
              <span class="c-mc-max-1785931427277-447daf34-stat-unit">m</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>