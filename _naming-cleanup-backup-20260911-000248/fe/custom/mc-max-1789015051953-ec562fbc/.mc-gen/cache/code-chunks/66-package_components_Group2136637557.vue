<template>
  <div
    class="c-device-monitor-group-2136637557"
    :style="{ backgroundImage: `url(${bg13})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon13" class="c-device-monitor-device-icon" alt="压力传感器图标" />
    <div class="c-device-monitor-device-name">压力传感器</div>
    <div class="c-device-monitor-device-value">
      <span class="c-device-monitor-device-num-secondary">(0/484)</span>
    </div>
  </div>
</template>

<script setup>
// bg13 和 icon13 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637557 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 4px;
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
  text-align: center;
  margin-top: 2px;
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
  white-space: nowrap;
}
</style>