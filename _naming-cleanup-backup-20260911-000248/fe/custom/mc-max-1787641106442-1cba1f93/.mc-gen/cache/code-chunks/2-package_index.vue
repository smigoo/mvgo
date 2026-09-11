<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <img :src="icon1" class="c-env-monitor-title-decor" />
    </template>

    <div class="c-env-monitor-root">
      <!-- Tab 切换与工具栏 -->
      <div class="c-env-monitor-tabs-bar">
        <div class="c-env-monitor-tabs-list">
          <div 
            v-for="tab in tabs" 
            :key="tab.key" 
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            <div v-if="activeTab === tab.key" class="c-env-monitor-tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-view-icons">
          <img :src="icon2" class="c-env-monitor-tabs-icons-img" />
        </div>
      </div>

      <!-- 数据图表区 -->
      <div class="c-env-monitor-chart-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
        <div class="c-env-monitor-chart-legend">
          <span 
            class="c-env-monitor-legend-item" 
            :class="{ 'is-active': legendState.co }" 
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-env-monitor-legend-dot"></i>
            zk3+785CO浓度
          </span>
        </div>
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>