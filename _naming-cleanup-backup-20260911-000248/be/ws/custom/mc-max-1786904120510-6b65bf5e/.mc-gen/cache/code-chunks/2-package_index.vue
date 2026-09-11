<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <section class="c-device-monitor-kpi-section">
        <div class="c-device-monitor-kpi-grid">
          <article
            v-for="kpi in kpiList"
            :key="kpi.key"
            class="c-device-monitor-kpi-card"
            :class="{ 'is-alert': kpi.status === 'alert' }"
          >
            <div class="c-device-monitor-kpi-icon-wrap">
              <img :src="kpi.icon" :alt="kpi.label" class="c-device-monitor-kpi-icon" />
            </div>
            <div class="c-device-monitor-kpi-text">
              <span class="c-device-monitor-kpi-label">{{ kpi.label }}</span>
              <div class="c-device-monitor-kpi-value-row">
                <span class="c-device-monitor-kpi-value">{{ kpi.value }}</span>
                <span class="c-device-monitor-kpi-unit">{{ kpi.unit }}</span>
              </div>
            </div>
            <span class="c-device-monitor-kpi-trend">{{ kpi.trendText }}</span>
          </article>
        </div>
      </section>

      <section class="c-device-monitor-status-section">
        <header class="c-device-monitor-section-header">
          <h3 class="c-device-monitor-section-title">设备运行状态</h3>
          <span class="c-device-monitor-section-subtitle">实时更新</span>
        </header>
        <div class="c-device-monitor-status-list">
          <div
            v-for="device in deviceList"
            :key="device.id"
            class="c-device-monitor-status-item"
          >
            <img :src="device.icon" :alt="device.name" class="c-device-monitor-status-icon" />
            <div class="c-device-monitor-status-info">
              <span class="c-device-monitor-status-name">{{ device.name }}</span>
              <span class="c-device-monitor-status-meta">{{ device.code }} · {{ device.location }}</span>
            </div>
            <div class="c-device-monitor-status-value">
              <span class="c-device-monitor-status-metric">{{ device.metric }}</span>
              <span
                class="c-device-monitor-status-tag"
                :class="`is-${device.status}`"
              >{{ device.statusText }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="c-device-monitor-chart-section">
        <header class="c-device-monitor-section-header">
          <h3 class="c-device-monitor-section-title">监测趋势</h3>
        </header>
        <div class="c-device-monitor-chart-container">
          <div ref="trendChartRef" class="c-device-monitor-chart"></div>
        </div>
      </section>
    </div>
  </base-panel>
</template>