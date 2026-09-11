<template>
  <div
    class="c-device-monitor-group-2136637560"
    :style="{ backgroundImage: `url(${bg14})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon14" class="c-device-monitor-device-icon" alt="水质监测设备图标" />
    <span class="c-device-monitor-device-name">水质监测设备</span>
    <span class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">(0/484)</span>
    </span>
  </div>
</template>

<script setup>
// bg14 和 icon14 由系统自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637560 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 117px;
  height: 64px;
  box-sizing: border-box;
  padding: 4px 6px;
  gap: 2px;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, rgba(51, 51, 51, 1));
  text-align: left;
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, rgba(102, 102, 102, 1));
  white-space: nowrap;
}
</style>