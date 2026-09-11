<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">设备类型</span>
      <span class="c-monitor-stat-value c-monitor-stat-value--primary">28</span>
    </div>
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">设备总数</span>
      <span class="c-monitor-stat-value c-monitor-stat-value--primary">68562</span>
    </div>
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">完好率</span>
      <span class="c-monitor-stat-value c-monitor-stat-value--success">98%</span>
    </div>
  </div>
</template>

<script setup>
// 标题栏统计指标组件
// 显示设备类型、设备总数、完好率三个关键指标
</script>

<style lang="less" scoped>
@color-text-secondary: #333333;

@import '../../resources/styles/index.less';

.c-monitor-header-stats {
flex: 1 1 0;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 24px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-label {
  font-size: calc(var(--fontSize, 14px) * 0.857); // 12px;
  color: @color-text-secondary;
  font-weight: normal;
}

.c-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.429); // 20px;
  font-weight: 700;
  line-height: 1.17;
}

.c-monitor-stat-value--primary {
  color: var(--color-primary, rgba(25, 144, 255, 1));
}

.c-monitor-stat-value--success {
  color: var(--color-secondary, rgba(8, 163, 165, 1));
}
</style>