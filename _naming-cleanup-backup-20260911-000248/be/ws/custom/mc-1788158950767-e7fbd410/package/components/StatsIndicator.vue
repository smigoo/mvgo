<template>
  <div class="c-mc-max-env-monitor-verify-r7-c-env-monitor-stats-indicator">
    <div class="c-mc-max-env-monitor-verify-r7-c-env-monitor-icon-wrapper">
      <img :src="icon1" class="c-mc-max-env-monitor-verify-r7-c-env-monitor-icon" alt="chart icon" />
    </div>
    <div class="c-mc-max-env-monitor-verify-r7-c-env-monitor-icon-wrapper">
      <img :src="icon2" class="c-mc-max-env-monitor-verify-r7-c-env-monitor-icon" alt="doc icon" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { inject} from 'vue'

// 从父组件注入的资源变量
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-indicator {
height: 100%;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-env-monitor-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-env-monitor-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: block;
}
</style>