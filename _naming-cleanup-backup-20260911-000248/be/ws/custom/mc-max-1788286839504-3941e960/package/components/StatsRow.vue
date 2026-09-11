<template>
  <div class="c-env-monitor-stats-row">
    <img :src="icon1" class="c-env-monitor-stat-icon" alt="图表图标" />
    <img :src="icon2" class="c-env-monitor-stat-icon" alt="导出图标" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


// 资源变量由系统自动注入，无需手动 import
// icon1, icon2 已在父组件作用域可用
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-row {
width: 100%;

  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
  height: 24px;
}

.c-env-monitor-stat-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.8;
  }
}
</style>