<template>
  <div
    class="c-device-monitor-group-2136637558"
    :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <img :src="icon6" class="c-device-monitor-device-icon" alt="光照度变送器图标" />
    <div class="c-device-monitor-group-1321317970">
      <span class="c-device-monitor-device-name">光照度变送器</span>
      <span class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-secondary">(0/484)</span>
      </span>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637558 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  padding: 4px 6px;
  position: relative;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-group-1321317970 {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  flex: 1;
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