<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div class="c-env-monitor-root" :class="themeClass">
        <div class="c-env-monitor-content">
          <div class="c-env-monitor-tabs-area">
            <button
              v-for="tab in monitorTabs"
              :key="tab.key"
              type="button"
              :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item-active': activeTab === tab.key }]"
              :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})` } : null"
              @click="handleTabChange(tab.key)"
            >
              <img v-if="tab.showIcon" :src="icontabsIcon" class="c-env-monitor-tab-icon" alt="" />
              <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
            </button>
          </div>

          <div class="c-env-monitor-main-area">
            <div class="c-env-monitor-summary-area">
              <div
                v-for="item in summaryCards"
                :key="item.key"
                class="c-env-monitor-summary-card"
              >
                <div class="c-env-monitor-summary-icon-wrap">
                  <img :src="icon1" class="c-env-monitor-summary-icon" alt="" />
                </div>
                <div class="c-env-monitor-summary-text-group">
                  <span class="c-env-monitor-summary-label">{{ item.label }}</span>
                  <span class="c-env-monitor-summary-value">
                    {{ item.value }}<small class="c-env-monitor-summary-unit">{{ item.unit }}</small>
                  </span>
                </div>
              </div>
            </div>

            <div class="c-env-monitor-chart-section">
              <div class="c-env-monitor-section-header">
                <span class="c-env-monitor-section-title">{{ currentMetricTitle }}</span>
                <div class="c-env-monitor-time-tabs">
                  <button
                    v-for="range in timeRanges"
                    :key="range.key"
                    type="button"
                    :class="['c-env-monitor-time-tab', { 'c-env-monitor-time-tab-active': activeTimeRange === range.key }]"
                    @click="handleTimeRangeChange(range.key)"
                  >
                    {{ range.label }}
                  </button>
                </div>
              </div>
              <div class="c-env-monitor-chart-wrapper">
                <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
              </div>
            </div>

            <div class="c-env-monitor-status-section">
              <div class="c-env-monitor-section-header">
                <span class="c-env-monitor-section-title">环境状态</span>
              </div>
              <div class="c-env-monitor-status-list">
                <div
                  v-for="status in statusList"
                  :key="status.key"
                  class="c-env-monitor-status-item"
                >
                  <span class="c-env-monitor-status-name">{{ status.name }}</span>
                  <span :class="['c-env-monitor-status-badge', `c-env-monitor-status-badge-${status.level}`]">
                    {{ status.text }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </base-panel>
</template>