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
// 无需 props，使用静态数据展示
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-header-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.c-monitor-header-stat-label {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-header-stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  &--success {
    color: #08a3a5;
    background: none;
    -webkit-text-fill-color: #08a3a5;
  }
}
</style>
