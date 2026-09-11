<template>
  <div class="c-env-monitor-stats-indicator">
    <img :src="icon1" class="c-env-monitor-icon" alt="图表视图" />
    <img :src="icon2" class="c-env-monitor-icon" alt="列表视图" />
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 图标资源由系统自动注入
const icon1 = ref(null)
const icon2 = ref(null)
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-indicator {
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
