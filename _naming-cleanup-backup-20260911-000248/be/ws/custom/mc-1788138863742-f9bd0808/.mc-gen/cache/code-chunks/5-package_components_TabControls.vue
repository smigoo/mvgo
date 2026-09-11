<template>
  <div class="c-env-monitor-tab-controls">
    <div class="c-env-monitor-tabs-container">
      <!-- Tab列表背景 -->
      <div class="c-env-monitor-tabs-bg" :style="{ backgroundImage: `url(${bgtabActive})` }"></div>
      
      <!-- Tab按钮 -->
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="[
          'c-env-monitor-tab-item',
          { 'c-env-monitor-tab-item--active': activeTab === tab.value }
        ]"
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 右侧图标区 -->
    <div class="c-env-monitor-tabs-icon-group">
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon1" class="c-env-monitor-icon" alt="icon" />
      </div>
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon2" class="c-env-monitor-icon" alt="icon" />
      </div>
      <div class="c-env-monitor-badge">
        <span class="c-env-monitor-badge-text">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import bgtabActive from '../../resources/images/bgtabActive.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['tab-change'])

const handleTabClick = (value) => {
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tab-controls {
  width: 100%;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-env-monitor-tabs-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  height: 27px;
}

.c-env-monitor-tabs-bg {
  position: absolute;
  left: 0;
  top: 0;
  width: 295px;
  height: 27px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
}

.c-env-monitor-tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 21px;
  font-family: @font-cn;
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  color: @color-tab-default-text;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 1;
  flex-shrink: 0;
  white-space: nowrap;

  &--active {
    color: @color-tab-active-text;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-tabs-icon-group {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  flex-shrink: 0;
}

.c-env-monitor-icon-wrapper {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.7;
  }
}

.c-env-monitor-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-env-monitor-badge {
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-env-monitor-badge-text {
  font-family: PingFang SC, sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}
</style>
