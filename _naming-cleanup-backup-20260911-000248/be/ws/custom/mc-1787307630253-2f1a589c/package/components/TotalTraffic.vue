<template>
  <div class="c-monitor-total-traffic">
    <div class="c-monitor-total-traffic-header">
      <div class="c-monitor-total-traffic-title">
        <img :src="icon3" class="c-monitor-total-traffic-title-icon" alt="icon" />
        <span>当日总流量</span>
      </div>
      <a-select 
        v-model:value="timeRange" 
        class="c-monitor-total-traffic-select" 
        :bordered="false"
        :get-popup-container="(triggerNode) => triggerNode.parentNode"
      >
        <a-select-option value="24h">24小时</a-select-option>
      </a-select>
    </div>
    <div class="c-monitor-total-traffic-body" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-total-traffic-stat">
        <div class="c-monitor-total-traffic-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-total-traffic-stat-value tunnel">34,620</div>
      </div>
      <div class="c-monitor-total-traffic-stat">
        <div class="c-monitor-total-traffic-stat-label">江阴大桥</div>
        <div class="c-monitor-total-traffic-stat-value bridge">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

// 时间范围选择
const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &-header {
    display: flex;
    align-items: center;
    width: 100%;
    height: 30px;
  }

  &-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);

    &-icon {
      width: 18px;
      height: 18px;
    }
  }

  &-select {
    margin-left: auto;
    width: 100px;
    
    :deep(.ant-select-selector) {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      height: 30px !important;
      min-height: 30px !important;
    }
    :deep(.ant-select-selection-item) {
      font-size: 14px;
      color: #333333;
      line-height: 30px !important;
    }
    :deep(.ant-select-arrow) {
      color: #333333;
    }
  }

  &-body {
    width: 100%;
    height: 91px;
    background-size: 100% 100%;
    background-position: center;
    background-repeat: no-repeat;
    display: flex;
    align-items: center;
    justify-content: space-around;
  }

  &-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;

    &-label {
      font-size: 16px;
      font-weight: 500;
      color: #333333;
    }

    &-value {
      font-size: 24px;
      font-weight: 900;
      font-family: Roboto, sans-serif;
      line-height: 28px;

      &.tunnel {
        color: #006fe3;
      }

      &.bridge {
        color: #0c9dbe;
      }
    }
  }
}
</style>