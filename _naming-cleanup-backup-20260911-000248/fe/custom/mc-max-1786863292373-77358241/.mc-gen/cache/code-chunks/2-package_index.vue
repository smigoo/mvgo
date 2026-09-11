<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div
        class="c-env-monitor-root"
        :class="themeClass"
        :style="{
          backgroundImage: `url(${bg1})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-env-monitor-toolbar">
          <div class="c-env-monitor-tabs">
            <button
              v-for="tab in tabList"
              :key="tab.key"
              type="button"
              class="c-env-monitor-tab-item"
              :class="{ 'c-env-monitor-tab-item-active': activeTab === tab.key }"
              :style="activeTab === tab.key ? {
                backgroundImage: `url(${bgtabActive})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat'
              } : null"
              @click="handleTabChange(tab.key)"
            >
              <img
                v-if="tab.showIcon"
                class="c-env-monitor-tab-icon"
                :src="icontabsIcon"
                alt=""
              />
              <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
            </button>
          </div>
        </div>

        <div class="c-env-monitor-body">
          <section
            class="c-env-monitor-overview-section"
            :style="{
              backgroundImage: `url(${bg2})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <div class="c-env-monitor-section-header">
              <span class="c-env-monitor-section-title">环境概览</span>
              <span class="c-env-monitor-update-time">{{ updateTime }}</span>
            </div>

            <div class="c-env-monitor-stat-grid">
              <div
                v-for="item in overviewStats"
                :key="item.key"
                class="c-env-monitor-stat-item"
              >
                <img
                  v-if="item.useIcon"
                  class="c-env-monitor-stat-icon"
                  :src="icon1"
                  alt=""
                />
                <div class="c-env-monitor-stat-text-group">
                  <span class="c-env-monitor-stat-label">{{ item.label }}</span>
                  <span class="c-env-monitor-stat-value">
                    {{ item.value }}<small>{{ item.unit }}</small>
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section class="c-env-monitor-chart-section">
            <div class="c-env-monitor-section-header">
              <span class="c-env-monitor-section-title">环境趋势</span>
              <div class="c-env-monitor-time-filter">
                <button
                  v-for="range in timeRanges"
                  :key="range.key"
                  type="button"
                  class="c-env-monitor-time-btn"
                  :class="{ 'c-env-monitor-time-btn-active': activeRange === range.key }"
                  @click="handleRangeChange(range.key)"
                >
                  {{ range.label }}
                </button>
              </div>
            </div>
            <div class="c-env-monitor-chart-wrapper">
              <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
            </div>
          </section>

          <section class="c-env-monitor-quality-section">
            <div class="c-env-monitor-section-header">
              <span class="c-env-monitor-section-title">空气质量</span>
            </div>
            <div class="c-env-monitor-quality-content">
              <div class="c-env-monitor-gauge-wrapper">
                <div ref="qualityChartRef" class="c-env-monitor-gauge-container"></div>
              </div>
              <div class="c-env-monitor-quality-list">
                <div
                  v-for="item in qualityItems"
                  :key="item.key"
                  class="c-env-monitor-quality-item"
                >
                  <span class="c-env-monitor-quality-name">{{ item.name }}</span>
                  <span class="c-env-monitor-quality-value">{{ item.value }}</span>
                  <span class="c-env-monitor-quality-status" :class="item.statusClass">
                    {{ item.status }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section class="c-env-monitor-alert-section">
            <div class="c-env-monitor-section-header">
              <span class="c-env-monitor-section-title">预警信息</span>
            </div>
            <div class="c-env-monitor-alert-list">
              <div
                v-for="alert in alertList"
                :key="alert.id"
                class="c-env-monitor-alert-item"
                :class="alert.levelClass"
              >
                <div class="c-env-monitor-alert-main">
                  <span class="c-env-monitor-alert-name">{{ alert.name }}</span>
                  <span class="c-env-monitor-alert-desc">{{ alert.desc }}</span>
                </div>
                <span class="c-env-monitor-alert-time">{{ alert.time }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </base-panel>
</template>