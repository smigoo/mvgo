<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备汇总卡 -->
    <div
      class="c-monitor-summary-card"
    >
      <div class="c-monitor-summary-card-inner">
        <div class="c-monitor-summary-card-icon-wrap">
          <img :src="icon1" class="c-monitor-summary-card-icon" alt="隧道设备图标"/>
        </div>
        <div class="c-monitor-summary-card-info">
          <div class="c-monitor-summary-card-title" :style="{ backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">隧道设备</div>
          <div class="c-monitor-summary-card-row" :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
            <span class="c-monitor-summary-card-label" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总 数:</span>
            <span class="c-monitor-summary-card-value-total" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">56302</span>
          </div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-label">异常数:</span>
            <span class="c-monitor-summary-card-value-error" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">5</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 南北横线设备汇总卡 -->
    <div
      class="c-monitor-summary-card"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-summary-card-inner">
        <div class="c-monitor-summary-card-icon-wrap">
          <img :src="icon2" class="c-monitor-summary-card-icon" alt="南北横线设备图标" />
        </div>
        <div class="c-monitor-summary-card-info">
          <div class="c-monitor-summary-card-title c-monitor-summary-card-title-dark">南北接线 / 设备</div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-label c-monitor-summary-card-label-dark" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总 数:</span>
            <span class="c-monitor-summary-card-value-total c-monitor-summary-card-value-total-dark" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">1280</span>
          </div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-label c-monitor-summary-card-label-dark">异常数:</span>
            <span class="c-monitor-summary-card-value-error">3</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import bg13 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon2 from '../../resources/images/icon-8817.png'
import bg1 from '../../resources/images/bg-8788.png'
const bg14 = bg13
const bg4 = bg13
const bg5 = bg13
const bg6 = bg13
const bg7 = bg13
const bg8 = bg13
const bg12 = bg13


// icon1 = icon-8798.png（隧道设备图标），icon2 = icon-8817.png（南北横线设备图标）
// bg1 = bg-8788.png（隧道卡背景），bg2 = bg-8807.png（南北横线卡背景）
// 以上变量由系统自动注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
flex: 1 1 0;
  width: 100%;

  display: flex;
  flex-direction: row;
  gap: 10px;
  flex-shrink: 0;
  padding: 0 6px;
}

.c-monitor-summary-card {
  width: 190px;
  height: 65px;
  overflow: hidden;
  flex-shrink: 0;
}

.c-monitor-summary-card-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  flex: 1 1 0;
  padding: 8px 12px;
  box-sizing: border-box;
}

.c-monitor-summary-card-icon-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-summary-card-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-summary-card-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
  min-height: 0;}

.c-monitor-summary-card-title {
  font-family: YouSheBiaoTiHei, sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.3;
  white-space: nowrap;
}

.c-monitor-summary-card-title-dark {
  color: #333333;
}

.c-monitor-summary-card-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
}

.c-monitor-summary-card-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-summary-card-label-dark {
  color: rgba(51, 51, 51, 0.75);
}

.c-monitor-summary-card-value-total {
  font-family: Roboto, sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.286);
  font-weight: 700;
  color: rgba(255, 255, 255, 1);
  line-height: 1.2;
  white-space: nowrap;
}

.c-monitor-summary-card-value-total-dark {
  color: rgba(51, 51, 51, 1);
}

.c-monitor-summary-card-value-error {
  font-family: Roboto, sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 700;
  color: rgba(255, 80, 80, 1);
  line-height: 1.2;
  white-space: nowrap;
}
</style>