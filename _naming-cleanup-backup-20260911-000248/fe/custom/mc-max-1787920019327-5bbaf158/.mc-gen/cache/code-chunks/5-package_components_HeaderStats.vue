<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-stat-group">
      <img :src="icon1" class="c-monitor-stat-icon" alt="设备类型图标" />
      <div class="c-monitor-stat-content">
        <span class="c-monitor-stat-label">设备类型</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-primary">28</span>
      </div>
    </div>

    <div class="c-monitor-stat-group">
      <span class="c-monitor-stat-label">设备总数</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-primary">68562</span>
    </div>

    <div class="c-monitor-stat-card c-monitor-stat-card-blue">
      <img :src="icon2" class="c-monitor-stat-card-icon" alt="隧道设备图标" />
      <div class="c-monitor-stat-card-content">
        <span class="c-monitor-stat-card-label">总数</span>
        <span class="c-monitor-stat-card-value">56302</span>
        <span class="c-monitor-stat-card-sublabel">隧道设备</span>
        <span class="c-monitor-stat-card-badge">异常数: 5</span>
      </div>
    </div>

    <div class="c-monitor-stat-card c-monitor-stat-card-blue">
      <div class="c-monitor-stat-card-emoji">🏗️</div>
      <div class="c-monitor-stat-card-content">
        <span class="c-monitor-stat-card-label">总数</span>
        <span class="c-monitor-stat-card-value">1280</span>
        <span class="c-monitor-stat-card-sublabel">房建设施设备</span>
        <span class="c-monitor-stat-card-badge">异常数: 3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统注入，无需手动 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 24px;
}

.c-monitor-stat-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-stat-icon {
  width: 43px;
  height: 44px;
  flex-shrink: 0;
}

.c-monitor-stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-monitor-stat-label {
  font-size: 14px;
  font-weight: 400;
  color: @color-stat-label;
  line-height: 21px;
}

.c-monitor-stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 23.44px;
}

.c-monitor-stat-value-primary {
  color: @color-stat-value-primary;
}

.c-monitor-stat-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: @color-stat-card-bg;
}

.c-monitor-stat-card-blue {
  background: rgba(25, 144, 255, 0.2);
}

.c-monitor-stat-card-icon {
  width: 43px;
  height: 44px;
  flex-shrink: 0;
}

.c-monitor-stat-card-emoji {
  font-size: 32px;
  width: 43px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-monitor-stat-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-monitor-stat-card-label {
  font-size: 12px;
  font-weight: 400;
  color: @color-stat-card-label;
  line-height: 21px;
}

.c-monitor-stat-card-value {
  font-size: 20px;
  font-weight: 700;
  color: @color-stat-card-value;
  line-height: 23.44px;
}

.c-monitor-stat-card-sublabel {
  font-size: 10px;
  font-weight: 400;
  color: @color-stat-card-sublabel;
  line-height: 21px;
}

.c-monitor-stat-card-badge {
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 59, 48, 1);
  background: rgba(255, 59, 48, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  margin-top: 4px;
}
</style>
```