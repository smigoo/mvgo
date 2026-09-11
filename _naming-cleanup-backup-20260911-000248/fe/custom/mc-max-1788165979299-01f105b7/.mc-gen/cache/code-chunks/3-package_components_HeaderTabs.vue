<template>
  <div class="c-env-monitor-header-tabs">
    <div class="c-env-monitor-tabs-container">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-icon-btn">
        <img :src="icon1" alt="icon" class="c-env-monitor-icon-img" />
      </div>
      <div class="c-env-monitor-icon-btn">
        <img :src="icon2" alt="icon" class="c-env-monitor-icon-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统注入
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'

// Tab 选项
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 tab
const activeTab = ref('co')

// Tab 切换处理
const handleTabClick = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 32px;
  margin-bottom: 16px;
}

.c-env-monitor-tabs-container {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: calc(@fontSize * 1);
  color: rgba(44, 155, 234, 1);
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;

  &:hover {
    opacity: 0.8;
  }

  &.active {
    color: rgba(255, 255, 255, 1);
    background-image: url('../../resources/images/bg-tab-active-7891.png');
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
  }
}

.c-env-monitor-tab-text {
  position: relative;
  z-index: 1;
}

.c-env-monitor-tabs-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 16px;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s ease;
  flex-shrink: 0;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
