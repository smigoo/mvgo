<template>
  <div class="c-env-monitor-tabs-wrapper">
    <div 
      v-for="tab in tabs" 
      :key="tab.value"
      :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
      @click="handleClick(tab.value)"
    >
      {{ tab.label }}
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})

const emit = defineEmits(['tab-change'])

const tabs = [
  { label: '一氧化碳', value: '一氧化碳' },
  { label: '能见度', value: '能见度' },
  { label: '洞内照明', value: '洞内照明' },
  { label: '洞外光强', value: '洞外光强' }
]

const handleClick = (value) => {
  if (value !== props.activeTab) {
    emit('tab-change', value)
  }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
  height: 32px;
  flex-shrink: 0;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 27px;
  padding: 0 12px;
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  background: transparent;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-right: none;
  transition: all 0.3s;
  box-sizing: border-box;

  &:last-child {
    border-right: 0.72px solid rgba(255, 255, 255, 1);
  }

  &:hover {
    opacity: 0.8;
  }

  &.is-active {
    color: #ffffff;
    background-image: url(${bgtabActive});
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
    border: 0.6px solid rgba(255, 255, 255, 1);
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
  }
}
</style>
