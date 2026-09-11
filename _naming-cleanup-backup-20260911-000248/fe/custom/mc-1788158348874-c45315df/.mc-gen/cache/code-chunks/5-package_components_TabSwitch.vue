<template>
  <div class="c-env-monitor-tab-switch">
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': currentTab === tab.value }"
        @click="handleTabChange(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Tab 选项数据（从 Figma 文本节点提取）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 tab（默认第一个）
const currentTab = ref('co')

// Tab 切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  // TODO: 父组件通过事件监听或 provide/inject 获取切换状态并更新图表数据
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tab-switch {
  width: 100%;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.c-env-monitor-tabs-list {
  display: flex;
  gap: 0;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  position: relative;

  &:not(:last-child)::after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 60%;
    background: rgba(255, 255, 255, 0.3);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &--active {
    background: linear-gradient(135deg, #1099b1 0%, #038fff 100%);
    color: #ffffff;
    border: 0.6px solid rgba(255, 255, 255, 1);
    border-radius: 4px;
    box-shadow: 0 0.6px 0 0 rgba(0, 111, 227, 1);

    &::after {
      display: none;
    }
  }
}
</style>
