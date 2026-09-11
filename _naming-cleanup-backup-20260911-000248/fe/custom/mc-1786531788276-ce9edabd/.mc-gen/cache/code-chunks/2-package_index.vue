<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- 顶部统计区 -->
      <div class="c-device-monitor-stats">
        <div 
          class="c-device-monitor-stat-item" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-stat-icon-wrapper">
            <img :src="icon1" class="c-device-monitor-stat-icon" />
          </div>
          <div class="c-device-monitor-stat-info">
            <span class="c-device-monitor-stat-label">设备总数</span>
            <span class="c-device-monitor-stat-value">{{ totalDevices }}</span>
          </div>
        </div>
        
        <div 
          class="c-device-monitor-stat-item" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-stat-icon-wrapper">
            <img :src="icon2" class="c-device-monitor-stat-icon" />
          </div>
          <div class="c-device-monitor-stat-info">
            <span class="c-device-monitor-stat-label">在线设备</span>
            <span class="c-device-monitor-stat-value">{{ onlineDevices }}</span>
          </div>
        </div>
        
        <div 
          class="c-device-monitor-stat-item" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-stat-icon-wrapper">
            <img :src="icon3" class="c-device-monitor-stat-icon" />
          </div>
          <div class="c-device-monitor-stat-info">
            <span class="c-device-monitor-stat-label">离线设备</span>
            <span class="c-device-monitor-stat-value">{{ offlineDevices }}</span>
          </div>
        </div>
        
        <div 
          class="c-device-monitor-stat-item" 
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-stat-icon-wrapper">
            <img :src="icon4" class="c-device-monitor-stat-icon" />
          </div>
          <div class="c-device-monitor-stat-info">
            <span class="c-device-monitor-stat-label">故障设备</span>
            <span class="c-device-monitor-stat-value">{{ faultDevices }}</span>
          </div>
        </div>
      </div>

      <!-- 中部图表区 -->
      <div class="c-device-monitor-charts">
        <div class="c-device-monitor-chart-card">
          <div class="c-device-monitor-chart-header">
            <span class="c-device-monitor-chart-title">设备状态分布</span>
          </div>
          <div class="c-device-monitor-chart-body">
            <div ref="statusChartRef" class="c-device-monitor-chart-container"></div>
          </div>
        </div>
        
        <div class="c-device-monitor-chart-card">
          <div class="c-device-monitor-chart-header">
            <span class="c-device-monitor-chart-title">设备在线趋势</span>
          </div>
          <div class="c-device-monitor-chart-body">
            <div ref="trendChartRef" class="c-device-monitor-chart-container"></div>
          </div>
        </div>
      </div>

      <!-- 底部列表区 -->
      <div class="c-device-monitor-list-section">
        <div class="c-device-monitor-list-header">
          <span class="c-device-monitor-list-title">设备运行明细</span>
        </div>
        <div class="c-device-monitor-list-body">
          <a-table 
            :columns="columns" 
            :data-source="tableData" 
            :pagination="false" 
            size="small"
            class="c-device-monitor-table"
          />
        </div>
      </div>
    </div>
  </base-panel>
</template>