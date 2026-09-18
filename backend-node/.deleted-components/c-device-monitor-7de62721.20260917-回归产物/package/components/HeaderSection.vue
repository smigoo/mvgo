<template>
  <div class="c-device-monitor-header" style="display:flex;flex-direction:row;align-items:center;">
    <!-- 左侧标题装饰 -->

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
      <img :src="icon1" class="c-device-monitor-header-icon-end" alt="" style="width:16px;height:16px;object-fit:contain" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Frame-8856.png'

// 资源变量由系统注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-header {  width: 100%;
position: relative}

.c-device-monitor-header-title {font-size: calc(var(--fontSize, 14px) * 1.143);
  font-weight: 700;
  line-height: 1.2;
  background: linear-gradient(180deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap}

.c-device-monitor-stat-label {
  font-size: var(--fontSize, 14px);
  color: var(--colorTextSecondary, rgba(255, 255, 255, 0.65));
  line-height: 1.5;
  white-space: nowrap;
}

.c-device-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.429);
  font-weight: 700;
  line-height: 1.17;
  color: var(--color-primary, #1890ff);
  white-space: nowrap;
}

.c-device-monitor-stat-value-success {
  color: var(--color-success, #52c41a);
}

</style>