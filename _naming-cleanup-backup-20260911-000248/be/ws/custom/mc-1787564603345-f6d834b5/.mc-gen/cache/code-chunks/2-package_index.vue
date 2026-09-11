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
      <!-- 1. 当日总流量 -->
      <div class="c-monitor-section">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">当日总流量</span>
        </div>
        <div class="c-monitor-section-body">
          <!-- 总流量数值卡片(两列并排) -->
          <div class="c-monitor-total-cards">
            <div class="c-monitor-total-card">
              <span class="c-monitor-total-label">江阴靖江长江隧道</span>
              <div class="c-monitor-total-data">
                <span class="c-monitor-total-value">12,345</span>
                <span class="c-monitor-total-unit">辆次</span>
              </div>
            </div>
            <div class="c-monitor-total-card">
              <span class="c-monitor-total-label">江阴大桥</span>
              <div class="c-monitor-total-data">
                <span class="c-monitor-total-value">67,890</span>
                <span class="c-monitor-total-unit">辆次</span>
              </div>
            </div>
          </div>

          <!-- 江阴靖江长江隧道流量图 -->
          <div class="c-monitor-chart-block">
            <div class="c-monitor-chart-title">江阴靖江长江隧道流量图</div>
            <div ref="tunnelChartRef" class="c-monitor-chart-container"></div>
          </div>

          <!-- 江阴大桥流量图 -->
          <div class="c-monitor-chart-block">
            <div class="c-monitor-chart-title">江阴大桥流量图</div>
            <div ref="bridgeChartRef" class="c-monitor-chart-container"></div>
          </div>
        </div>
      </div>

      <!-- 2. 车型分布 -->
      <div class="c-monitor-section">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">车型分布</span>
        </div>
        <div class="c-monitor-section-body">
          <!-- 江阴靖江长江隧道车型 -->
          <div class="c-monitor-vehicle-group">
            <div class="c-monitor-vehicle-title">江阴靖江长江隧道</div>
            <div class="c-monitor-stat-items">
              <div class="c-monitor-stat-item">
                <img :src="icon1" class="c-monitor-stat-icon" />
                <span class="c-monitor-stat-label">客车</span>
                <span class="c-monitor-stat-value">8,500</span>
              </div>
              <div class="c-monitor-stat-item">
                <img :src="icon2" class="c-monitor-stat-icon" />
                <span class="c-monitor-stat-label">货车</span>
                <span class="c-monitor-stat-value">3,845</span>
              </div>
            </div>
          </div>

          <!-- 江阴大桥车型 -->
          <div class="c-monitor-vehicle-group">
            <div class="c-monitor-vehicle-title">江阴大桥</div>
            <div class="c-monitor-stat-items">
              <div class="c-monitor-stat-item">
                <img :src="icon3" class="c-monitor-stat-icon" />
                <span class="c-monitor-stat-label">客车</span>
                <span class="c-monitor-stat-value">50,000</span>
              </div>
              <div class="c-monitor-stat-item">
                <img :src="icon4" class="c-monitor-stat-icon" />
                <span class="c-monitor-stat-label">货车</span>
                <span class="c-monitor-stat-value">17,890</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. 流量预测 -->
      <div class="c-monitor-section">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">流量预测</span>
        </div>
        <div class="c-monitor-section-body">
          <div ref="forecastChartRef" class="c-monitor-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>