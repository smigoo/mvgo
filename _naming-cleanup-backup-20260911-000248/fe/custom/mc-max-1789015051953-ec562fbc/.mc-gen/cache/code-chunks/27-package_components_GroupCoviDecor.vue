<template>
  <div class="c-device-monitor-group-2136637555" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <img :src="icon5" class="c-device-monitor-device-icon" alt="CO/VI检测器图标" />
    <span class="c-device-monitor-device-name">CO/VI检测器</span>
    <span class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">(0/484)</span>
    </span>
  </div>
</template>

<script setup>
// bg5 和 icon5 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637555 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  padding: 6px 8px;
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
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
}
</style>