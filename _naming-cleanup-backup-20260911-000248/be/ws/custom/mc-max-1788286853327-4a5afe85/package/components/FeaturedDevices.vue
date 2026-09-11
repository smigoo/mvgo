<template>
  <div class="c-monitor-featured-devices">
    <!-- 左侧高亮卡：隧道设备 -->
<div class="c-monitor-featured-card" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }" >
      <img :src="icon1" alt="隧道设备图标" class="c-monitor-featured-icon" />
      <div class="c-monitor-featured-info">
        <div class="c-monitor-featured-name">隧道设备</div>
        <div class="c-monitor-featured-total">
          <span class="c-monitor-featured-total-label">总数:</span>
          <span class="c-monitor-featured-total-value">56302</span>
        </div>
        <div class="c-monitor-featured-alert">
          <span class="c-monitor-featured-alert-label">异常数:</span>
          <span class="c-monitor-featured-alert-value">5</span>
        </div>
      </div>
    </div>

    <!-- 右侧高亮卡：南北接线设备 -->
<div class="c-monitor-featured-card" >
      <img :src="icon2" alt="南北接线设备图标" class="c-monitor-featured-icon" />
      <div class="c-monitor-featured-info">
        <div class="c-monitor-featured-name">南北接线设备</div>
        <div class="c-monitor-featured-total">
          <span class="c-monitor-featured-total-label">总数:</span>
          <span class="c-monitor-featured-total-value">1280</span>
        </div>
        <div class="c-monitor-featured-alert">
          <span class="c-monitor-featured-alert-label">异常数:</span>
          <span class="c-monitor-featured-alert-value">3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
import icon1 from '../../resources/images/icon-8798.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon2 from '../../resources/images/icon-8817.png'


// 资源变量由系统自动注入：bg1 / bg2 / icon1 / icon2
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-featured-devices {
flex: 1 1 0;

  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.c-monitor-featured-card {
  flex: 1;
  min-width: 0;
  height: 110px;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.c-monitor-featured-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-featured-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-height: 0;}

.c-monitor-featured-name {
  font-size: @fontSize;
  color: rgba(255, 255, 255, 1);
  white-space: nowrap;
}

.c-monitor-featured-total {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-monitor-featured-total-label {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.c-monitor-featured-total-value {
  font-size: calc(@fontSize * 1.4286);
  font-weight: 700;
  color: rgba(255, 255, 255, 1);
  line-height: 1.1;
  white-space: nowrap;
}

.c-monitor-featured-alert {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-monitor-featured-alert-label {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(255, 59, 48, 1);
  white-space: nowrap;
}

.c-monitor-featured-alert-value {
  font-size: @fontSize;
  font-weight: 700;
  color: rgba(255, 59, 48, 1);
  line-height: 1.2;
  white-space: nowrap;
}
</style>