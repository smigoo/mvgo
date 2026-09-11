<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <!-- 设备汇总卡片 -->
      <div class="c-monitor-overview-cards">
        <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
          <img :src="icon1" class="c-monitor-card-icon" />
          <div class="c-monitor-card-content">
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">总 数:</span>
              <span class="c-monitor-card-value">56302</span>
            </div>
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-abnormal">5</span>
            </div>
          </div>
        </div>

        <div class="c-monitor-summary-card">
          <img :src="icon2" class="c-monitor-card-icon" />
          <div class="c-monitor-card-content">
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">总 数:</span>
              <span class="c-monitor-card-value">1280</span>
            </div>
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-abnormal">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备列表与分类 -->
      <div class="c-monitor-device-section" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
        <!-- 左侧分类Tab -->
        <div class="c-monitor-sidebar-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.label"
            :class="['c-monitor-tab-item', { active: activeTab === tab.label }]"
            @click="activeTab = tab.label"
          >
            <span class="c-monitor-tab-label">{{ tab.label }}</span>
            <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-monitor-device-grid">
          <div
            v-for="device in deviceList"
            :key="device.name"
            class="c-monitor-device-item"
          >
            <div class="c-monitor-device-icon-wrapper">
              <img :src="icon1" class="c-monitor-device-icon" />
            </div>
            <div class="c-monitor-device-info">
              <span class="c-monitor-device-name">{{ device.name }}</span>
              <span class="c-monitor-device-count">{{ device.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>
<script setup>` 批次中实现