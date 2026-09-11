<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div class="c-env-monitor-root" :class="themeType">
        <div class="c-env-monitor-tabs">
          <button
            v-for="tab in monitorTabs"
            :key="tab.key"
            type="button"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})` } : null"
            @click="handleTabChange(tab.key)"
          >
            <img class="c-env-monitor-tab-icon" :src="icontabsIcon" alt="" />
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </button>
        </div>

        <div class="c-env-monitor-summary">
          <div
            v-for="item in summaryItems"
            :key="item.key"
            class="c-env-monitor-summary-item"
          >
            <img class="c-env-monitor-summary-icon" :src="icon1" alt="" />
            <div class="c-env-monitor-summary-text-group">
              <span class="c-env-monitor-summary-label">{{ item.label }}</span>
              <span class="c-env-monitor-summary-value">
                {{ item.value }}<small>{{ item.unit }}</small>
              </span>
            </div>
          </div>
        </div>

        <div class="c-env-monitor-chart-section">
          <div class="c-env-monitor-section-header">
            <span class="c-env-monitor-section-title">实时监测趋势</span>
            <div class="c-env-monitor-time-tabs">
              <button
                v-for="range in timeRanges"
                :key="range.key"
                type="button"
                :class="['c-env-monitor-time-tab', { 'is-active': activeRange === range.key }]"
                @click="handleRangeChange(range.key)"
              >
                {{ range.label }}
              </button>
            </div>
          </div>
          <div class="c-env-monitor-chart-body">
            <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
          </div>
        </div>

        <div class="c-env-monitor-status-section">
          <div class="c-env-monitor-section-header">
            <span class="c-env-monitor-section-title">环境指标状态</span>
          </div>
          <div class="c-env-monitor-status-list">
            <div
              v-for="item in statusItems"
              :key="item.key"
              class="c-env-monitor-status-item"
            >
              <div class="c-env-monitor-status-info">
                <span class="c-env-monitor-status-name">{{ item.name }}</span>
                <span class="c-env-monitor-status-desc">{{ item.desc }}</span>
              </div>
              <div :class="['c-env-monitor-status-badge', item.statusClass]">
                {{ item.statusText }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </base-panel>
</template>