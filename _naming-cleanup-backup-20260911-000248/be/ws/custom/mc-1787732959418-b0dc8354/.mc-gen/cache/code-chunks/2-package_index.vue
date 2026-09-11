<template>
  <base-panel panelKey="default-panel">
    <!-- 标题栏左侧：三色圆点装饰 + 标题文字 -->
    <template #title_left>
      <div class="c-env-monitor-title">
        <div class="c-env-monitor-title-dots">
          <span class="c-env-monitor-title-dot c-env-monitor-title-dot--black"></span>
          <span class="c-env-monitor-title-dot c-env-monitor-title-dot--blue"></span>
          <span class="c-env-monitor-title-dot c-env-monitor-title-dot--path"></span>
        </div>
        <span class="c-env-monitor-title-text">环境监测</span>
      </div>
    </template>

    <!-- 主体内容：控制栏 + 图表区 -->
    <div class="c-env-monitor-root">
      <!-- 控制栏 -->
      <div class="c-env-monitor-controls">
        <!-- Tab 切换组 -->
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab', { 'c-env-monitor-tab--active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧图标按钮组 -->
        <div class="c-env-monitor-icon-group">
          <div
            class="c-env-monitor-icon-btn"
            role="button"
            :aria-label="'图表视图'"
            title="图表视图"
            @click="handleViewSwitch('chart')"
          ></div>
          <div
            class="c-env-monitor-icon-btn c-env-monitor-icon-btn--badge"
            role="button"
            :aria-label="'列表视图'"
            title="列表视图"
            @click="handleViewSwitch('list')"
          >
            <span class="c-env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-env-monitor-chart-section">
        <!-- 自定义图例（含联动点击） -->
        <div class="c-env-monitor-chart-legend">
          <span
            class="c-env-monitor-legend-item"
            :class="{ 'c-env-monitor-legend-item--inactive': !legendVisible }"
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-env-monitor-legend-dot" style="background: #00B42A;"></i>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </span>
        </div>

        <!-- ECharts 图表容器（预警线、坐标轴、面积图交由 ECharts 渲染） -->
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>