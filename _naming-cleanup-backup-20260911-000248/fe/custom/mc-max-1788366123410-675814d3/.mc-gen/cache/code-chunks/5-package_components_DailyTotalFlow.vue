<template>
  <div class="c-monitor-daily-total-flow">
    <!-- 区块标题行 -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-daily-icon" alt="icon" />
        <span class="c-monitor-daily-title-text">当日总流量</span>
      </div>
      <!-- 时间范围下拉选择器 -->
      <div class="c-monitor-time-selector">
        <div class="c-monitor-select-trigger" @click="toggleDropdown">
          <span class="c-monitor-select-value">{{ selectedTimeRange }}</span>
          <span class="c-monitor-select-arrow" :class="{ 'is-open': dropdownVisible }">▾</span>
        </div>
        <div class="c-monitor-select-dropdown" v-show="dropdownVisible">
          <div
            v-for="opt in timeRangeOptions"
            :key="opt.value"
            class="c-monitor-select-option"
            :class="{ 'is-active': selectedTimeRange === opt.label }"
            @click="selectTimeRange(opt)"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 统计卡片区域 (两列横排) -->
    <div
      class="c-monitor-stat-cards"
      :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label c-monitor-stat-label-tunnel">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value c-monitor-stat-value-tunnel">{{ tunnelFlow }}</div>
      </div>

      <!-- 分隔线 -->
      <div class="c-monitor-stat-divider"></div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label c-monitor-stat-label-bridge">江阴大桥</div>
        <div class="c-monitor-stat-value c-monitor-stat-value-bridge">{{ bridgeFlow }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

// 系统注入的资源变量（禁止手写 import）
// bg1: 当日总流量区域背景图 (426×91)
// icon1: 当日总流量标题图标 (18×18)

// 时间范围选项
const timeRangeOptions = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])

const selectedTimeRange = ref('24小时')
const dropdownVisible = ref(false)

// 统计数据（默认24小时数据）
const tunnelFlow = ref('34,620')
const bridgeFlow = ref('82,379')

// 各时间范围对应的 mock 数据
const flowDataMap = {
  '24小时': { tunnel: '34,620', bridge: '82,379' },
  '7天':   { tunnel: '242,340', bridge: '576,653' },
  '30天':  { tunnel: '1,038,600', bridge: '2,471,370' }
}

const toggleDropdown = () => {
  dropdownVisible.value = !dropdownVisible.value
}

const selectTimeRange = (opt) => {
  selectedTimeRange.value = opt.label
  dropdownVisible.value = false
}

// 监听时间范围切换，更新数据
watch(selectedTimeRange, (newVal) => {
  const data = flowDataMap[newVal]
  if (data) {
    tunnelFlow.value = data.tunnel
    bridgeFlow.value = data.bridge
  }
})
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
  margin-bottom: 8px;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.c-monitor-daily-icon {
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
  white-space: nowrap;
}

/* 时间选择器 */
.c-monitor-time-selector {
  position: relative;
  flex-shrink: 0;
}

.c-monitor-select-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100px;
  height: 30px;
  padding: 0 8px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  box-sizing: border-box;
}

.c-monitor-select-value {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: @fontSize;
  font-weight: 400;
  color: #333333;
  line-height: 22px;
  flex: 1;
}

.c-monitor-select-arrow {
  font-size: calc(@fontSize * 0.85);
  color: #a8abb2;
  transition: transform 0.2s;
  flex-shrink: 0;

  &.is-open {
    transform: rotate(180deg);
  }
}

.c-monitor-select-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  min-width: 100px;
  background: #ffffff;
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 28, 53, 0.15);
  z-index: 100;
}

.c-monitor-select-option {
  padding: 6px 12px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: @fontSize;
  color: #333333;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(25, 144, 255, 0.08);
  }

  &.is-active {
    color: rgba(25, 144, 255, 1);
    background: rgba(25, 144, 255, 0.06);
  }
}

/* 统计卡片区域 */
.c-monitor-stat-cards {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  min-height: 91px;
  padding: 12px 16px;
  box-sizing: border-box;
}

.c-monitor-stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.c-monitor-stat-divider {
  width: 1px;
  height: 40px;
  background: rgba(161, 206, 255, 0.5);
  flex-shrink: 0;
}

/* 标签文字 */
.c-monitor-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: @fontSize;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
}

.c-monitor-stat-label-tunnel {
  color: #333333;
  text-align: right;
}

.c-monitor-stat-label-bridge {
  color: #333333;
}

/* 数值文字 */
.c-monitor-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;
}

.c-monitor-stat-value-tunnel {
  color: #006fe3;
}

.c-monitor-stat-value-bridge {
  color: #0c9dbe;
}
</style>