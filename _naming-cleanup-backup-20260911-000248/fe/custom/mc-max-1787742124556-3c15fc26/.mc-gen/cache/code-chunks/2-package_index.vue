<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-c-monitor-title-left">
        <span class="c-c-monitor-title-dot">
          <img :src="icon1" alt="" class="c-c-monitor-title-dot-outer" />
          <img :src="icon2" alt="" class="c-c-monitor-title-dot-inner" />
          <img :src="icon3" alt="" class="c-c-monitor-title-dot-core" />
        </span>
        <span class="c-c-monitor-title-text">设备监测</span>
      </div>
    </template>

    <template #header_right>
      <div class="c-c-monitor-header-right">
        <span class="c-c-monitor-update-text">*数据实时更新</span>
        <div class="c-c-monitor-header-stat">
          <span class="c-c-monitor-header-stat-label">设备类型</span>
          <span class="c-c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-c-monitor-header-stat">
          <span class="c-c-monitor-header-stat-label">设备总数</span>
          <span class="c-c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-c-monitor-header-stat">
          <span class="c-c-monitor-header-stat-label">完好率</span>
          <span class="c-c-monitor-header-stat-value c-c-monitor-header-stat-value--rate">98%</span>
        </div>
        <img :src="icon4" alt="" class="c-c-monitor-header-action-icon" />
      </div>
    </template>

    <div class="c-c-monitor-root">
      <section class="c-c-monitor-overview-section">
        <div class="c-c-monitor-section-title">设备概览</div>
        <div class="c-c-monitor-overview-body">
          <button
            v-for="item in overviewCards"
            :key="item.key"
            type="button"
            :class="[
              'c-c-monitor-overview-card',
              { 'c-c-monitor-overview-card--active': activeOverviewKey === item.key }
            ]"
            @click="handleOverviewChange(item.key)"
          >
            <span class="c-c-monitor-overview-card-name">{{ item.label }}</span>
            <span class="c-c-monitor-overview-icon" aria-hidden="true">
              <img
                v-for="part in item.iconParts"
                :key="part.key"
                :src="part.src"
                alt=""
                :class="['c-c-monitor-overview-icon-part', part.className]"
              />
            </span>
            <span class="c-c-monitor-overview-line">
              <span class="c-c-monitor-overview-label">总数:</span>
              <span class="c-c-monitor-overview-value">{{ item.total }}</span>
            </span>
            <span class="c-c-monitor-overview-line">
              <span class="c-c-monitor-overview-label">异常数:</span>
              <span class="c-c-monitor-overview-danger">{{ item.error }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="c-c-monitor-category-section">
        <div class="c-c-monitor-section-title">设备类型分类</div>
        <div class="c-c-monitor-category-body">
          <a-tabs
            v-model:activeKey="activeCategoryKey"
            tab-position="left"
            class="c-c-monitor-category-tabs"
            @change="handleCategoryChange"
          >
            <a-tab-pane
              v-for="tab in categoryTabs"
              :key="tab.key"
              :tab="tab.label"
            >
              <div class="c-c-monitor-device-grid">
                <div
                  v-for="device in currentDeviceCards"
                  :key="device.key"
                  class="c-c-monitor-device-card"
                >
                  <div class="c-c-monitor-device-text">
                    <span class="c-c-monitor-device-name">{{ device.name }}</span>
                    <span class="c-c-monitor-device-value">{{ device.value }}</span>
                  </div>
                  <span class="c-c-monitor-device-icon" aria-hidden="true">
                    <img
                      v-if="device.icon"
                      :src="device.icon"
                      alt=""
                      class="c-c-monitor-device-icon-img"
                    />
                    <span v-else class="c-c-monitor-device-icon-css"></span>
                  </span>
                </div>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>
      </section>
    </div>
  </base-panel>
</template>