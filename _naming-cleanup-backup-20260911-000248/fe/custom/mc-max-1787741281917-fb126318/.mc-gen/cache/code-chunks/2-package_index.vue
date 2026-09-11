<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 设备概览切换区：隧道设备 / 南北接线设备 -->
      <div class="c-monitor-overview-switch">
        <div
          v-for="item in overviewCards"
          :key="item.key"
          class="c-monitor-overview-card"
          :class="{ 'is-active': activeOverview === item.key }"
          @click="handleOverviewChange(item.key)"
        >
          <div class="c-monitor-overview-card-icon">
            <img v-if="item.icon" :src="item.icon" alt="" class="c-monitor-overview-card-icon-img" />
          </div>
          <div class="c-monitor-overview-card-content">
            <div class="c-monitor-overview-card-title">{{ item.title }}</div>
            <div class="c-monitor-overview-card-lines">
              <div class="c-monitor-overview-card-line">
                <span class="c-monitor-overview-card-label">总数:</span>
                <span class="c-monitor-overview-card-value">{{ item.total }}</span>
              </div>
              <div class="c-monitor-overview-card-line">
                <span class="c-monitor-overview-card-label">异常数:</span>
                <span class="c-monitor-overview-card-value is-error">{{ item.abnormal }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主体：左侧分类导航 + 右侧设备分类内容 -->
      <div class="c-monitor-body">
        <!-- 左侧竖向分类导航 -->
        <div class="c-monitor-sidebar" role="tablist" aria-label="设备类型分类">
          <div
            v-for="tab in categoryTabs"
            :key="tab.key"
            class="c-monitor-sidebar-item"
            :class="{ 'is-active': activeCategory === tab.key }"
            role="tab"
            :aria-selected="activeCategory === tab.key"
            @click="handleCategoryChange(tab.key)"
          >
            <span class="c-monitor-sidebar-item-label">{{ tab.label }}</span>
            <span class="c-monitor-sidebar-item-count">{{ tab.count }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-monitor-content">
          <div class="c-monitor-grid">
            <div
              v-for="device in currentDeviceList"
              :key="device.name"
              class="c-monitor-device-card"
            >
              <div class="c-monitor-device-card-icon">
                <img v-if="device.iconVisible" :src="device.icon" alt="" class="c-monitor-device-card-icon-img" />
              </div>
              <div class="c-monitor-device-card-text">
                <span class="c-monitor-device-card-name">{{ device.name }}</span>
                <span class="c-monitor-device-card-value">{{ device.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>