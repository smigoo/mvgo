<template>
  <div class="c-device-monitor-group-2136637554" :style="{ backgroundImage: `url(${bg12})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <img :src="icon12" class="c-device-monitor-device-icon" alt="CO2传感器图标" />
    <div class="c-device-monitor-cons">
      <span class="c-device-monitor-device-name">CO2传感器</span>
      <span class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-secondary">(0/484)</span>
      </span>
    </div>
  </div>
</template>

<script setup>
// bg12 和 icon12 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637554 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
}

.c-device-monitor-cons {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.c-device-monitor-device-name {
  font-size: calc(@fontSize * 0.857);
  font-family: 'Source Han Sans CN', sans-serif;
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-secondary {
  font-size: calc(@fontSize * 1.143);
  font-family: 'Roboto', sans-serif;
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
}
</style>