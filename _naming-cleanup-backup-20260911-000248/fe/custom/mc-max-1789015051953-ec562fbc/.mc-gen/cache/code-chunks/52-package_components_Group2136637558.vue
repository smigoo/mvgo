<template>
  <div
    class="c-device-monitor-group-2136637558"
    :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon6" class="c-device-monitor-device-icon" alt="图标" />
    <div class="c-device-monitor-device-info">
      <span class="c-device-monitor-device-name">光照度变送器</span>
      <span class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-secondary">(0/484)</span>
      </span>
    </div>
  </div>
</template>

<script setup>
// bg6 和 icon6 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637558 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
  gap: 6px;
  position: relative;

  .c-device-monitor-device-icon {
    width: 27px;
    height: 32px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .c-device-monitor-device-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    flex: 1;
    min-width: 0;

    .c-device-monitor-device-name {
      font-family: 'Source Han Sans CN', sans-serif;
      font-size: calc(@fontSize * 0.857);
      font-weight: 400;
      line-height: 18px;
      color: var(--colorTextBase, #333333);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .c-device-monitor-device-value {
      display: flex;
      flex-direction: row;
      align-items: center;

      .c-device-monitor-device-num-secondary {
        font-family: 'Roboto', sans-serif;
        font-size: calc(@fontSize * 1.143);
        font-weight: 500;
        line-height: 18.75px;
        color: var(--colorTextSecondary, #666666);
      }
    }
  }
}
</style>