<template>
  <div class="c-env-monitor-header-tabs">
    <!-- Tab 切换容器 -->
    <div class="c-env-monitor-tabs-wrapper">
      <div 
        v-for="tab in tabs" 
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 右侧图标按钮组 -->
    <div class="c-env-monitor-icon-group">
      <div class="c-env-monitor-icon-btn">
        <img :src="icon1" class="c-env-monitor-icon-img" alt="图标" />
      </div>
      <div class="c-env-monitor-icon-btn">
        <img :src="icon2" class="c-env-monitor-icon-img" alt="图标" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统自动注入
const icon1 = 'data:image/png;base64,...'
const icon2 = 'data:image/png;base64,...'

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
  // 父组件通过 watch 或 provide/inject 监听变化
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
}

.c-env-monitor-tabs-wrapper {
  display: flex;
  gap: 0;
  height: 27px;
}

.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  height: 27px;
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    opacity: 0.8;
  }

  &.active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-icon-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.c-env-monitor-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-icon-img {
  width: 18px;
  height: 18px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f;
  border-radius: 29px;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}
</style>