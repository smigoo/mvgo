<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">设备类型</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-primary">28</span>
    </div>
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">设备总数</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-primary">68562</span>
    </div>
    <div class="c-monitor-stat-item">
      <span class="c-monitor-stat-label">完好率</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-success">98%</span>
    </div>
  </div>
</template>

<script setup>
// 头部统计指标组件
// 显示设备类型、设备总数、完好率三项关键指标
</script>

<style lang="less" scoped>
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
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: var(--color-text-secondary, rgba(51, 51, 51, 0.65));
  white-space: nowrap;
}

.c-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.429);
  font-weight: 700;
  white-space: nowrap;
}

.c-monitor-stat-value-primary {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.c-monitor-stat-value-success {
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: #08a3a5;
}
</style>