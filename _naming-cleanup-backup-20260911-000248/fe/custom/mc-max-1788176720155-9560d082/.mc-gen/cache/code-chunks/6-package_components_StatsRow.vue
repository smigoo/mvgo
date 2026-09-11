<template>
  <div class="c-env-monitor-stats-row">
    <div class="c-env-monitor-stat-card">
      <span class="c-env-monitor-stat-label">zk3+785CO浓度</span>
      <span class="c-env-monitor-stat-value">调整线</span>
    </div>
  </div>
</template>

<script setup>
// 统计指标行组件
// 显示当前监测点的浓度值和状态标识
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-stats-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
}

.c-env-monitor-stat-card {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-stat-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(0, 0, 0, 0.45);
  line-height: 1;
}

.c-env-monitor-stat-value {
  font-size: calc(@fontSize * 0.857);
  color: rgba(245, 63, 63, 1);
  line-height: 1;
}
</style>
