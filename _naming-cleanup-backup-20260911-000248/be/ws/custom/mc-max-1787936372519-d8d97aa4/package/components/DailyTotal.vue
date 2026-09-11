<template>
  <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-total">
    <!-- 头部：标题 + 时间选择下拉框 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-header">
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-title">
        <img :src="icon1" alt="" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-title-icon" />
        <span class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-title-text">当日总流量</span>
      </div>
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-time-selector">
        <a-select v-model:value="selectedTime" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-select">
          <a-select-option value="24h">24小时</a-select-option>
        </a-select>
      </div>
    </div>

    <!-- 主体：双站点统计卡片 -->
    <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-body" :style="{ backgroundImage: `url(${bg1})` }">
      <!-- 江阴靖江长江隧道统计卡片 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-card">
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-label">江阴靖江长江隧道</div>
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-value">34,620</div>
        <img :src="bg2" alt="" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-icon" />
      </div>

      <!-- 江阴大桥统计卡片 -->
      <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-card">
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-label">江阴大桥</div>
        <div class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-value">82,379</div>
        <img :src="bg2" alt="" class="c-mc-max-1787936372519-d8d97aa4-c-monitor-daily-stat-icon" />
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'
import bg2 from '../../resources/images/bg-_m-36.png'

import { ref} from 'vue'

// 时间选择
const selectedTime = ref('24h')

// 父组件传入的配置（如需要）
const props = defineProps({
  config: {
    type: Object,
    default: () => ({})
  }
})
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

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
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
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-daily-time-selector {
  :deep(.ant-select) {
    width: 100px;
  }

  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    height: 30px;
  }

  :deep(.ant-select-selection-item) {
    font-size: 14px;
    color: #333333;
    line-height: 22px;
  }

  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-daily-body {
  display: flex;
  gap: 16px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 16px;
  min-height: 91px;
}

.c-monitor-daily-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  gap: 8px;
  min-height: 0;}

.c-monitor-daily-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  line-height: 1.2;
  text-align: center;
}

.c-monitor-daily-stat-value {
  font-size: 24px;
  font-weight: 900;
  color: #1990ff;
  line-height: 28px;
  font-family: Roboto, sans-serif;
  text-align: center;
}

.c-monitor-daily-stat-icon {
  position: absolute;
  width: 62px;
  height: 62px;
  opacity: 0.2;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>