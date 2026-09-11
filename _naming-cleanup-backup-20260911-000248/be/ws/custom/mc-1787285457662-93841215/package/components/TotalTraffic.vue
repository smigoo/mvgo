<template>
  <div class="c-monitor-total-traffic">
    <div class="c-monitor-total-traffic-header">
      <div class="c-monitor-total-traffic-title">
        <img :src="icon3" class="c-monitor-total-traffic-title-icon" />
        <span class="c-monitor-total-traffic-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-total-traffic-select">
        <a-select v-model:value="timeRange" :bordered="false" style="width: 100px">
          <a-select-option value="24h">24小时</a-select-option>
        </a-select>
      </div>
    </div>
    <div class="c-monitor-total-traffic-body" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-total-traffic-stat c-monitor-total-traffic-stat--tunnel">
        <div class="c-monitor-total-traffic-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-total-traffic-stat-value c-monitor-total-traffic-stat-value--tunnel">34,620</div>
      </div>
      <div class="c-monitor-total-traffic-stat c-monitor-total-traffic-stat--bridge">
        <div class="c-monitor-total-traffic-stat-label">江阴大桥</div>
        <div class="c-monitor-total-traffic-stat-value c-monitor-total-traffic-stat-value--bridge">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

const timeRange = ref('24h')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-total-traffic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-bottom: 8px;
}

.c-monitor-total-traffic-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-total-traffic-title-icon {
  width: 18px;
  height: 18px;
}

.c-monitor-total-traffic-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-total-traffic-select {
  width: 100px;
  
  :deep(.ant-select-selector) {
    height: 30px !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    color: #333333;
    font-size: 14px;
    padding-right: 20px !important;
  }
  
  :deep(.ant-select-selection-item) {
    line-height: 30px !important;
  }
}

.c-monitor-total-traffic-body {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
}

.c-monitor-total-traffic-stat {
  display: flex;
  flex-direction: column;
}

.c-monitor-total-traffic-stat--tunnel {
  align-items: flex-end;
}

.c-monitor-total-traffic-stat--bridge {
  align-items: flex-start;
}

.c-monitor-total-traffic-stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-total-traffic-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
}

.c-monitor-total-traffic-stat-value--tunnel {
  color: #006fe3;
}

.c-monitor-total-traffic-stat-value--bridge {
  color: #0c9dbe;
}
</style>