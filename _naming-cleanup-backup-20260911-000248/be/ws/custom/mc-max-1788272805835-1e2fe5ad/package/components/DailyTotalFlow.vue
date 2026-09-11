<template>
  <div class="c-monitor-daily-total">
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-daily-title-icon" />
        <span class="c-monitor-daily-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeValue" class="c-monitor-daily-select">
        <a-select-option value="24">24小时</a-select-option>
      </a-select>
    </div>
    <div class="c-monitor-daily-body" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
      <div class="c-monitor-daily-stat c-monitor-daily-stat-tunnel">
        <span class="c-monitor-daily-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-daily-stat-value">34,620</span>
      </div>
      <div class="c-monitor-daily-stat c-monitor-daily-stat-bridge">
        <span class="c-monitor-daily-stat-label">江阴大桥</span>
        <span class="c-monitor-daily-stat-value">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'


import { ref} from 'vue'

const timeValue = ref('24')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
height: 100%;

  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-title-text {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  color: #333333;
  font-weight: 500;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-daily-select {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    height: 30px !important;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: var(--fontSize, 14px);
    color: #333333;
    line-height: 30px !important;
  }
  
  :deep(.ant-select-arrow) {
    color: #333333;
  }
}

.c-monitor-daily-body {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-sizing: border-box;
  background-size: 100% auto;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-daily-stat {
  display: flex;
  flex-direction: column;
}

.c-monitor-daily-stat-tunnel {
  align-items: flex-start;
  
  .c-monitor-daily-stat-label {
    text-align: right;
    width: 100%;
  }
}

.c-monitor-daily-stat-bridge {
  align-items: flex-end;
  
  .c-monitor-daily-stat-label {
    text-align: left;
    width: 100%;
  }
}

.c-monitor-daily-stat-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  color: #333333;
  font-weight: 500;
  line-height: 24px;
}

.c-monitor-daily-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  line-height: 28px;
}

.c-monitor-daily-stat-tunnel .c-monitor-daily-stat-value {
  color: #006fe3;
}

.c-monitor-daily-stat-bridge .c-monitor-daily-stat-value {
  color: #0c9dbe;
}
</style>