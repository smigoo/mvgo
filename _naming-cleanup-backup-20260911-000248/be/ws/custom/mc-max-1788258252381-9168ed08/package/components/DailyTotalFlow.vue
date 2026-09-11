<template>
  <div class="c-monitor-daily-total">
    <div class="c-monitor-daily-total-header">
      <div class="c-monitor-daily-total-title">
        <img :src="icon1" class="c-monitor-daily-total-title-icon" />
        <span class="c-monitor-daily-total-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-daily-total-select" :bordered="false">
        <a-select-option value="24小时">24小时</a-select-option>
      </a-select>
    </div>

    <div class="c-monitor-daily-total-body" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-daily-total-card">
        <div class="c-monitor-daily-total-card-label">江阴大桥</div>
        <div class="c-monitor-daily-total-card-value bridge">82,379</div>
      </div>
      <div class="c-monitor-daily-total-card tunnel">
        <div class="c-monitor-daily-total-card-label">江阴靖江长江隧道</div>
        <div class="c-monitor-daily-total-card-value tunnel">34,620</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

const timeRange = ref('24小时')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-daily-total-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-total-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title-text {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.c-monitor-daily-total-select {
  width: 100px;
  flex-shrink: 0;
  
  :deep(.ant-select-selector) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    height: 30px !important;
    font-size: calc(@fontSize * 1);
    color: #333333;
  }
  
  :deep(.ant-select-selection-item) {
    line-height: 30px !important;
  }
  
  :deep(.ant-select-arrow) {
    color: #333333;
  }
}

.c-monitor-daily-total-body {
  width: 100%;
  height: 91px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.c-monitor-daily-total-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  &.tunnel {
    align-items: flex-end;
  }
}

.c-monitor-daily-total-card-label {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
  white-space: nowrap;
}

.c-monitor-daily-total-card-value {
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
  
  &.bridge {
    color: #0c9dbe;
  }
  
  &.tunnel {
    color: #006fe3;
  }
}
</style>