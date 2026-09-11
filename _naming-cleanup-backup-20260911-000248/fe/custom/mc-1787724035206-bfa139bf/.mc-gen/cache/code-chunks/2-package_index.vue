<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-env-monitor-title-deco">
        <img :src="icon1" class="c-env-monitor-deco-1" />
        <img :src="icon2" class="c-env-monitor-deco-2" />
        <img :src="icon3" class="c-env-monitor-deco-3" />
      </div>
    </template>

    <div class="c-env-monitor-root">
      <!-- 控制栏 -->
      <div class="c-env-monitor-controls">
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            <div v-if="activeTab === tab.key" class="c-env-monitor-tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-icon-group">
          <div class="c-env-monitor-icon-btn">
            <img :src="icon4" class="c-env-monitor-icon" />
          </div>
          <div class="c-env-monitor-icon-btn">
            <img :src="icon5" class="c-env-monitor-icon" />
            <span class="c-env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-env-monitor-chart-section" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="c-env-monitor-legend">
          <span
            class="c-env-monitor-legend-item"
            :class="{ 'is-active': legendState.co }"
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-env-monitor-legend-dot"></i>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </span>
        </div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>