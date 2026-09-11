<template>
  <div class="c-env-monitor-tab-switch">
    <div class="c-env-monitor-tabs-container">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
        :style="activeTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
  // 触发父组件更新图表数据
  // 由父组件通过 watch 或事件监听处理
}

// 暴露给父组件
defineExpose({
  activeTab
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tab-switch {
  width: 100%;
  flex-shrink: 0;
}

.c-env-monitor-tabs-container {
  display: flex;
  gap: 0;
  height: 27px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 2px;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-right: 1px solid rgba(255, 255, 255, 0.3);

  &:last-child {
    border-right: none;
  }

  &:hover {
    opacity: 0.9;
  }

  &.active {
    color: #ffffff;
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
    background-image: var(--tab-active-bg);
    border: 0.6px solid rgba(255, 255, 255, 1);
  }
}
</style>
