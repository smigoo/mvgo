<template>
  <div class="c-env-monitor-section-controls">
    <!-- 监测指标 Tab -->
    <div class="c-env-monitor-tab-list">
      <div
        v-for="item in tabItems"
        :key="item.name"
        class="c-env-monitor-tab-item"
        :class="{ 'is-active': item.name === activeTab }"
        :style="item.name === activeTab ? { backgroundImage: `url(${bg2})`, backgroundSize: 'contain', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : null"
        role="tab"
        :aria-selected="item.name === activeTab"
        @click="handleTabSwitch(item.name)"
      >
        {{ item.name }}
      </div>
    </div>

    <!-- 工具图标（图表视图 / 列表视图） -->
    <div class="c-env-monitor-tool-icons">
      <div class="c-env-monitor-icon-btn" title="图表视图" @click="handleViewSwitch('chart')">
        <img :src="icon1" class="c-env-monitor-view-icon" alt="图表视图" />
      </div>
      <div class="c-env-monitor-icon-btn" title="列表视图" @click="handleViewSwitch('list')">
        <img :src="icon2" class="c-env-monitor-view-icon" alt="列表视图" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>