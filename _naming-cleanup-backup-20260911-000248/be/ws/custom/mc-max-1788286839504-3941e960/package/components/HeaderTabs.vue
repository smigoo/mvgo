<template>
  <div class="c-env-monitor-header-tabs">
    <div class="c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg1})` }">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.value }]"
        :style="activeTab === tab.value ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabChange(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
    <div class="c-env-monitor-tabs-icon">
      <img :src="icon1" class="c-env-monitor-icon" alt="图表图标" />
      <img :src="icon2" class="c-env-monitor-icon" alt="导出图标" />
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


import { ref} from 'vue'

// 导入资源变量（系统自动注入，无需手写 import）

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
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  // 触发父组件数据更新（通过 emit 或父组件监听）
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
flex: 1 1 0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  gap: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  font-size: calc(var(--fontSize, 14px) * 1);
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.3s;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;

  &:hover {
    opacity: 0.8;
  }

  &--active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-icon {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.7;
  }
}
</style>