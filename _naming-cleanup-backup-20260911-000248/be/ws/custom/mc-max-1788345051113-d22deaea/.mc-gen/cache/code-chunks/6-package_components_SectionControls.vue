<template>
  <div class="c-env-monitor-controls">
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.value }]"
        :style="activeTab === tab.value ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
        @click="handleTabChange(tab.value)"
      >
        <span :class="['c-env-monitor-tab-text', { 'c-env-monitor-tab-text--active': activeTab === tab.value }]">{{ tab.label }}</span>
      </div>
    </div>
    <div class="c-env-monitor-view-icons">
      <div class="c-env-monitor-icon-btn" title="图表视图">
        <img :src="icon1" class="c-env-monitor-icon-img" alt="图表" />
      </div>
      <div class="c-env-monitor-icon-btn c-env-monitor-icon-btn--has-badge" title="列表视图">
        <img :src="icon2" class="c-env-monitor-icon-img" alt="列表" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const { runtimeBuilder } = $mcComponentBuilder()

const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor-light' },
  { label: '洞外光强', value: 'outdoor-light' }
])

const activeTab = ref('co')

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  runtimeBuilder.publishEvent('monitor-tab-change', { tab: value })
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
  gap: 8px;
}

.c-env-monitor-tabs-list {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  background: linear-gradient(to right, #b5deff 0%, #d1ecff 100%);
  border-radius: 2px;
  padding: 3px;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  flex-shrink: 0;
  white-space: nowrap;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-env-monitor-tab-item--active {
  // bg2 背景图通过 :style 动态绑定，此处不添加 background/border/border-radius
}

.c-env-monitor-tab-text {
  font-size: @fontSize;
  font-weight: 500;
  color: #2c9bea;
  line-height: 12px;
  position: relative;
  z-index: 1;
}

.c-env-monitor-tab-text--active {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-view-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}

.c-env-monitor-icon-img {
  width: 24px;
  height: 24px;
  display: block;
}

.c-env-monitor-icon-btn--has-badge {
  overflow: visible;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
  z-index: 2;
}
</style>