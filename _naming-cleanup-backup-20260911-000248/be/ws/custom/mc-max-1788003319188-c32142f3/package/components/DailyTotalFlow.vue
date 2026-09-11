<template>
  <div class="c-mc-max-1788003319188-c32142f3-c-monitor-daily-total-flow">
    <!-- 子标题区域 -->
    <div class="c-mc-max-1788003319188-c32142f3-c-monitor-section-header">
      <div class="c-mc-max-1788003319188-c32142f3-c-monitor-section-title">
        <img :src="icon1" class="c-mc-max-1788003319188-c32142f3-c-monitor-title-icon" alt="" />
        <span class="c-mc-max-1788003319188-c32142f3-c-monitor-title-text">当日总流量</span>
      </div>
      <div class="c-mc-max-1788003319188-c32142f3-c-monitor-time-selector">
        <span class="c-mc-max-1788003319188-c32142f3-c-monitor-selector-text">24小时</span>
        <svg class="c-mc-max-1788003319188-c32142f3-c-monitor-selector-arrow" width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="#A8ABB2"/>
        </svg>
      </div>
    </div>

    <!-- 流量统计卡片区 -->
    <div 
      class="c-mc-max-1788003319188-c32142f3-c-monitor-flow-cards" 
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 江阴靖江长江隧道 -->
      <div class="c-mc-max-1788003319188-c32142f3-c-monitor-flow-card">
        <div class="c-mc-max-1788003319188-c32142f3-c-monitor-card-label">江阴靖江长江隧道</div>
        <div class="c-mc-max-1788003319188-c32142f3-c-monitor-card-value c-mc-max-1788003319188-c32142f3-c-monitor-tunnel-value">{{ tunnelTraffic }}</div>
        <div class="c-mc-max-1788003319188-c32142f3-c-monitor-tunnel-icon-wrapper">
          <img :src="bgm" class="c-mc-max-1788003319188-c32142f3-c-monitor-tunnel-icon" alt="" />
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-mc-max-1788003319188-c32142f3-c-monitor-flow-card">
        <div class="c-mc-max-1788003319188-c32142f3-c-monitor-card-label">江阴大桥</div>
        <div class="c-mc-max-1788003319188-c32142f3-c-monitor-card-value c-mc-max-1788003319188-c32142f3-c-monitor-bridge-value">{{ bridgeTraffic }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { defineProps} from 'vue'

defineProps({
  tunnelTraffic: {
    type: String,
    default: '34,620'
  },
  bridgeTraffic: {
    type: String,
    default: '82,379'
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total-flow {
flex: 1 1 0;
  min-height: 0;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-time-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: linear-gradient(to bottom, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
}

.c-monitor-selector-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: #333333;
}

.c-monitor-selector-arrow {
  flex-shrink: 0;
}

.c-monitor-flow-cards {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  position: relative;
  min-height: 91px;
  overflow: hidden;
}

.c-monitor-flow-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.c-monitor-flow-card:first-child {
  align-items: flex-start;
}

.c-monitor-flow-card:last-child {
  align-items: flex-end;
}

.c-monitor-card-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
}

.c-monitor-card-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
}

.tunnel-value {
  color: #006fe3;
}

.bridge-value {
  color: #0c9dbe;
}

.c-monitor-tunnel-icon-wrapper {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 62px;
  height: 62px;
  z-index: 0;
}

.c-monitor-tunnel-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>