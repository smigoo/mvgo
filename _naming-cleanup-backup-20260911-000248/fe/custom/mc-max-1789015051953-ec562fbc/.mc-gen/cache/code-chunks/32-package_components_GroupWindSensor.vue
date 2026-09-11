<template>
  <div
    class="c-device-monitor-group-2136637553"
    :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-device-icon">
      <img :src="icon8" alt="风速风向仪" width="27" height="32" />
    </div>
    <div class="c-device-monitor-device-name">风速风向仪</div>
    <div class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">(1/484)</span>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入 bg8、icon8
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637553 {
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 27px;
    height: 32px;
    object-fit: contain;
    display: block;
  }
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, rgba(51, 51, 51, 1));
  text-align: center;
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
  color: var(--colorTextSecondary, rgba(102, 102, 102, 1));
  text-align: center;
}
</style>