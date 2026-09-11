<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-header-stat-item">
      <span class="c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value">28</span>
    </div>
    <div class="c-monitor-header-stat-item">
      <span class="c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value">68562</span>
    </div>
    <div class="c-monitor-header-stat-item">
      <span class="c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value c-monitor-header-stat-value--success">98%</span>
    </div>
  </div>
</template>

<script setup>
// HeaderStats 组件：头部统计指标展示
// 显示设备类型数、设备总数、完好率三个关键指标
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

.c-monitor-header-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-label {
  font-size: calc(var(--fontSize, 14px) * 0.875);
  color: rgba(51, 51, 51, 1);
  font-weight: normal;
}

.c-monitor-header-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.25);
  font-weight: bold;
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  &--success {
    background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: rgba(8, 163, 165, 1);
  }
}
</style>