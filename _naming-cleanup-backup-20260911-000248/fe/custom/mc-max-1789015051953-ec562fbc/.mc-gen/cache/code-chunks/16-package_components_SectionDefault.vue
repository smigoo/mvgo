<template>
  <div class="c-device-monitor-default" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <!-- 南北接线设备标题 -->
    <div class="c-device-monitor-tab-text-group">
      <span class="c-device-monitor-tab-name c-device-monitor-tab-name-secondary">南北接线<br/>设备</span>
    </div>
    <!-- line1: 总数行 -->
    <div class="c-device-monitor-line1">
      <span class="c-device-monitor-summary-label">总数:</span>
      <span class="c-device-monitor-summary-value-primary">1280</span>
    </div>
    <!-- line2: 异常数行 -->
    <div class="c-device-monitor-line2">
      <span class="c-device-monitor-summary-label">异常数:</span>
      <span class="c-device-monitor-summary-value-error">3</span>
    </div>
    <!-- 图标区域 -->
    <div class="c-device-monitor-icon">
      <img :src="icon2" class="c-device-monitor-tab-icon" alt="南北接线设备图标" />
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-default {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 12px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 6px;
}

.c-device-monitor-tab-text-group {
  display: flex;
  align-items: flex-start;
  margin-bottom: 4px;
}

.c-device-monitor-tab-name-secondary {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  text-align: center;
  line-height: 10px;
}

.c-device-monitor-line1 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  height: 23px;
  margin-bottom: 2px;
}

.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  height: 23px;
}

.c-device-monitor-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  line-height: 21px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-summary-value-primary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorPrimary, #1990ff);
  line-height: 23px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-summary-value-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorError, #ff4d4f);
  line-height: 23px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-tab-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}
</style>