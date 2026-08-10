<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-max-1785937591393-2c7bb8ed-container" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 顶部统计区 -->
      <div class="c-mc-max-1785937591393-2c7bb8ed-stats-section">
        <div class="c-mc-max-1785937591393-2c7bb8ed-stat-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-icon-wrapper">
            <img :src="icon1" class="c-mc-max-1785937591393-2c7bb8ed-stat-icon" />
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-info">
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-label">设备总数</span>
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-value">{{ totalDevices }}</span>
          </div>
        </div>
        <div class="c-mc-max-1785937591393-2c7bb8ed-stat-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-icon-wrapper">
            <img :src="icon2" class="c-mc-max-1785937591393-2c7bb8ed-stat-icon" />
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-info">
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-label">在线设备</span>
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-value">{{ onlineDevices }}</span>
          </div>
        </div>
        <div class="c-mc-max-1785937591393-2c7bb8ed-stat-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-icon-wrapper">
            <img :src="icon3" class="c-mc-max-1785937591393-2c7bb8ed-stat-icon" />
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-info">
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-label">离线设备</span>
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-value">{{ offlineDevices }}</span>
          </div>
        </div>
        <div class="c-mc-max-1785937591393-2c7bb8ed-stat-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-icon-wrapper">
            <img :src="icon4" class="c-mc-max-1785937591393-2c7bb8ed-stat-icon" />
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-stat-info">
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-label">故障设备</span>
            <span class="c-mc-max-1785937591393-2c7bb8ed-stat-value">{{ faultDevices }}</span>
          </div>
        </div>
      </div>

      <!-- 中部图表区 -->
      <div class="c-mc-max-1785937591393-2c7bb8ed-charts-section">
        <!-- 左侧：设备状态分布 -->
        <div class="c-mc-max-1785937591393-2c7bb8ed-chart-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-section-header">
            <span class="c-mc-max-1785937591393-2c7bb8ed-section-title">设备状态分布</span>
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-chart-wrapper">
            <div ref="statusChartRef" class="c-mc-max-1785937591393-2c7bb8ed-chart-container"></div>
          </div>
        </div>

        <!-- 右侧：设备在线趋势 -->
        <div class="c-mc-max-1785937591393-2c7bb8ed-chart-card">
          <div class="c-mc-max-1785937591393-2c7bb8ed-section-header">
            <span class="c-mc-max-1785937591393-2c7bb8ed-section-title">设备在线趋势</span>
            <div class="c-mc-max-1785937591393-2c7bb8ed-tab-group">
              <span 
                v-for="tab in trendTabs" 
                :key="tab.key" 
                :class="['c-mc-max-1785937591393-2c7bb8ed-tab-item', { 'c-mc-max-1785937591393-2c7bb8ed-tab-item--active': activeTrendTab === tab.key }]"
                @click="activeTrendTab = tab.key"
              >
                {{ tab.label }}
              </span>
            </div>
          </div>
          <div class="c-mc-max-1785937591393-2c7bb8ed-chart-wrapper">
            <div ref="trendChartRef" class="c-mc-max-1785937591393-2c7bb8ed-chart-container"></div>
          </div>
        </div>
      </div>

      <!-- 底部：设备告警列表 -->
      <div class="c-mc-max-1785937591393-2c7bb8ed-list-section">
        <div class="c-mc-max-1785937591393-2c7bb8ed-section-header">
          <span class="c-mc-max-1785937591393-2c7bb8ed-section-title">设备告警记录</span>
        </div>
        <div class="c-mc-max-1785937591393-2c7bb8ed-list-wrapper">
          <div v-for="item in alarmList" :key="item.id" class="c-mc-max-1785937591393-2c7bb8ed-list-item">
            <div class="c-mc-max-1785937591393-2c7bb8ed-list-item-left">
              <span :class="['c-mc-max-1785937591393-2c7bb8ed-alarm-dot', `c-mc-max-1785937591393-2c7bb8ed-alarm-dot--${item.level}`]"></span>
              <span class="c-mc-max-1785937591393-2c7bb8ed-alarm-device">{{ item.deviceName }}</span>
              <span class="c-mc-max-1785937591393-2c7bb8ed-alarm-content">{{ item.content }}</span>
            </div>
            <div class="c-mc-max-1785937591393-2c7bb8ed-list-item-right">
              <span class="c-mc-max-1785937591393-2c7bb8ed-alarm-time">{{ item.time }}</span>
              <span :class="['c-mc-max-1785937591393-2c7bb8ed-alarm-status', `c-mc-max-1785937591393-2c7bb8ed-alarm-status--${item.status}`]">{{ item.statusText }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </base-panel>
</template>