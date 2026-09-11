<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <img :src="icon1" class="c-env-monitor-title-deco" alt="" />
    </template>

    <div class="c-env-monitor-root">
      <!-- 监测指标与视图切换 -->
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-list">
          <div
            v-for="item in tabList"
            :key="item.key"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === item.key }]"
            :style="activeTab === item.key ? { backgroundImage: `url(${bg3})` } : {}"
            @click="handleTabChange(item.key)"
          >
            <span class="c-env-monitor-tab-label">{{ item.label }}</span>
          </div>
        </div>

        <div class="c-env-monitor-view-icons">
          <img :src="icon2" class="c-env-monitor-view-icon" alt="视图切换" />
          <span class="c-env-monitor-view-badge">6</span>
        </div>
      </div>

      <!-- 浓度趋势图表 -->
      <div
        class="c-env-monitor-chart-section"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="c-env-monitor-chart-legend" @click="toggleLegend">
          <span class="c-env-monitor-legend-marker"></span>
          <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
        </div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>