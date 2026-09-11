<template>
  <div class="c-total-traffic-root">
    <div class="c-total-traffic-header">
      <div class="c-total-traffic-title-wrap">
        <img :src="icon3" class="c-total-traffic-title-icon" alt="" />
        <span class="c-total-traffic-title">当日总流量</span>
      </div>
      <a-select
        v-model:value="selectedTime"
        class="c-total-traffic-select"
        :options="timeOptions"
        :popupMatchSelectWidth="false"
        @change="handleTimeChange"
      />
    </div>
    <div class="c-total-traffic-body">
      <div class="c-total-traffic-stat c-total-traffic-stat-tunnel">
        <span class="c-total-traffic-stat-label">江阴靖江长江隧道</span>
        <span class="c-total-traffic-stat-value c-total-traffic-stat-value-tunnel">34,620</span>
      </div>
      <div class="c-total-traffic-stat c-total-traffic-stat-bridge">
        <span class="c-total-traffic-stat-label">江阴大桥</span>
        <span class="c-total-traffic-stat-value c-total-traffic-stat-value-bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const selectedTime = ref('24小时')
const timeOptions = [{ value: '24小时', label: '24小时' }]

const handleTimeChange = (value) => {
  console.log('[TotalTraffic] 时间范围切换:', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-total-traffic-root {
  width: 100%;
  height: 121px;
  box-sizing: border-box;
  padding: 6px 14px 10px;
  flex-shrink: 0;
}

.c-total-traffic-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.c-total-traffic-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-total-traffic-title-icon {
  width: 18px;
  height: 18px;
  display: block;
  object-fit: contain;
}

.c-total-traffic-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
  line-height: 24px;
  letter-spacing: 0;
}

.c-total-traffic-select {
  width: 100px;
  height: 30px;
  margin-left: auto;

  :deep(.ant-select-selector) {
    height: 30px !important;
    border-radius: 0;
    border: 1px solid rgba(74, 117, 141, 0.25);
    background: #edf4fb;
    font-family: 'Source Han Sans CN', sans-serif;
    font-size: 14px;
    color: #333333;
    padding: 0 8px !important;
    box-shadow: none !important;
  }

  :deep(.ant-select-selection-item) {
    line-height: 28px !important;
  }

  :deep(.ant-select-arrow) {
    color: #333333;
    font-size: 10px;
  }
}

.c-total-traffic-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 91px;
  padding: 0 2px;
}

.c-total-traffic-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
}

.c-total-traffic-stat-tunnel {
  align-items: flex-start;
}

.c-total-traffic-stat-bridge {
  align-items: flex-end;
  text-align: right;
}

.c-total-traffic-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  white-space: nowrap;
}

.c-total-traffic-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  letter-spacing: 0;
  white-space: nowrap;
}

.c-total-traffic-stat-value-tunnel {
  color: #006fe3;
}

.c-total-traffic-stat-value-bridge {
  color: #0c9dbe;
}
</style>