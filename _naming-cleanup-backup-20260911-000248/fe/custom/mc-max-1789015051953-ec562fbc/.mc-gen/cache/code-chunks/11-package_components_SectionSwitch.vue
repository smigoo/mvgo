<template>
  <div class="c-device-monitor-switch">
    <!-- 隧道设备（激活态） -->
    <div
      class="c-device-monitor-active"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      @click="$emit('tab-change', 'tunnel')"
    >
      <div class="c-device-monitor-tab-text-group">
        <span class="c-device-monitor-tab-name c-device-monitor-tab-name--active">隧道设备</span>
        <div class="c-device-monitor-line1">
          <span class="c-device-monitor-summary-label">总数:</span>
          <span class="c-device-monitor-summary-value-primary">56302</span>
        </div>
        <div class="c-device-monitor-line2">
          <span class="c-device-monitor-summary-label">异常数:</span>
          <span class="c-device-monitor-summary-value-error">5</span>
        </div>
      </div>
      <div class="c-device-monitor-icon">
        <img :src="icon1" class="c-device-monitor-tab-icon" alt="隧道设备图标" width="35" height="28" />
      </div>
    </div>

    <!-- 南北接线设备（默认态） -->
    <div
      class="c-device-monitor-default"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      @click="$emit('tab-change', 'nanbeilan')"
    >
      <div class="c-device-monitor-tab-text-group">
        <span class="c-device-monitor-tab-name c-device-monitor-tab-name--default">南北接线
设备</span>
        <div class="c-device-monitor-line1">
          <span class="c-device-monitor-summary-label">总数:</span>
          <span class="c-device-monitor-summary-value-primary">1280</span>
        </div>
        <div class="c-device-monitor-line2">
          <span class="c-device-monitor-summary-label">异常数:</span>
          <span class="c-device-monitor-summary-value-error">3</span>
        </div>
      </div>
      <div class="c-device-monitor-icon">
        <img :src="icon2" class="c-device-monitor-tab-icon" alt="南北接线设备图标" width="35" height="28" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  activeSection: {
    type: String,
    default: 'tunnel'
  }
})

defineEmits(['tab-change'])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-switch {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 65px;
  flex-shrink: 0;
}

.c-device-monitor-active,
.c-device-monitor-default {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  box-sizing: border-box;
  cursor: pointer;
  border-radius: 6px;
}

.c-device-monitor-tab-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
}

.c-device-monitor-tab-name {
  font-family: YouSheBiaoTiHei, sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  white-space: pre-line;
  line-height: 1.2;
}

.c-device-monitor-tab-name--active {
  color: #ffffff;
}

.c-device-monitor-tab-name--default {
  color: @color-text-primary;
}

.c-device-monitor-line1,
.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: @color-text-primary;
  line-height: 21px;
}

.c-device-monitor-summary-value-primary {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: @color-primary;
  line-height: 23px;
}

.c-device-monitor-summary-value-error {
  font-family: Roboto, sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: @color-error;
  line-height: 23px;
}

.c-device-monitor-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-tab-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}
</style>