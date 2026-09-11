<template>
  <div class="c-device-monitor-default">
    <div
      class="c-device-monitor-bg"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-device-monitor-tab-text-group">
        <div class="c-device-monitor-line1">
          <span class="c-device-monitor-summary-label">总数:</span>
          <span class="c-device-monitor-summary-value-primary">1280</span>
        </div>
        <div class="c-device-monitor-line2">
          <span class="c-device-monitor-summary-label">异常数:</span>
          <span class="c-device-monitor-summary-value-error">3</span>
        </div>
        <div class="c-device-monitor-tab-name c-device-monitor-default-name">南北接线<br/>设备</div>
      </div>
      <div class="c-device-monitor-icon">
        <img :src="icon2" class="c-device-monitor-tab-icon" alt="南北接线设备图标" />
      </div>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入 bg2、icon2 变量，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-default {
  width: 100%;
  height: 100%;

  .c-device-monitor-bg {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 8px 10px;
    box-sizing: border-box;
    gap: 8px;
  }

  .c-device-monitor-tab-text-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .c-device-monitor-line1,
  .c-device-monitor-line2 {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1px;
  }

  .c-device-monitor-summary-label {
    font-size: calc(@fontSize * 1);
    color: var(--colorTextBase, #333333);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .c-device-monitor-summary-value-primary {
    font-family: Roboto, sans-serif;
    font-size: calc(@fontSize * 1.43);
    font-weight: 700;
    color: var(--colorPrimary, #1990ff);
    white-space: nowrap;
  }

  .c-device-monitor-summary-value-error {
    font-family: Roboto, sans-serif;
    font-size: calc(@fontSize * 1.43);
    font-weight: 700;
    color: var(--colorError, #ff4d4f);
    white-space: nowrap;
  }

  .c-device-monitor-default-name {
    font-family: YouSheBiaoTiHei, sans-serif;
    font-size: calc(@fontSize * 0.857);
    color: var(--colorTextBase, #333333);
    text-align: center;
    line-height: 1.2;
    margin-top: 2px;
  }

  .c-device-monitor-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .c-device-monitor-tab-icon {
    width: 35px;
    height: 28px;
    object-fit: contain;
    flex-shrink: 0;
  }
}
</style>