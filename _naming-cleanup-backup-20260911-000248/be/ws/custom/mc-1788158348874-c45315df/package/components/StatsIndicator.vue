<template>
  <div class="c-mc-max-env-monitor-verify-r6-c-env-monitor-stats-indicator">
    <img :src="icon1" class="c-mc-max-env-monitor-verify-r6-c-env-monitor-icon" alt="图表视图" />
    <img :src="icon2" class="c-mc-max-env-monitor-verify-r6-c-env-monitor-icon" alt="列表视图" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref} from 'vue'

// 图标资源由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-indicator {
height: 100%;
  width: 100%;

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
    opacity: 0.8;
  }
}
</style>