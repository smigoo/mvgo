<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <div class="c-env-monitor-header">
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.key }]"
            :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
            @click="activeTab = tab.key"
          >
            <img :src="icontabsIcon" class="c-env-monitor-tab-icon" />
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <div class="c-env-monitor-body">
        <div 
          class="c-env-monitor-data-panel" 
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-env-monitor-stat-card">
            <img :src="icon1" class="c-env-monitor-stat-icon" />
            <div class="c-env-monitor-stat-info">
              <span class="c-env-monitor-stat-label">当前浓度</span>
              <span class="c-env-monitor-stat-value">450 <small>ppm</small></span>
            </div>
          </div>
          
          <div class="c-env-monitor-stat-card">
            <img :src="icon2" class="c-env-monitor-stat-icon" />
            <div class="c-env-monitor-stat-info">
              <span class="c-env-monitor-stat-label">环境状态</span>
              <span class="c-env-monitor-stat-value c-env-monitor-stat-value--normal">优良</span>
            </div>
          </div>
        </div>

        <div class="c-env-monitor-chart-panel">
          <div class="c-env-monitor-chart-header">
            <span class="c-env-monitor-chart-title">24小时趋势</span>
          </div>
          <div class="c-env-monitor-chart-wrapper">
            <div ref="chartRef" class="c-env-monitor-chart-container"></div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>