<template>
  <div class="c-monitor-device-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      :class="['c-monitor-tab-item', { 'is-active': activeTab === tab.id }]"
      @click="activeTab = tab.id"
    >
      <div class="c-monitor-tab-icon">
        <img v-if="tab.id === 'tunnel'" :src="icon1" class="c-monitor-tab-icon-img" />
        <img v-else :src="icon2" class="c-monitor-tab-icon-img" />
      </div>
      <div class="c-monitor-tab-info">
        <div class="c-monitor-tab-title">{{ tab.title }}</div>
        <div class="c-monitor-tab-line">
          <span class="c-monitor-tab-line-label">总数:</span>
          <span class="c-monitor-tab-line-value">{{ tab.total }}</span>
        </div>
        <div class="c-monitor-tab-line">
          <span class="c-monitor-tab-line-label">异常数:</span>
          <span class="c-monitor-tab-line-value c-monitor-tab-line-value--danger">{{ tab.error }}</span>
        </div>
      </div>
    </div>
  </div>
</template>