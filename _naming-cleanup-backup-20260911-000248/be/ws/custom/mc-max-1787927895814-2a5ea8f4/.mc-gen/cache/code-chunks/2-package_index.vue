<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-right">
        <!-- Tab切换栏 -->
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧控件区 -->
        <div class="c-env-monitor-controls">
          <img :src="icon1" class="c-env-monitor-icon" />
          <img :src="icon2" class="c-env-monitor-icon" />
          <div class="c-env-monitor-badge">8</div>
          <span class="c-env-monitor-stat-text">2k3+78560×威</span>
        </div>
      </div>
    </template>

    <!-- 主内容区 -->
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-chart-section">
        <div class="c-env-monitor-threshold-label">阈值线</div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>