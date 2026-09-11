<template>
  <div class="c-env-monitor-chart-controls">
    <span class="c-env-monitor-label">2k3+785C0次起</span>
    <img :src="icon1" class="c-env-monitor-icon" alt="图表操作" />
    <div class="c-env-monitor-notification">
      <img :src="icon2" class="c-env-monitor-icon" alt="通知" />
      <span class="c-env-monitor-badge">8</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-chart-controls {
width: 100%;

display: flex;
  align-items: center;
  gap: 12px;
  min-height: 0;
}

.c-env-monitor-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(255, 255, 255, 0.65);
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-notification {
  position: relative;
  display: flex;
  align-items: center;
}

.c-env-monitor-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  padding: 0 4px;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border-radius: 29px;
}
</style>