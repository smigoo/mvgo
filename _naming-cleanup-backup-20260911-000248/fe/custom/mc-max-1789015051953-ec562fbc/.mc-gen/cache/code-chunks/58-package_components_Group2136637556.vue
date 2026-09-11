<template>
  <div
    class="c-device-monitor-group-2136637556"
    :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <div class="c-device-monitor-group-2136637556-icon">
      <img :src="icon9" class="c-device-monitor-group-2136637556-icon-img" />
    </div>
    <div class="c-device-monitor-group-2136637556-info">
      <span class="c-device-monitor-group-2136637556-name">温湿度传感器</span>
      <span class="c-device-monitor-group-2136637556-value">(0/484)</span>
    </div>
  </div>
</template>

<script setup>
// bg9 和 icon9 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637556 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
  gap: 6px;
  position: relative;

  .c-device-monitor-group-2136637556-icon {
    flex-shrink: 0;
    width: 27px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;

    .c-device-monitor-group-2136637556-icon-img {
      width: 27px;
      height: 32px;
      object-fit: contain;
    }
  }

  .c-device-monitor-group-2136637556-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;

    .c-device-monitor-group-2136637556-name {
      font-family: 'Source Han Sans CN', sans-serif;
      font-size: calc(@fontSize * 0.857);
      font-weight: 400;
      line-height: 18px;
      color: var(--colorTextBase, #333333);
      white-space: nowrap;
    }

    .c-device-monitor-group-2136637556-value {
      font-family: 'Roboto', sans-serif;
      font-size: calc(@fontSize * 0.857);
      font-weight: 500;
      line-height: 18.75px;
      color: var(--colorTextSecondary, #666666);
      white-space: nowrap;
    }
  }
}
</style>