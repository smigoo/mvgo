<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-monitor-title-left">
        <span class="c-monitor-title-decor"></span>
        <span class="c-monitor-title-text">设备监测</span>
      </div>
    </template>
    
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备类型</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--blue">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总数</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--blue">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value c-monitor-stat-value--green">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-body">
      <!-- 设备分类统计卡片 -->
      <div class="c-monitor-category-cards">
        <div class="c-monitor-card c-monitor-card--tunnel">
          <div class="c-monitor-card-header">
            <span class="c-monitor-card-icon-placeholder"></span>
            <span class="c-monitor-card-title">隧道设备</span>
          </div>
          <div class="c-monitor-card-row">
            <span class="c-monitor-card-label">总数:</span>
            <span class="c-monitor-card-value">56302</span>
          </div>
          <div class="c-monitor-card-row">
            <span class="c-monitor-card-label">异常数:</span>
            <span class="c-monitor-card-value c-monitor-card-value--danger">5</span>
          </div>
        </div>
        
        <div class="c-monitor-card c-monitor-card--north-south">
          <div class="c-monitor-card-header">
            <span class="c-monitor-card-icon-placeholder"></span>
            <span class="c-monitor-card-title">南北接线设备</span>
          </div>
          <div class="c-monitor-card-row">
            <span class="c-monitor-card-label">总数:</span>
            <span class="c-monitor-card-value c-monitor-card-value--primary">1280</span>
          </div>
          <div class="c-monitor-card-row">
            <span class="c-monitor-card-label">异常数:</span>
            <span class="c-monitor-card-value c-monitor-card-value--danger">3</span>
          </div>
        </div>
      </div>

      <!-- 设备列表与导航 -->
      <div class="c-monitor-device-container">
        <!-- 左侧导航Tab -->
        <a-tabs 
          v-model:activeKey="activeTab" 
          tab-position="left" 
          class="c-monitor-vertical-tabs"
        >
          <a-tab-pane v-for="tab in tabs" :key="tab.name" :tab="tab.name">
            <template #tab>
              <div class="c-monitor-tab-custom">
                <span class="c-monitor-tab-text">{{ tab.name }}</span>
                <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
                <span v-if="tab.page" class="c-monitor-tab-page">{{ tab.page }}</span>
              </div>
            </template>
          </a-tab-pane>
        </a-tabs>

        <!-- 设备网格 -->
        <div class="c-monitor-device-grid">
          <div 
            v-for="device in devices" 
            :key="device.name" 
            class="c-monitor-device-card"
          >
            <span class="c-monitor-device-icon-placeholder"></span>
            <span class="c-monitor-device-name">{{ device.name }}</span>
            <span :class="['c-monitor-device-count', device.countClass]">{{ device.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>