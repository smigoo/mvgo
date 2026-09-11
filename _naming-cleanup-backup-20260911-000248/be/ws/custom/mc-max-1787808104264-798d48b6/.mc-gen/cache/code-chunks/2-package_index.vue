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

    <div class="c-monitor-body">
      <!-- 左侧分类切换区 -->
      <div class="c-monitor-switch">
        <div class="c-monitor-switch-item c-monitor-switch-item--active">
          <div class="c-monitor-switch-icon">
            <div class="c-monitor-switch-icon-shape"></div>
          </div>
          <div class="c-monitor-switch-info">
            <div class="c-monitor-switch-title">隧道设备</div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">总数:</span>
              <span class="c-monitor-switch-value">56302</span>
            </div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">异常数:</span>
              <span class="c-monitor-switch-value c-monitor-switch-value--error">5</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-switch-item">
          <div class="c-monitor-switch-icon">
            <div class="c-monitor-switch-icon-shape"></div>
          </div>
          <div class="c-monitor-switch-info">
            <div class="c-monitor-switch-title">南北接线 设备</div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">总数:</span>
              <span class="c-monitor-switch-value">1280</span>
            </div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">异常数:</span>
              <span class="c-monitor-switch-value c-monitor-switch-value--error">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="c-monitor-main">
        <!-- Tab 标签组 -->
        <div class="c-monitor-tabs">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.label" 
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': index === activeTabIndex }]"
            @click="activeTabIndex = index"
          >
            <span class="c-monitor-tab-label">{{ tab.label }}</span>
            <span v-if="tab.count" class="c-monitor-tab-count">{{ tab.count }}</span>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="c-monitor-grid">
          <div v-for="device in devices" :key="device.name" class="c-monitor-device-card">
            <div class="c-monitor-device-icon">
              <div class="c-monitor-device-icon-shape"></div>
            </div>
            <div class="c-monitor-device-name">{{ device.name }}</div>
            <div class="c-monitor-device-value">{{ device.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>