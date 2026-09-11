<template>
  <div class="c-monitor-daily-total-flow">
    <!-- 区块标题行 -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-daily-title-icon" alt="" />
        <span class="c-monitor-daily-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-daily-time-selector" @click="toggleDropdown">
        <span class="c-monitor-daily-time-value">{{ selectedTime }}</span>
        <span class="c-monitor-daily-time-arrow" :class="{ open: dropdownOpen }">▼</span>
        <div class="c-monitor-daily-dropdown" v-show="dropdownOpen">
          <div
            v-for="opt in timeOptions"
            :key="opt.value"
            class="c-monitor-daily-dropdown-item"
            :class="{ active: selectedTime === opt.label }"
            @click.stop="selectTime(opt)"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 统计数据区域（带背景图） -->
    <div
      class="c-monitor-daily-stats"
      :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-daily-stat-card">
        <div class="c-monitor-daily-stat-label c-monitor-daily-stat-label-tunnel">江阴靖江长江隧道</div>
        <div class="c-monitor-daily-stat-value c-monitor-daily-stat-value-tunnel">34,620</div>
        <div class="c-monitor-daily-stat-unit">辆</div>
      </div>

      <!-- 装饰分隔区域 -->
      <div class="c-monitor-daily-stat-divider"></div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-daily-stat-card">
        <div class="c-monitor-daily-stat-label c-monitor-daily-stat-label-bridge">江阴大桥</div>
        <div class="c-monitor-daily-stat-value c-monitor-daily-stat-value-bridge">82,379</div>
        <div class="c-monitor-daily-stat-unit">辆</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 系统注入资源变量（禁止手写 import）
// bg1、icon1 由系统自动注入

// 下拉框状态
const dropdownOpen = ref(false)
const selectedTime = ref('24小时')

const timeOptions = [
  { label: '24小时', value: '24h' }
]

const toggleDropdown = () => {
  dropdownOpen.value = !dropdownOpen.value
}

const selectTime = (opt) => {
  selectedTime.value = opt.label
  dropdownOpen.value = false
}

// 点击外部关闭下拉
const handleClickOutside = (e) => {
  dropdownOpen.value = false
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total-flow {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  padding: 8px 12px 6px 12px;
  flex-shrink: 0;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.c-monitor-daily-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
  line-height: 24px;
}

.c-monitor-daily-time-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  min-width: 80px;
  justify-content: space-between;
  user-select: none;
}

.c-monitor-daily-time-value {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 22px;
  white-space: nowrap;
}

.c-monitor-daily-time-arrow {
  font-size: calc(@fontSize * 0.57);
  color: #a8abb2;
  transition: transform 0.2s ease;
  flex-shrink: 0;

  &.open {
    transform: rotate(180deg);
  }
}

.c-monitor-daily-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  min-width: 100%;
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 28, 53, 0.12);
  z-index: 100;
  overflow: hidden;
}

.c-monitor-daily-dropdown-item {
  padding: 6px 12px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  color: #333333;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(24, 144, 255, 0.08);
  }

  &.active {
    color: #1890ff;
    background: rgba(24, 144, 255, 0.06);
  }
}

.c-monitor-daily-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: 12px 16px 14px 16px;
  flex-shrink: 0;
  min-height: 80px;
  position: relative;
}

.c-monitor-daily-stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
}

.c-monitor-daily-stat-divider {
  width: 1px;
  height: 40px;
  background: rgba(161, 206, 255, 0.4);
  flex-shrink: 0;
  margin: 0 8px;
}

.c-monitor-daily-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-daily-stat-label-tunnel {
  text-align: right;
}

.c-monitor-daily-stat-label-bridge {
  text-align: left;
}

.c-monitor-daily-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;
}

.c-monitor-daily-stat-value-tunnel {
  color: #006fe3;
}

.c-monitor-daily-stat-value-bridge {
  color: #0c9dbe;
}

.c-monitor-daily-stat-unit {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.86);
  font-weight: 400;
  color: #666666;
  line-height: 18px;
}
</style>