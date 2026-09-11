<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div
      class="c-monitor-summary-card c-monitor-summary-card--tunnel"
    >
      <div class="c-monitor-summary-card-header">
        <img :src="icon1" class="c-monitor-summary-card-icon" alt="隧道设备"/>
        <span class="c-monitor-summary-card-title" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">隧道设备</span>
      </div>
      <div class="c-monitor-summary-card-row" :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <span class="c-monitor-summary-card-label" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总  数:</span>
        <span class="c-monitor-summary-card-total" :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">56302</span>
      </div>
      <div class="c-monitor-summary-card-row">
        <span class="c-monitor-summary-card-label">异常数:</span>
        <span class="c-monitor-summary-card-abnormal" :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">5</span>
      </div>
    </div>

    <!-- 南北桥线设备卡片 -->
    <div
      class="c-monitor-summary-card c-monitor-summary-card--bridge"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-summary-card-header">
        <img :src="icon2" class="c-monitor-summary-card-icon" alt="南北桥线设备"  :style="{ backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"/>
        <span class="c-monitor-summary-card-title">南北桥线设备</span>
      </div>
      <div class="c-monitor-summary-card-row">
        <span class="c-monitor-summary-card-label">总  数:</span>
        <span class="c-monitor-summary-card-total">1280</span>
      </div>
      <div class="c-monitor-summary-card-row">
        <span class="c-monitor-summary-card-label">异常数:</span>
        <span class="c-monitor-summary-card-abnormal">3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import bg7 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon2 from '../../resources/images/icon-8817.png'
import bg1 from '../../resources/images/bg-8788.png'
const bg14 = bg7
const bg8 = bg7
const bg9 = bg7
const bg10 = bg7
const bg11 = bg7
const bg13 = bg7
const bg6 = bg7


// 系统自动注入 bg1, bg2, icon1, icon2 变量，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
width: 100%;

  display: flex;
  flex-direction: row;
  gap: 12px;
  flex: 1 1 0;
  min-height: 0;
  padding: 0 8px;
}

.c-monitor-summary-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 12px;
  overflow: hidden;
  position: relative;
  min-height: 0;}

.c-monitor-summary-card-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.c-monitor-summary-card-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-summary-card-title {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(255, 255, 255, 1);
  font-weight: normal;
  font-family: 'YouSheBiaoTiHei', sans-serif;
  white-space: nowrap;
}

.c-monitor-summary-card-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
}

.c-monitor-summary-card-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(255, 255, 255, 0.8);
  font-weight: normal;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-summary-card-total {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  color: rgba(255, 255, 255, 1);
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  line-height: 1.2;
}

.c-monitor-summary-card-abnormal {
  font-size: calc(var(--fontSize, 14px) * 1.143);
  color: rgba(255, 100, 100, 1);
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  line-height: 1.2;
}
</style>