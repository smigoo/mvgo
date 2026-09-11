<template>
  <div class="c-monitor-main-stats">
    <div class="c-monitor-stat-card c-monitor-stat-card-tunnel">
      <div class="c-monitor-stat-card-header">
        <span class="c-monitor-stat-card-label">隧道设备</span>
      </div>
      <div class="c-monitor-stat-card-value">56302</div>
      <div class="c-monitor-stat-card-footer">
        <span class="c-monitor-stat-card-footer-label">异常数:</span>
        <span class="c-monitor-stat-card-footer-value">5</span>
      </div>
    </div>

    <div class="c-monitor-stat-card c-monitor-stat-card-supervision">
      <div class="c-monitor-stat-card-header">
        <span class="c-monitor-stat-card-label">监理检验设备</span>
      </div>
      <div class="c-monitor-stat-card-value">1280</div>
      <div class="c-monitor-stat-card-footer">
        <span class="c-monitor-stat-card-footer-label">异常数:</span>
        <span class="c-monitor-stat-card-footer-value">3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 纯展示组件，无需额外逻辑
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-stats {
  display: flex;
  gap: 12px;
  width: 100%;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 8px;
  min-height: 0;
}

.c-monitor-stat-card-tunnel {
  background: linear-gradient(135deg, rgba(64, 158, 255, 1) 0%, rgba(25, 144, 255, 1) 100%);
}

.c-monitor-stat-card-supervision {
  background: linear-gradient(135deg, rgba(91, 192, 222, 1) 0%, rgba(64, 158, 255, 1) 100%);
}

.c-monitor-stat-card-header {
  margin-bottom: 8px;
}

.c-monitor-stat-card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: normal;
}

.c-monitor-stat-card-value {
  font-size: 32px;
  font-weight: bold;
  color: rgba(255, 255, 255, 1);
  margin-bottom: 8px;
}

.c-monitor-stat-card-footer {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stat-card-footer-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: normal;
}

.c-monitor-stat-card-footer-value {
  font-size: 12px;
  color: rgba(255, 92, 92, 1);
  font-weight: normal;
}
</style>