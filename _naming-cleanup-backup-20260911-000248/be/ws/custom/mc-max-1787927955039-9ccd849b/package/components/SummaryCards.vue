<template>
  <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card">
      <img :src="icon1" class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-icon" alt="隧道设备" />
      <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-content">
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-label">隧道设备</div>
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-value">
          <span class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-unit">总数:</span>
          <span class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-number">56302</span>
        </div>
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-badge">异常数:5</div>
      </div>
    </div>

    <!-- 南北接线设备卡片 -->
    <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card">
      <img :src="icon2" class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-icon" alt="南北接线设备" />
      <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-content">
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-label">南北接线/设备</div>
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-value">
          <span class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-unit">总数:</span>
          <span class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-number">1280</span>
        </div>
        <div class="c-mc-max-1787927955039-9ccd849b-c-monitor-card-badge">异常数:3</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import icon2 from '../../resources/images/icon-8817.png'

// 资源变量由系统自动注入，无需手动 import
// 可用变量: icon1, icon2
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
height: 100%;
  width: 100%;

  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.c-monitor-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-image: url(''); /* 背景图通过 :style 动态绑定，此处预留 */;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 6px;
}

.c-monitor-card-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;}

.c-monitor-card-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.33;
  color: rgba(255, 255, 255, 0.85);
}

.c-monitor-card-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-monitor-card-unit {
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
}

.c-monitor-card-number {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.17;
  color: rgba(255, 255, 255, 1);
}

.c-monitor-card-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 1);
  background: rgba(245, 34, 45, 1);
  border-radius: 4px;
  align-self: flex-start;
}
</style>