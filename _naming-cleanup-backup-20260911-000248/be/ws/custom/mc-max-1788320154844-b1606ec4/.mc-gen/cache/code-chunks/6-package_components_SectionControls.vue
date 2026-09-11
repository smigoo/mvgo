<template>
  <div class="c-env-monitor-controls">
    <div class="c-env-monitor-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
        @click="handleTabChange(tab.value)"
      >
        <div
          v-if="activeTab === tab.value"
          class="c-env-monitor-tab-active-bg"
          :style="{ backgroundImage: `url(${bg2})` }"
        ></div>
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
    <div class="c-env-monitor-tools">
      <div class="c-env-monitor-tool-icon" @click="handleViewChange('chart')" title="图表视图">
        <img :src="icon1" alt="图表视图" />
      </div>
      <div class="c-env-monitor-tool-icon" @click="handleViewChange('list')" title="列表视图">
        <img :src="icon2" alt="列表视图" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['tab-change', 'view-change'])

const activeTab = ref('co')

const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
]

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  emit('tab-change', value)
}

const handleViewChange = (view) => {
  emit('view-change', view)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  width: 100%;
}

.c-env-monitor-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  padding: 3px;
  box-sizing: border-box;
}

.c-env-monitor-tab-item {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  cursor: pointer;
  z-index: 1;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -1;
}

.c-env-monitor-tab-text {
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
  position: relative;
  z-index: 2;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tools {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-tool-icon {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 10;
}
</style>