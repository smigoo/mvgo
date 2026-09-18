<template>
  <div 
    class="c-device-monitor-default" 
    :style="{ 
      backgroundImage: `url(${bg2})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div class="c-device-monitor-default-icon-wrapper">
      <img :src="icon3" class="c-device-monitor-default-icon" />
    </div>
    
    <div class="c-device-monitor-default-content">
      <div class="c-device-monitor-default-line1">
        <span class="c-device-monitor-default-label">总数:</span>
        <span class="c-device-monitor-default-value">1280</span>
      </div>
      
      <div class="c-device-monitor-default-line2">
        <span class="c-device-monitor-default-label">异常数:</span>
        <span class="c-device-monitor-default-value-danger">3</span>
      </div>
      
      <div class="c-device-monitor-default-title">南北接线<br/>设备</div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统自动注入，无需手动 import
// bg2, icon3
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-default {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  box-sizing: border-box;
  border-radius: 6px;
  overflow: hidden;
}

.c-device-monitor-default-icon-wrapper {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  margin-right: 12px;
}

.c-device-monitor-default-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-device-monitor-default-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-device-monitor-default-line1,
.c-device-monitor-default-line2 {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-device-monitor-default-label {
  font-size: calc(@fontSize * 1);
  color: @color-text-base;
  line-height: 1.5;
}

.c-device-monitor-default-value {
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  color: @color-primary;
  line-height: 1.17;
}

.c-device-monitor-default-value-danger {
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  color: #e03434;
  line-height: 1.17;
}

.c-device-monitor-default-title {
  font-size: calc(@fontSize * 0.86);
  color: @color-text-base;
  line-height: 1.25;
  margin-top: 4px;
}
</style>