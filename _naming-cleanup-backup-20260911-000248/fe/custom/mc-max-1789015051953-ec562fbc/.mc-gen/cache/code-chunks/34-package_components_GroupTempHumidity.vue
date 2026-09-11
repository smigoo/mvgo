<template>
  <div
    class="c-device-monitor-group-2136637556"
    :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon9" class="c-device-monitor-device-icon" alt="温湿度传感器图标" />
    <div class="c-device-monitor-device-name">温湿度传感器</div>
    <div class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">(0/484)</span>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入 bg9、icon9 变量，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637556 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  padding: 4px 6px;
  position: relative;
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
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
}
</style>