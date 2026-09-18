<template>
  <div class="c-device-monitor-header">
    <!-- 左侧标题装饰 -->
    <div class="c-device-monitor-header-left">
      <img :src="icon2" class="c-device-monitor-header-icon" alt="" />
      <div class="c-device-monitor-header-divider"></div>
      <span class="c-device-monitor-header-title">设备监测</span>
    </div>

    <!-- 右侧统计指标 -->
    <div class="c-device-monitor-header-stats">
      <div class="c-device-monitor-stat-item">
        <span class="c-device-monitor-stat-label">设备类型</span>
        <span class="c-device-monitor-stat-value">28</span>
      </div>
      <div class="c-device-monitor-stat-item">
        <span class="c-device-monitor-stat-label">设备总数</span>
        <span class="c-device-monitor-stat-value">68562</span>
      </div>
      <div class="c-device-monitor-stat-item">
        <span class="c-device-monitor-stat-label">完好率</span>
        <span class="c-device-monitor-stat-value c-device-monitor-stat-value-success">98%</span>
      </div>
      <img :src="icon1" class="c-device-monitor-header-icon-end" alt="" />
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-header {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
}

.c-device-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-device-monitor-header-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.c-device-monitor-header-divider {
  width: 362px;
  height: 6px;
  background: linear-gradient(180deg, #559eff 0%, #559eff 100%);
  flex-shrink: 0;
}

.c-device-monitor-header-title {
  font-size: calc(@fontSize * 1.143);
  font-weight: 700;
  line-height: 1.2;
  background: linear-gradient(180deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-device-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-device-monitor-stat-label {
  font-size: @fontSize;
  color: @color-text-secondary;
  line-height: 1.5;
  white-space: nowrap;
}

.c-device-monitor-stat-value {
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  line-height: 1.17;
  color: @color-primary;
  white-space: nowrap;
}

.c-device-monitor-stat-value-success {
  color: @color-success;
}

.c-device-monitor-header-icon-end {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
