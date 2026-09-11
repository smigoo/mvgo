<template>
  <div
    class="c-device-monitor-group-2136637559"
    :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-group-2136637559-icon">
      <img :src="icon10" class="c-device-monitor-group-2136637559-icon-img" />
    </div>
    <div class="c-device-monitor-group-2136637559-content">
      <div class="c-device-monitor-group-2136637559-name">紧急电话</div>
      <div class="c-device-monitor-group-2136637559-value">(0/484)</div>
    </div>
  </div>
</template>

<script setup>
// bg10 和 icon10 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637559 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
  gap: 6px;
  position: relative;
  overflow: hidden;
}

.c-device-monitor-group-2136637559-icon {
  flex-shrink: 0;
  width: 27px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-group-2136637559-icon-img {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637559-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.c-device-monitor-group-2136637559-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, #333333);
  white-space: nowrap;
}

.c-device-monitor-group-2136637559-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
  white-space: nowrap;
}
</style>