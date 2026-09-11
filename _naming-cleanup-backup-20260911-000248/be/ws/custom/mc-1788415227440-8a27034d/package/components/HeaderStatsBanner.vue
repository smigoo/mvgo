<template>
  <div class="c-monitor-header-stats-banner">
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
    
    <div class="c-monitor-header-stats-group">
      <div class="c-monitor-header-stat-item">
        <img :src="icon1" class="c-monitor-header-stat-icon" alt="" />
        <span class="c-monitor-header-stat-label">设备类型</span>
        <span class="c-monitor-header-stat-value">28</span>
      </div>
      
      <div class="c-monitor-header-stat-item">
        <img :src="icon1" class="c-monitor-header-stat-icon" alt="" />
        <span class="c-monitor-header-stat-label">设备总数</span>
        <span class="c-monitor-header-stat-value">68562</span>
      </div>
      
      <div class="c-monitor-header-stat-item">
        <span class="c-monitor-header-stat-label">完好率</span>
        <span class="c-monitor-header-stat-value c-monitor-header-stat-value--primary">98%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'


import { inject} from 'vue'

</script>

<style lang="less" scoped>
@fontWeightStrong: 400;
@color-success: #52c41a;

@import '../../resources/styles/index.less';

.c-monitor-header-stats-banner {
flex: 1 1 0;

  width: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  flex-shrink: 0;
}

.c-monitor-header-stat-title {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: @fontWeightStrong;
  color: var(--color-primary, rgba(74, 144, 226, 1));
}

.c-monitor-header-stats-group {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-left: auto;
}

.c-monitor-header-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-header-stat-label {
  font-size: var(--fontSize, 14px);
  color: var(--color-text-base, rgba(230, 230, 230, 1));
}

.c-monitor-header-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: @fontWeightStrong;
  color: var(--color-primary, rgba(74, 144, 226, 1));
}

.c-monitor-header-stat-value--primary {
  color: @color-success;
}
</style>