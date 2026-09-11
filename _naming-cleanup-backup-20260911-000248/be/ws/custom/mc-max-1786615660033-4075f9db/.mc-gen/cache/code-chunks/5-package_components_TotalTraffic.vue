<template>
  <div class="c-total-traffic-root">
    <div class="c-total-traffic-header">
      <div class="c-total-traffic-title-group">
        <img :src="icon3" class="c-total-traffic-title-icon" />
        <span class="c-total-traffic-title">当日总流量</span>
      </div>
      <a-select 
        v-model:value="timeValue" 
        class="c-total-traffic-select"
        :options="timeOptions"
      />
    </div>

    <div 
      class="c-total-traffic-body"
      :style="{ backgroundImage: `url(${bgm_2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-total-traffic-stat">
        <span class="c-total-traffic-label">江阴靖江长江隧道</span>
        <span class="c-total-traffic-value c-total-traffic-value-tunnel">{{ tunnelValue }}</span>
      </div>

      <div class="c-total-traffic-center-icon"></div>

      <div class="c-total-traffic-stat c-total-traffic-stat-right">
        <span class="c-total-traffic-label">江阴大桥</span>
        <span class="c-total-traffic-value c-total-traffic-value-bridge">{{ bridgeValue }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// --- 响应式状态 ---
const timeValue = ref('24h')
const timeOptions = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])

const tunnelValue = ref('34,620')
const bridgeValue = ref('82,379')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-total-traffic-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-total-traffic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-total-traffic-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-total-traffic-title-icon {
  width: 18px;
  height: 18px;
}

.c-total-traffic-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-total-traffic-select {
  width: 100px;
}

:deep(.ant-select) {
  .ant-select-selector {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    color: #333333;
    font-size: 14px;
    height: 30px !important;
  }
  .ant-select-selection-item {
    line-height: 30px !important;
  }
  .ant-select-arrow {
    color: #333333;
  }
}

.c-total-traffic-body {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
}

.c-total-traffic-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
}

.c-total-traffic-stat-right {
  align-items: flex-end;
}

.c-total-traffic-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-total-traffic-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
}

.c-total-traffic-value-tunnel {
  color: #006fe3;
}

.c-total-traffic-value-bridge {
  color: #0c9dbe;
}

.c-total-traffic-center-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 62px;
  height: 62px;
  background: radial-gradient(circle, rgba(25, 144, 255, 0.3) 0%, rgba(25, 144, 255, 0) 70%);
  border-radius: 50%;
}
</style>