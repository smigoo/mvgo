<template>
  <div
    class="c-device-monitor-group-2136637554"
    :style="{ backgroundImage: `url(${bg12})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-device-icon">
      <img :src="icon12" alt="CO2传感器图标" width="27" height="32" />
    </div>
    <div class="c-device-monitor-group-1321317970">
      <div class="c-device-monitor-device-name">CO2传感器</div>
      <div class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-secondary">(0/484)</span>
      </div>
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
  padding: 0 8px;
  box-sizing: border-box;
  gap: 6px;
  flex-shrink: 0;
}

.c-device-monitor-device-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, rgba(51, 51, 51, 1));
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
}
</style>