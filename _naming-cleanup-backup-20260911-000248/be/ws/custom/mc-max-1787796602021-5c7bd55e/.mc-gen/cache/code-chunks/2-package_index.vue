<template>
  <base-panel panelKey="default-panel">
    <!-- 标题栏左侧装饰：header 区域 g 组装饰点 -->
    <template #title_left>
      <div class="c-monitor-header-decoration">
        <i class="c-monitor-header-dot"></i>
      </div>
    </template>

    <!-- 副标题/更新时间 -->
    <template #title_right>
      <span class="c-monitor-header-time">*数据实时更新</span>
    </template>

    <!-- 标题栏右侧：顶部统计栏（设备类型/设备总数/完好率） -->
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value c-monitor-stat-blue">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value c-monitor-stat-blue">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value c-monitor-stat-teal">98%</span>
        </div>
      </div>
    </template>

    <!-- 业务内容区 -->
    <div class="c-monitor-root">
      <!-- 上部：汇总卡片区（两列并排） -->
      <div class="c-monitor-summary-cards">
        <!-- 隧道设备卡（渐变蓝） -->
        <div class="c-monitor-card c-monitor-card-tunnel">
          <div class="c-monitor-card-row">
            <div class="c-monitor-card-icon-wrap">
              <img :src="icon10" alt="隧道图标" class="c-monitor-card-icon" />
            </div>
            <span class="c-monitor-card-total c-monitor-card-total-light">总数:56302</span>
          </div>
          <div class="c-monitor-card-row c-monitor-card-row-bottom">
            <span class="c-monitor-card-name c-monitor-card-name-light">隧道设备</span>
            <span class="c-monitor-card-abnormal c-monitor-card-abnormal-danger">异常数:5</span>
          </div>
        </div>

        <!-- 南北接线设备卡（浅灰蓝） -->
        <div class="c-monitor-card c-monitor-card-north-south">
          <div class="c-monitor-card-row">
            <div class="c-monitor-card-icon-wrap">
              <img :src="icon16" alt="接线图标" class="c-monitor-card-icon" />
            </div>
            <span class="c-monitor-card-total c-monitor-card-total-blue">总数:1280</span>
          </div>
          <div class="c-monitor-card-row c-monitor-card-row-bottom">
            <span class="c-monitor-card-name c-monitor-card-name-dark">南北接线设备</span>
            <span class="c-monitor-card-abnormal c-monitor-card-abnormal-danger">异常数:3</span>
          </div>
        </div>
      </div>

      <!-- 下部：设备列表与导航（横向排布） -->
      <div class="c-monitor-main-content">
        <!-- 左侧垂直 Tab 导航 -->
        <div class="c-monitor-vertical-tabs">
          <div
            v-for="tab in monitorTabs"
            :key="tab.name"
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item-active': tab.active }]"
            @click="handleMonitorTabChange(tab.name)"
          >
            <span class="c-monitor-tab-text">{{ tab.name }}</span>
            <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备状态网格（3 列） -->
        <div class="c-monitor-device-grid">
          <div
            v-for="device in monitorDevices"
            :key="device.name"
            class="c-monitor-device-item"
          >
            <div class="c-monitor-device-icon-wrap">
              <img :src="device.icon" alt="设备图标" class="c-monitor-device-icon" />
            </div>
            <span class="c-monitor-device-name">{{ device.name }}</span>
            <span class="c-monitor-device-value">
              <span :class="['c-monitor-device-count', { 'c-monitor-device-count-danger': device.countColor === 'danger', 'c-monitor-device-count-normal': device.countColor === 'normal' }]">({{ device.abnormal }}</span>
              <span class="c-monitor-device-total">/484)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>