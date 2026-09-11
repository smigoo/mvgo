<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 区域1：顶部统计 -->
      <div class="c-monitor-top-stats">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备类型</span>
          <span class="c-monitor-stat-value">{{ deviceTypeCount }}</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总数</span>
          <span class="c-monitor-stat-value">{{ totalDeviceCount }}</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value">{{ integrityRate }}</span>
        </div>
      </div>

      <!-- 区域2：分类统计卡片 -->
      <div class="c-monitor-category-cards">
        <!-- 隧道设备 -->
        <div class="c-monitor-category-card">
          <div class="c-monitor-card-header">
            <img :src="icon1" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">隧道设备</span>
          </div>
          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon2" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">在线</span>
                <span class="c-monitor-item-value">{{ tunnelOnline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon3" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">离线</span>
                <span class="c-monitor-item-value">{{ tunnelOffline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon4" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">故障</span>
                <span class="c-monitor-item-value">{{ tunnelFault }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 南北接线设备 -->
        <div class="c-monitor-category-card">
          <div class="c-monitor-card-header">
            <img :src="icon5" class="c-monitor-card-icon" />
            <span class="c-monitor-card-title">南北接线设备</span>
          </div>
          <div class="c-monitor-stats-row">
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon6" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">在线</span>
                <span class="c-monitor-item-value">{{ junctionOnline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon7" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">离线</span>
                <span class="c-monitor-item-value">{{ junctionOffline }}</span>
              </div>
            </div>
            <div class="c-monitor-stat-item-horizontal">
              <img :src="icon8" class="c-monitor-item-icon" />
              <div class="c-monitor-text-group">
                <span class="c-monitor-item-label">故障</span>
                <span class="c-monitor-item-value">{{ junctionFault }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 区域3：设备列表与导航 -->
      <div class="c-monitor-device-section">
        <!-- 左侧导航Tab -->
        <div class="c-monitor-nav-tabs">
          <div 
            v-for="tab in navTabs" 
            :key="tab.key" 
            :class="['c-monitor-nav-tab', { 'is-active': activeNav === tab.key }]"
            @click="activeNav = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧设备状态网格 -->
        <div class="c-monitor-device-grid">
          <div 
            v-for="device in deviceList" 
            :key="device.key" 
            class="c-monitor-device-item"
          >
            <div class="c-monitor-device-icon-wrapper">
              <img :src="device.icon" class="c-monitor-device-icon" />
            </div>
            <span class="c-monitor-device-name">{{ device.name }}</span>
            <span class="c-monitor-device-status" :class="device.statusClass">
              {{ device.status }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>