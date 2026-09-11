<template>
  <div class="c-monitor-daily-total">
    <!-- 标题栏 -->
    <div class="c-monitor-daily-total-header">
      <div class="c-monitor-daily-total-title">
        <img :src="icon1" class="c-monitor-daily-total-title-icon" />
        <span class="c-monitor-daily-total-title-text">当日总流量</span>
      </div>
      <a-select
        v-model:value="selectedTime"
        class="c-monitor-daily-total-select"
        :options="timeOptions"
        @change="handleTimeChange"
      >
      </a-select>
    </div>

    <!-- 背景容器 + 统计卡片 -->
    <div
      class="c-monitor-daily-total-body"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <div class="c-monitor-daily-total-stat-item c-monitor-daily-total-stat-item--tunnel">
        <span class="c-monitor-daily-total-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-daily-total-stat-value c-monitor-daily-total-stat-value--tunnel">{{ tunnelValue }}</span>
      </div>
      <div class="c-monitor-daily-total-stat-item c-monitor-daily-total-stat-item--bridge">
        <span class="c-monitor-daily-total-stat-label">江阴大桥</span>
        <span class="c-monitor-daily-total-stat-value c-monitor-daily-total-stat-value--bridge">{{ bridgeValue }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 选择的时间
const selectedTime = ref('24小时')
const timeOptions = [
  { label: '24小时', value: '24小时' },
  { label: '48小时', value: '48小时' } // 用于演示交互的模拟选项
]

// 不同时间对应的统计数据（模拟）
const statsMap = {
  '24小时': { tunnel: '34,620', bridge: '82,379' },
  '48小时': { tunnel: '45,120', bridge: '98,450' }
}

const tunnelValue = ref(statsMap[selectedTime.value].tunnel)
const bridgeValue = ref(statsMap[selectedTime.value].bridge)

const handleTimeChange = (value) => {
  tunnelValue.value = statsMap[value].tunnel
  bridgeValue.value = statsMap[value].bridge
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.c-monitor-daily-total-header {
  display: flex;
  align-items: center;
  height: 30px;
  flex-shrink: 0;
  padding: 0 12px 0 0;
}

.c-monitor-daily-total-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-daily-total-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title-text {
  font-size: 16px;
  color: #333333;
  font-weight: 500;
  white-space: nowrap;
}

.c-monitor-daily-total-select {
  margin-left: auto;
  width: 100px;
}

:deep(.ant-select-selector) {
  border-radius: 4px;
  border: 1px solid rgba(161, 206, 255, 1) !important;
  background: linear-gradient(to bottom, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%) !important;
}
:deep(.ant-select-selection-item) {
  color: #333333;
  font-size: 14px;
}
:deep(.ant-select-arrow) {
  color: #a8abb2;
}

.c-monitor-daily-total-body {
  flex: 1;
  min-height: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 20px;
}

.c-monitor-daily-total-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-total-stat-label {
  font-size: 16px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-daily-total-stat-value {
  font-size: 24px;
  font-weight: 900;
  font-family: 'Roboto', sans-serif;
  line-height: 28px;
}

.c-monitor-daily-total-stat-value--tunnel {
  color: #006fe3;
}

.c-monitor-daily-total-stat-value--bridge {
  color: #0c9dbe;
}
</style>