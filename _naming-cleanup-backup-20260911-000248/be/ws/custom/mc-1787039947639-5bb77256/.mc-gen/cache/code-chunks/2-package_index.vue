<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- 顶部区域：标题与指标 -->
      <div
        class="c-device-monitor-header"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-device-monitor-header-title">设备监测</div>
        <div class="c-device-monitor-stats">
          <div class="c-device-monitor-stat-item">
            <img :src="icon1" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">设备总数</span>
              <span class="c-device-monitor-stat-value">128</span>
            </div>
          </div>
          <div class="c-device-monitor-stat-item">
            <img :src="icon2" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">在线设备</span>
              <span class="c-device-monitor-stat-value">125</span>
            </div>
          </div>
          <div class="c-device-monitor-stat-item">
            <img :src="icon3" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">离线设备</span>
              <span class="c-device-monitor-stat-value">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 大类设备统计 -->
      <div class="c-device-monitor-categories">
        <div
          class="c-device-monitor-category-card"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon4" class="c-device-monitor-category-icon" alt="" />
          <div class="c-device-monitor-category-content">
            <span class="c-device-monitor-category-title">隧道设备</span>
            <span class="c-device-monitor-category-value">64 <small>台</small></span>
          </div>
        </div>
        <div
          class="c-device-monitor-category-card"
          :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon5" class="c-device-monitor-category-icon" alt="" />
          <div class="c-device-monitor-category-content">
            <span class="c-device-monitor-category-title">南北接线设备</span>
            <span class="c-device-monitor-category-value">64 <small>台</small></span>
          </div>
        </div>
      </div>

      <!-- 分类导航与设备列表 -->
      <div
        class="c-device-monitor-body"
        :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-device-monitor-nav">
          <div
            v-for="tab in navTabs"
            :key="tab.key"
            :class="['c-device-monitor-nav-tab', { active: activeNavTab === tab.key }]"
            @click="activeNavTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-device-monitor-grid">
          <div
            v-for="device in filteredDeviceList"
            :key="device.id"
            class="c-device-monitor-grid-item"
          >
            <img :src="device.icon" class="c-device-monitor-grid-icon" alt="" />
            <div class="c-device-monitor-grid-info">
              <span class="c-device-monitor-grid-name">{{ device.name }}</span>
              <span
                class="c-device-monitor-grid-status"
                :class="{ offline: device.status === '离线' }"
              >
                {{ device.status }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>