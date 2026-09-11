<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 1. 标题栏 -->
      <div class="c-env-monitor-header">
        <img :src="icon1" class="c-env-monitor-header-icon" />
        <span class="c-env-monitor-header-title">环境监测</span>
      </div>

      <!-- 2. 筛选与操作栏 -->
      <div class="c-env-monitor-filter-bar">
        <div class="c-env-monitor-indicator-tabs">
          <div 
            v-for="tab in indicatorTabs" 
            :key="tab.key"
            :class="['c-env-monitor-indicator-tab', { 'is-active': activeIndicator === tab.key }]"
            :style="activeIndicator === tab.key ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}"
            @click="activeIndicator = tab.key"
          >
            <img v-if="tab.key === 'co'" :src="icontabsIcon" class="c-env-monitor-tab-icon" />
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-view-switch">
          <div 
            :class="['c-env-monitor-view-btn', { 'is-active': viewMode === 'chart' }]"
            @click="viewMode = 'chart'"
          >
            <img :src="icon2" class="c-env-monitor-view-icon" />
            <span>柱状图视图</span>
          </div>
          <div 
            :class="['c-env-monitor-view-btn', { 'is-active': viewMode === 'list' }]"
            @click="viewMode = 'list'"
          >
            <span>列表视图</span>
          </div>
        </div>
      </div>

      <!-- 3. 数据图表区 -->
      <div class="c-env-monitor-chart-area" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
        <div v-show="viewMode === 'chart'" ref="chartRef" class="c-env-monitor-chart-container"></div>
        <div v-show="viewMode === 'list'" class="c-env-monitor-list-container" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
          <!-- 列表视图内容区域 -->
        </div>
      </div>
    </div>
  </base-panel>
</template>