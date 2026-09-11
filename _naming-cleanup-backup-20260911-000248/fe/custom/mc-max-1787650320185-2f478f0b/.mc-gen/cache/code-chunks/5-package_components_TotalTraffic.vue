<template>
  <div class="c-monitor-total-traffic">
    <!-- 子标题栏 -->
    <div class="c-monitor-total-traffic-header">
      <div class="c-monitor-total-traffic-title">
        <img :src="icon5" class="c-monitor-total-traffic-title-icon" />
        <span class="c-monitor-total-traffic-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-total-traffic-select" @click="toggleSelect">
        <span class="c-monitor-total-traffic-select-value">{{ selectedTime }}</span>
        <img :src="icon4" class="c-monitor-total-traffic-select-arrow" :class="{ 'is-up': showDropdown }" />
        <div class="c-monitor-total-traffic-dropdown" v-show="showDropdown">
          <div 
            v-for="opt in timeOptions" 
            :key="opt" 
            class="c-monitor-total-traffic-dropdown-item"
            :class="{ 'is-active': selectedTime === opt }"
            @click.stop="selectTime(opt)"
          >
            {{ opt }}
          </div>
        </div>
      </div>
    </div>

    <!-- 统计卡片区 -->
    <div class="c-monitor-total-traffic-stats" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-total-traffic-stat-item">
        <div class="c-monitor-total-traffic-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-total-traffic-stat-value c-monitor-total-traffic-stat-value--tunnel">34,620</div>
      </div>
      <div class="c-monitor-total-traffic-stat-item">
        <div class="c-monitor-total-traffic-stat-label">江阴大桥</div>
        <div class="c-monitor-total-traffic-stat-value c-monitor-total-traffic-stat-value--bridge">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const selectedTime = ref('24小时')
const showDropdown = ref(false)
// 根据规范，不臆造下拉框的具体选项列表，只保留可见的24小时
const timeOptions = ref(['24小时'])

const toggleSelect = () => {
  showDropdown.value = !showDropdown.value
}

const selectTime = (opt) => {
  selectedTime.value = opt
  showDropdown.value = false
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-monitor-total-traffic-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-total-traffic-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-monitor-total-traffic-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-total-traffic-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-total-traffic-select {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
}

.c-monitor-total-traffic-select-value {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #333333;
}

.c-monitor-total-traffic-select-arrow {
  width: 8px;
  height: 4px;
  flex-shrink: 0;
  transition: transform 0.3s;

  &.is-up {
    transform: rotate(180deg);
  }
}

.c-monitor-total-traffic-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: #ffffff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
  min-width: 80px;
}

.c-monitor-total-traffic-dropdown-item {
  padding: 6px 12px;
  font-size: 14px;
  color: #333333;
  white-space: nowrap;

  &:hover {
    background: #f5f5f5;
  }

  &.is-active {
    color: #1990ff;
  }
}

.c-monitor-total-traffic-stats {
  width: 100%;
  height: 91px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  flex-shrink: 0;
}

.c-monitor-total-traffic-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-total-traffic-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
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

  &--tunnel {
    color: #006fe3;
  }

  &--bridge {
    color: #0c9dbe;
  }
}
</style>