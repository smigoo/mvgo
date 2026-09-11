<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <div class="c-device-monitor-stats">
        <div class="c-device-monitor-stat-item">
          <img :src="icon1" class="c-device-monitor-stat-icon" alt="设备总数" />
          <div class="c-device-monitor-stat-text">
            <span class="c-device-monitor-stat-label">设备总数</span>
            <span class="c-device-monitor-stat-value">{{ stats.total }}</span>
          </div>
        </div>
        <div class="c-device-monitor-stat-item">
          <img :src="icon2" class="c-device-monitor-stat-icon" alt="在线设备" />
          <div class="c-device-monitor-stat-text">
            <span class="c-device-monitor-stat-label">在线设备</span>
            <span class="c-device-monitor-stat-value online">{{ stats.online }}</span>
          </div>
        </div>
        <div class="c-device-monitor-stat-item">
          <img :src="icon3" class="c-device-monitor-stat-icon" alt="离线设备" />
          <div class="c-device-monitor-stat-text">
            <span class="c-device-monitor-stat-label">离线设备</span>
            <span class="c-device-monitor-stat-value offline">{{ stats.offline }}</span>
          </div>
        </div>
        <div class="c-device-monitor-stat-item">
          <img :src="icon4" class="c-device-monitor-stat-icon" alt="故障设备" />
          <div class="c-device-monitor-stat-text">
            <span class="c-device-monitor-stat-label">故障设备</span>
            <span class="c-device-monitor-stat-value error">{{ stats.error }}</span>
          </div>
        </div>
      </div>

      <div class="c-device-monitor-charts">
        <DeviceStatusChart class="c-device-monitor-chart-half" />
        <DeviceTrendChart class="c-device-monitor-chart-half" />
      </div>

      <DeviceAlarmList />
    </div>
  </base-panel>
</template>