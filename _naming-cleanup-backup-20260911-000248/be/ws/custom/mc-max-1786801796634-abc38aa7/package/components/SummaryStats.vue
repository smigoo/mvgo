<template>
  <div class="c-monitor-summary-stats">
    <div class="c-monitor-summary-header">
      <div class="c-monitor-summary-title">
        <img :src="icon3" alt="标题图标" class="c-monitor-summary-title-icon" />
        <span class="c-monitor-summary-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-summary-time-select" :bordered="false">
        <a-select-option value="24h">24小时</a-select-option>
      </a-select>
    </div>

    <div 
      class="c-monitor-summary-stats-row"
      :style="{ 
        backgroundImage: `url(${bgm_2})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <div class="c-monitor-summary-stat-item">
        <span class="c-monitor-summary-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-summary-stat-value c-monitor-summary-stat-value-tunnel">34,620</span>
      </div>
      
      <div class="c-monitor-summary-center-icon">
        <img :src="icon4" alt="装饰图标" class="c-monitor-summary-center-img" />
      </div>

      <div class="c-monitor-summary-stat-item">
        <span class="c-monitor-summary-stat-label">江阴大桥</span>
        <span class="c-monitor-summary-stat-value c-monitor-summary-stat-value-bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import icon4 from '../../resources/images/icon-3441.png'
import bgm_2 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-stats {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-monitor-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-summary-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-summary-title-icon {
  width: 18px;
  height: 18px;
}

.c-monitor-summary-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

:deep(.ant-select) {
  width: 100px;
}

:deep(.ant-select-selector) {
  /* [Style Refine] fills → linear-gradient + border #A1CDFF */
  background: linear-gradient(180deg, #FFFFFF 0%, #E2F0FF 36%, #DEEEFF 69%, #FFFFFF 100%) !important;
  border: 1px solid #A1CDFF !important;
  border-radius: 4px !important;
  box-shadow: none !important;
  height: 30px !important;
  color: #333333;
  font-size: 14px;
}

:deep(.ant-select-selection-item) {
  line-height: 30px !important;
  color: #333333;
}

:deep(.ant-select-arrow) {
  color: #333333;
}

.c-monitor-summary-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 91px;
  position: relative;
  padding: 0 20px;
  box-sizing: border-box;
}

/* [Layout Refine] Figma bbox alignment → flex-start/flex-end */
.c-monitor-summary-stat-item {
  display: flex;
  flex-direction: column;
  z-index: 2;
}

.c-monitor-summary-stat-item:first-child {
  align-items: flex-end;
  text-align: right;
}

.c-monitor-summary-stat-item:last-child {
  align-items: flex-start;
  text-align: left;
}

.c-monitor-summary-stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-summary-stat-value {
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
}

/* [Style Refine] fills[0].color → rgb(0, 110, 227) */
.c-monitor-summary-stat-value-tunnel {
  color: #006EE3;
}

/* [Style Refine] fills[0].color → rgb(12, 157, 190) */
.c-monitor-summary-stat-value-bridge {
  color: #0C9DBE;
}

.c-monitor-summary-center-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}

/* [Layout Refine] Figma bbox width/height → 62px */
.c-monitor-summary-center-img {
  width: 62px;
  height: 62px;
}
</style>