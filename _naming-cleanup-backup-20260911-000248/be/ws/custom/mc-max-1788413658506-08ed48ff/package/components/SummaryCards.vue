<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
<div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg2})` }" >
      <img :src="icon1" class="c-monitor-card-icon" alt="隧道设备" />
      <div class="c-monitor-card-content">
        <div class="c-monitor-card-label">隧道设备</div>
        <div class="c-monitor-card-row">
          <span class="c-monitor-card-row-label">总 数:</span>
          <span class="c-monitor-card-row-value">56302</span>
        </div>
        <div class="c-monitor-card-row">
          <span class="c-monitor-card-row-label">异常数:</span>
          <span class="c-monitor-card-row-value c-monitor-card-row-value--danger">5</span>
        </div>
      </div>
    </div>

    <!-- 南北拓线设备卡片 -->
<div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg3})` }" >
      <img :src="icon2" class="c-monitor-card-icon" alt="南北拓线设备" />
      <div class="c-monitor-card-content">
        <div class="c-monitor-card-label">南北拓线设备</div>
        <div class="c-monitor-card-row">
          <span class="c-monitor-card-row-label">总 数:</span>
          <span class="c-monitor-card-row-value">1280</span>
        </div>
        <div class="c-monitor-card-row">
          <span class="c-monitor-card-row-label">异常数:</span>
          <span class="c-monitor-card-row-value c-monitor-card-row-value--danger">3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-8807.png'
import icon1 from '../../resources/images/icon-8798.png'
import bg3 from '../../resources/images/bg-8439.png'
import icon2 from '../../resources/images/icon-8817.png'
import bg1 from '../../resources/images/bg-8788.png'


import { ref} from 'vue'

// 资源变量（系统自动注入，不要手写 import ）
// bg2: 隧道设备背景图
// bg3: 南北拓线设备背景图
// icon1: 隧道图标
// icon2: 南北拓线图标
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
flex: 1 1 0;

  display: flex;
  gap: 11px;
  width: 100%;
}

.c-monitor-summary-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  min-height: 64px;
}

.c-monitor-card-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  min-height: 0;}

.c-monitor-card-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: normal;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.33;
  white-space: nowrap;
}

.c-monitor-card-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-monitor-card-row-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: normal;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
  white-space: nowrap;
}

.c-monitor-card-row-value {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  font-weight: bold;
  color: rgba(255, 255, 255, 1);
  line-height: 1.3;
  font-family: Roboto, sans-serif;
}

.c-monitor-card-row-value--danger {
  color: rgba(255, 100, 100, 1);
  font-size: calc(var(--fontSize, 14px) * 1);
}
</style>