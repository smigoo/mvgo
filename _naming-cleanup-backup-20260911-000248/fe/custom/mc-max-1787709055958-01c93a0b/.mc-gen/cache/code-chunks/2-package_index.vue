<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-env-monitor-title-decorations">
        <img :src="icon1" class="c-env-monitor-deco-icon-lg" alt="" />
        <img :src="icon2" class="c-env-monitor-deco-icon-sm" alt="" />
        <img :src="icon3" class="c-env-monitor-deco-path" alt="" />
      </div>
    </template>

    <div class="c-env-monitor-root">
      <!-- 筛选与工具栏 -->
      <div class="c-env-monitor-controls">
        <div class="c-env-monitor-tabs" role="tablist" aria-label="监测指标切换">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="c-env-monitor-tab-item"
            :class="{ 'is-active': activeTab === tab.key }"
            :style="activeTab === tab.key
              ? {
                  backgroundImage: `url(${bg3})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center center',
                  backgroundRepeat: 'no-repeat'
                }
              : null"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="handleTabChange(tab.key)"
          >
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>

        <div class="c-env-monitor-actions">
          <a-button
            class="c-env-monitor-icon-btn"
            type="text"
            size="small"
            title="柱状图视图"
            aria-label="柱状图视图"
            @click="handleChartView"
          >
            <img :src="icon4" alt="" class="c-env-monitor-action-icon" />
          </a-button>

          <span class="c-env-monitor-badge-wrapper">
            <a-button
              class="c-env-monitor-icon-btn"
              type="text"
              size="small"
              title="列表详情"
              aria-label="列表详情"
              @click="handleListView"
            >
              <img :src="icon5" alt="" class="c-env-monitor-action-icon" />
            </a-button>
            <span class="c-env-monitor-badge">{{ badgeCount }}</span>
          </span>
        </div>
      </div>

      <!-- 趋势图表 -->
      <div
        class="c-env-monitor-chart-section"
        :style="{
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div
          class="c-env-monitor-legend"
          :class="{ 'is-hidden': !legendVisible }"
          @click="toggleLegend('zk3+785CO浓度')"
        >
          <span class="c-env-monitor-legend-swatch"></span>
          <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
        </div>

        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>