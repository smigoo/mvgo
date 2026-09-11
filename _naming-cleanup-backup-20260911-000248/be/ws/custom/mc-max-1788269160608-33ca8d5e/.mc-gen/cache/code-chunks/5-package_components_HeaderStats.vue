<template>
  <div class="c-monitor-header-stats" :style="{ backgroundImage: `url(${bg1})` }">
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value">28</span>
    </div>
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value">68562</span>
    </div>
    <div class="c-monitor-header-stat">
      <span class="c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value">98%</span>
    </div>
  </div>
</template>

<script setup>
// bg1 由系统自动注入，无需手动 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 0 20px;
}

.c-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-header-stat-label {
  font-size: @fontSize;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  line-height: 1.5;
}

.c-monitor-header-stat-value {
  font-size: calc(@fontSize * 1.43);
  color: rgba(25, 144, 255, 1);
  font-weight: 700;
  line-height: 1.17;
}
</style>
