<template>
  <div class="c-env-monitor-header-tabs">
    <div 
      v-for="tab in tabs" 
      :key="tab.value"
      :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.value }]"
      :style="activeTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
      @click="handleTabChange(tab.value)"
    >
      {{ tab.label }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'

// Tab 选项（从 Figma 节点树提取）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
])

// 当前激活的 tab
const activeTab = ref('co')

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  // 父组件会通过 watch 监听 activeTab 变化并刷新数据
}

// 暴露给父组件
defineExpose({
  activeTab
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
  display: flex;
  align-items: center;
  gap: 0;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: calc(var(--fontSize, 14px) * 1);
  color: rgba(44, 155, 234, 1);
  font-weight: 500;
  line-height: 12px;
  transition: all 0.3s;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    opacity: 0.8;
  }

  &--active {
    color: rgba(255, 255, 255, 1);
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
  }
}
</style>
