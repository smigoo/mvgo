<template>
  <div class="c-monitor-categories">
    <div
      v-for="tab in tabs"
      :key="tab.value"
      :class="['c-monitor-category-item', { 'is-active': activeTab === tab.value }]"
      @click="activeTab = tab.value"
    >
      <span class="c-monitor-category-label">{{ tab.label }}</span>
      <span v-if="tab.badge" class="c-monitor-category-badge">{{ tab.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tabs = [
  { label: '监控', value: 'monitor', badge: '3/3740' },
  { label: '照明', value: 'light', badge: '3' },
  { label: '通风', value: 'vent', badge: '' },
  { label: '消防', value: 'fire', badge: '' },
  { label: '交通诱导', value: 'traffic', badge: '' },
  { label: '供配电', value: 'power', badge: '' }
]

const activeTab = ref('monitor')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-categories {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 46px;
  height: 100%;
  gap: 4px;
}

.c-monitor-category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 34px;
  flex: 1;
  min-height: 40px;
  cursor: pointer;
  border-radius: 4px;
  color: #333333;
  transition: all 0.3s;

  &.is-active {
    background: #1990ff;
    color: #ffffff;
  }
}

.c-monitor-category-label {
  font-size: @fontSize;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
}

.c-monitor-category-badge {
  font-size: calc(@fontSize * 0.857);
  line-height: 1.2;
  margin-top: 2px;
  background: rgba(25, 144, 255, 0.15);
  color: #1990ff;
  border-radius: 2px;
  padding: 0 4px;
  min-width: 14px;
  text-align: center;

  .is-active & {
    background: transparent;
    color: #ffffff;
    font-size: @fontSize;
    font-weight: 500;
  }
}
</style>