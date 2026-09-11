<template>
  <div
    class="c-device-monitor-group-2136637321"
    :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
  >
    <!-- 设备图标 -->
    <div class="c-device-monitor-summary-icon">
      <img :src="icon3" alt="摄像机图标" class="c-device-monitor-device-icon-img" />
    </div>

    <!-- 右侧信息区 -->
    <div class="c-device-monitor-group-2136637321-info">
      <!-- 设备名称 -->
      <div class="c-device-monitor-summary-title">摄像机</div>

      <!-- 总数行 -->
      <div class="c-device-monitor-line1">
        <span class="c-device-monitor-summary-label">总数:</span>
        <span class="c-device-monitor-summary-value-primary">56302</span>
      </div>

      <!-- 异常数行 -->
      <div class="c-device-monitor-line2">
        <span class="c-device-monitor-summary-label">异常数:</span>
        <span class="c-device-monitor-summary-value-error">5</span>
      </div>
    </div>

    <!-- 装饰点组 -->
    <div class="c-device-monitor-group-1321317970">
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot--sm"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot--md"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot--sm"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot--md"></span>
      <span class="c-device-monitor-group-1321317970-dot c-device-monitor-group-1321317970-dot--md"></span>
    </div>
  </div>
</template>

<script setup>
// bg3、icon3 由系统自动注入，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-2136637321 {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 10px;
  gap: 8px;
  position: relative;
  overflow: hidden;
}

.c-device-monitor-summary-icon {
  flex-shrink: 0;
  width: 27px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-device-icon-img {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-group-2136637321-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.c-device-monitor-summary-title {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: @color-text-primary;
  line-height: 1.3;
  white-space: nowrap;
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
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-summary-value-primary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.428);
  font-weight: 700;
  color: @color-primary;
  white-space: nowrap;
}

.c-device-monitor-summary-value-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.428);
  font-weight: 700;
  color: @color-error;
  white-space: nowrap;
}

.c-device-monitor-group-1321317970 {
  position: absolute;
  right: 8px;
  bottom: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}

.c-device-monitor-group-1321317970-dot {
  display: inline-block;
  border-radius: 50%;
  background: @color-primary;
  opacity: 0.4;

  &--sm {
    width: 0.65px;
    height: 0.65px;
  }

  &--md {
    width: 1.29px;
    height: 1.29px;
  }
}
</style>