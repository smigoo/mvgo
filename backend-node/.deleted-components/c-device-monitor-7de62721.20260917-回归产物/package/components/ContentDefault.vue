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
      <img :src="icon3" class="c-device-monitor-default-icon" style="width:35px;height:28px;object-fit:contain" />
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
import bg2 from '../../resources/images/bg-8807.png'
import icon3 from '../../resources/images/icon-8817.png'

// 资源变量由系统自动注入，无需手动 import
// bg2, icon3
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-default {  width: 100%;
padding: 12px 16px;
  box-sizing: border-box;
  overflow: hidden}

.c-device-monitor-default-icon-wrapper {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  margin-right: 12px;
}

.c-device-monitor-default-icon {object-fit: contain}

.c-device-monitor-default-line1,
.c-device-monitor-default-line2 {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-device-monitor-default-label {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: var(--colorTextBase, rgba(255, 255, 255, 0.85));
  line-height: 1.5;
}

.c-device-monitor-default-value {
  font-size: calc(var(--fontSize, 14px) * 1.43);
  font-weight: 700;
  color: var(--color-primary, #1890ff);
  line-height: 1.17;
}

.c-device-monitor-default-value-danger {
  font-size: calc(var(--fontSize, 14px) * 1.43);
  font-weight: 700;
  color: #e03434;
  line-height: 1.17;
}

.c-device-monitor-default-title {
  font-size: calc(var(--fontSize, 14px) * 0.86);
  color: var(--colorTextBase, rgba(255, 255, 255, 0.85));
  line-height: 1.25;
  margin-top: 4px;
}
</style>