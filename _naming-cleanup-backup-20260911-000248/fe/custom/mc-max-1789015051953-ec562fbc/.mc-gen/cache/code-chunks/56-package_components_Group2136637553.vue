<template>
  <div
    class="c-device-monitor-group-2136637553"
    :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-group-2136637553-icon-wrap">
      <img :src="icon8" class="c-device-monitor-group-2136637553-icon" alt="风速风向仪图标" />
    </div>
    <div class="c-device-monitor-group-2136637553-name">风速风向仪</div>
    <div class="c-device-monitor-group-2136637553-value">
      <span class="c-device-monitor-group-2136637553-num-error">(1/484)</span>
    </div>
  </div>
</template>

<script setup>
// bg8 和 icon8 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637553 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 4px 6px;
  position: relative;
  overflow: hidden;
}

.c-device-monitor-group-2136637553-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637553-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637553-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, #333333);
  text-align: center;
  white-space: nowrap;
  margin-top: 2px;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637553-value {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637553-num-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorError, #ff4d4f);
  text-align: left;
  white-space: nowrap;
}
</style>