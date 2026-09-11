<template>
  <div
    class="c-device-monitor-group-2136637321"
    :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-summary-icon">
      <img :src="icon3" alt="摄像机图标" class="c-device-monitor-device-icon-img" />
    </div>
    <div class="c-device-monitor-group-1321317970">
      <div class="c-device-monitor-summary-title">摄像机</div>
      <div class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-error">(2/484)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入资源变量：bg3, icon3
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637321 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
  padding: 0 8px;
  gap: 8px;
  position: relative;
  flex-shrink: 0;
}

.c-device-monitor-summary-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-device-icon-img {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  display: block;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.c-device-monitor-summary-title {
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  line-height: 18px;
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-error {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: var(--colorError, #ff4d4f);
  line-height: 18.75px;
  white-space: nowrap;
}
</style>