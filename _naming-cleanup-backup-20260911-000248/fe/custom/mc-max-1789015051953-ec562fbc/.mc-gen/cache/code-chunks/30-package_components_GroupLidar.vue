<template>
  <div
    class="c-device-monitor-group-2136637550"
    :style="{ backgroundImage: `url(${bg7})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon7" class="c-device-monitor-device-icon" alt="激光雷达" />
    <div class="c-device-monitor-device-name">激光雷达</div>
    <div class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">0</span>
      <span class="c-device-monitor-device-num-secondary">/484</span>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637550 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  box-sizing: border-box;
  padding: 4px 6px;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-device-name {
  font-size: calc(@fontSize * 0.857);
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
  line-height: 18px;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-secondary {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: var(--colorTextSecondary, #666666);
  line-height: 18.75px;
}
</style>