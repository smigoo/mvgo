<template>
  <div class="c-monitor-header-stats">
    <div class="c-monitor-stat-item c-monitor-stat-item-main">
      <img :src="icon1" class="c-monitor-stat-icon" alt="设备监测" />
      <span class="c-monitor-stat-label">设备监测</span>
    </div>
    <div class="c-monitor-stat-item">
      <img :src="icon2" class="c-monitor-stat-icon-small" alt="设备类型" />
      <div class="c-monitor-stat-content">
        <span class="c-monitor-stat-label">设备类型</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-primary">28</span>
      </div>
    </div>
    <div class="c-monitor-stat-item">
      <div class="c-monitor-stat-content">
        <span class="c-monitor-stat-label">设备总数</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-primary">68562</span>
      </div>
    </div>
    <div class="c-monitor-stat-item">
      <div class="c-monitor-stat-content">
        <span class="c-monitor-stat-label">完好率</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-success">98%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

// 接收父组件传递的统计数据
defineProps({
  stats: {
    type: Object,
    default: () => ({
      title: '设备监测',
      deviceType: 28,
      deviceTotal: 68562,
      completeRate: 98
    })
  }
})

// 图标变量由系统自动注入
// const icon1 = ...
// const icon2 = ...
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 16px;
  background-image: url(@bg2);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 6px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;

  &.c-monitor-stat-item-main {
    gap: 12px;
  }
}

.c-monitor-stat-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.c-monitor-stat-icon-small {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.c-monitor-stat-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.c-monitor-stat-label {
  font-size: 12px;
  color: @color-text-secondary;
  line-height: 1.5;
}

.c-monitor-stat-value {
  font-size: 18px;
  font-weight: bold;
  line-height: 1.3;

  &.c-monitor-stat-value-primary {
    background: linear-gradient(to right, #e1f0ff 0%, #00ccff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  &.c-monitor-stat-value-success {
    color: #08a3a5;
  }
}
</style>
```