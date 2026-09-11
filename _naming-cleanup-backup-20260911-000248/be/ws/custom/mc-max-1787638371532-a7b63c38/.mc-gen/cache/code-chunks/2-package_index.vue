<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <img :src="icon1" class="c-env-monitor-title-decor" />
    </template>

    <div class="c-env-monitor-root">
      <!-- 监测类型与视图控制 -->
      <div class="c-env-monitor-controls">
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            <div
              v-if="activeTab === tab.key"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: `url(${bg3})` }"
            ></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>

        <div class="c-env-monitor-view-icons">
          <img :src="icon2" class="c-env-monitor-view-icons-img" />
          <div class="c-env-monitor-badge">6</div>
        </div>
      </div>

      <!-- 浓度趋势图 -->
      <div class="c-env-monitor-chart-wrapper">
        <div ref="chartRef" class="c-env-monitor-chart"></div>
      </div>
    </div>
  </base-panel>
</template>