<template>
  <div class="c-monitor-daily-total">
    <!-- 区块标题行 -->
    <div class="c-monitor-daily-total-header">
      <div class="c-monitor-daily-total-title">
        <img :src="icon1" class="c-monitor-daily-total-icon" width="18" height="18" alt="" />
        <span class="c-monitor-daily-total-title-text">当日总流量</span>
      </div>
      <!-- 时间选择器 -->
      <div class="c-monitor-daily-total-select-wrapper">
        <div class="c-monitor-daily-total-select-trigger" @click="toggleTimeDropdown">
          <span class="c-monitor-daily-total-select-value">{{ selectedTime }}</span>
          <span class="c-monitor-daily-total-select-arrow" :class="{ open: showTimeDropdown }">▼</span>
        </div>
        <div class="c-monitor-daily-total-select-dropdown" v-show="showTimeDropdown">
          <div
            v-for="opt in timeOptions"
            :key="opt"
            class="c-monitor-daily-total-select-option"
            :class="{ active: selectedTime === opt }"
            @click="selectTime(opt)"
          >{{ opt }}</div>
        </div>
      </div>
    </div>

    <!-- 蓝色渐变细分隔线 -->
    <div class="c-monitor-daily-total-divider"></div>

    <!-- 数据主体区：左侧隧道数据 + 中间装饰图 + 右侧大桥数据 -->
    <div
      class="c-monitor-daily-total-body"
      :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 左侧：江阴靖江长江隧道 -->
      <div class="c-monitor-daily-total-stat c-monitor-daily-total-stat-tunnel">
        <span class="c-monitor-daily-total-stat-label">江阴靖江长江隧道</span>
        <span class="c-monitor-daily-total-stat-value c-monitor-daily-total-stat-value-tunnel">34,620</span>
      </div>

      <!-- 中间装饰：蓝色发光汽车图 -->
      <div class="c-monitor-daily-total-car-icon">
        <!-- 使用 CSS 发光效果圆形装饰代替缺失资源 -->
        <div class="c-monitor-daily-total-car-glow"></div>
      </div>

      <!-- 右侧：江阴大桥 -->
      <div class="c-monitor-daily-total-stat c-monitor-daily-total-stat-bridge">
        <span class="c-monitor-daily-total-stat-label">江阴大桥</span>
        <span class="c-monitor-daily-total-stat-value c-monitor-daily-total-stat-value-bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 时间选择器状态
const selectedTime = ref('24小时')
const showTimeDropdown = ref(false)
const timeOptions = ['24小时']

const toggleTimeDropdown = () => {
  showTimeDropdown.value = !showTimeDropdown.value
}

const selectTime = (opt) => {
  selectedTime.value = opt
  showTimeDropdown.value = false
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.c-monitor-daily-total-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 12px 4px 12px;
}

.c-monitor-daily-total-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.c-monitor-daily-total-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-total-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.c-monitor-daily-total-divider {
  height: 2px;
  background: linear-gradient(90deg, rgba(24, 144, 255, 0.8) 0%, rgba(24, 144, 255, 0.1) 100%);
  margin: 0 12px 0 12px;
  border-radius: 1px;
  flex-shrink: 0;
}

/* 时间选择器 */
.c-monitor-daily-total-select-wrapper {
  position: relative;
  flex-shrink: 0;
}

.c-monitor-daily-total-select-trigger {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  min-width: 80px;
}

.c-monitor-daily-total-select-value {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-daily-total-select-arrow {
  font-size: calc(@fontSize * 0.7);
  color: #a8abb2;
  transition: transform 0.2s;
  &.open {
    transform: rotate(180deg);
  }
}

.c-monitor-daily-total-select-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 2px);
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  z-index: 10;
  min-width: 80px;
  box-shadow: 0 2px 8px rgba(0, 28, 53, 0.12);
}

.c-monitor-daily-total-select-option {
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
    color: rgba(24, 144, 255, 1);
    background: rgba(24, 144, 255, 0.06);
  }
}

/* 数据主体区 */
.c-monitor-daily-total-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: 12px 16px;
  min-height: 91px;
  flex-shrink: 0;
  position: relative;
}

/* 统计数据项 */
.c-monitor-daily-total-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-daily-total-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: #333333;
  white-space: nowrap;
}

/* 隧道数值：蓝色 #006fe3 */
.c-monitor-daily-total-stat-value-tunnel {
  font-family: Roboto, 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  color: #006fe3;
  line-height: 1.17;
  white-space: nowrap;
}

/* 大桥数值：青蓝色 #0c9dbe */
.c-monitor-daily-total-stat-value-bridge {
  font-family: Roboto, 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  color: #0c9dbe;
  line-height: 1.17;
  white-space: nowrap;
}

/* 中间汽车装饰区域 */
.c-monitor-daily-total-car-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 77px;
  height: 52px;
  flex-shrink: 0;
  position: relative;
}

/* 发光圆形装饰（替代缺失的汽车图片资源） */
.c-monitor-daily-total-car-glow {
  width: 63px;
  height: 63px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff 0%, #c4e1ff 100%);
  border: 1.8px solid rgba(153, 206, 255, 1);
  box-shadow: inset 0 0 12px rgba(34, 131, 227, 0.5), 0 0 16px rgba(24, 144, 255, 0.45);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>