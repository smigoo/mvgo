<template>
  <div
    class="c-device-monitor-active"
    :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <!-- 隧道设备标题 -->
    <div class="c-device-monitor-tab-text-group">
      <span class="c-device-monitor-tab-name">隧道设备</span>
    </div>

    <!-- 总数行 -->
    <div class="c-device-monitor-line1">
      <span class="c-device-monitor-summary-label">总数:</span>
      <span class="c-device-monitor-summary-value-primary">56302</span>
    </div>

    <!-- 异常数行 -->
    <div class="c-device-monitor-line2">
      <span class="c-device-monitor-summary-label">异常数:</span>
      <span class="c-device-monitor-summary-value-error">5</span>
    </div>

    <!-- 图标区域 -->
    <div class="c-device-monitor-icon">
      <img :src="icon1" class="c-device-monitor-tab-icon" alt="隧道设备图标" />
    </div>
  </div>
</template>

<script setup>
// bg1 和 icon1 由系统自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-active {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
}

.c-device-monitor-tab-text-group {
  display: flex;
  align-items: center;
}

.c-device-monitor-tab-name {
  font-family: YouSheBiaoTiHei, sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: var(--colorBgWhite, #ffffff);
  white-space: nowrap;
}

.c-device-monitor-line1 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: @fontSize;
  font-weight: 400;
  color: var(--colorBgWhite, #ffffff);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-summary-value-primary {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorPrimary, #1990ff);
  white-space: nowrap;
}

.c-device-monitor-summary-value-error {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorError, #ff4d4f);
  white-space: nowrap;
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