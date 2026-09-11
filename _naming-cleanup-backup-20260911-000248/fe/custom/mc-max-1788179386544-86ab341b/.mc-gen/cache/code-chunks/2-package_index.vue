<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-env-monitor-header-right">
        <!-- Tab切换栏 -->
        <div class="c-env-monitor-header-right-tabs">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': currentTab === index }]"
            :style="currentTab === index ? { backgroundImage: `url(${bgtabActive})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
            @click="handleTabChange(index)"
          >
            {{ tab }}
          </div>
        </div>

        <!-- 图表控制区 -->
        <div class="c-env-monitor-chart-controls">
          <span class="c-env-monitor-label">2k3+785C0次起</span>
          <img :src="icon1" class="c-env-monitor-icon-btn" />
          <div class="c-env-monitor-notification-badge">
            <img :src="icon2" class="c-env-monitor-icon-btn" />
            <span class="c-env-monitor-badge">8</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 面积图区域 -->
    <div class="c-env-monitor-chart-area" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div ref="chartRef" class="c-env-monitor-chart-container"></div>
    </div>
  </base-panel>
</template>
