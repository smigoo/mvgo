<template>
  <div class="c-total-traffic">
    <div class="c-total-traffic-header">
      <span class="c-total-traffic-title">当日总流量</span>
      <a-select
        v-model:value="selectedTimeRange"
        class="c-total-traffic-select"
        :options="timeRangeOptions"
        size="small"
        :bordered="false"
        @change="handleTimeRangeChange"
      >
        <template #suffixIcon>
          <span class="c-total-traffic-select-arrow">▾</span>
        </template>
      </a-select>
    </div>
    <div
      class="c-total-traffic-bg"
      :style="{
        backgroundImage: `url(${bg1})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <div class="c-total-traffic-stat-item">
        <span class="c-total-traffic-stat-label c-total-traffic-stat-label--tunnel">江阴靖江长江隧道</span>
        <span class="c-total-traffic-stat-value c-total-traffic-stat-value--tunnel">34,620</span>
      </div>
      <div class="c-total-traffic-stat-item">
        <span class="c-total-traffic-stat-label c-total-traffic-stat-label--bridge">江阴大桥</span>
        <span class="c-total-traffic-stat-value c-total-traffic-stat-value--bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 时间范围选项（与父组件 index.vue 中的 TIME_RANGE_OPTIONS 保持一致）
const timeRangeOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

const selectedTimeRange = ref('24h')

// 切换时间范围
const handleTimeRangeChange = (value) => {
  selectedTimeRange.value = value
  // 仅更新本地状态，实际数据刷新由父组件或其他机制处理
  console.log('时间范围切换:', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-total-traffic {
  width: 100%;
  flex: 0 0 auto;
  height: 132px;
  box-sizing: border-box;
  padding: 0 16px;
}

.c-total-traffic-header {
  display: flex;
  align-items: center;
  height: 30px;
  margin-bottom: 8px;
}

.c-total-traffic-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-total-traffic-select {
  margin-left: auto;
  width: 100px;
  height: 30px;
  font-size: 14px;

  :deep(.ant-select-selector) {
    height: 30px !important;
    padding: 0 8px;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  :deep(.ant-select-selection-item) {
    line-height: 30px;
  }

  :deep(.ant-select-arrow) {
    color: #333333;
  }
}

.c-total-traffic-select-arrow {
  font-size: 12px;
  color: #333333;
}

.c-total-traffic-bg {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 91px;
  width: 100%;
  overflow: hidden;
}

.c-total-traffic-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.c-total-traffic-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  margin-bottom: 4px;
  white-space: nowrap;
}

.c-total-traffic-stat-label--tunnel {
  text-align: right;
}

.c-total-traffic-stat-label--bridge {
  text-align: left;
}

.c-total-traffic-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;
}

.c-total-traffic-stat-value--tunnel {
  color: #006fe3;
}

.c-total-traffic-stat-value--bridge {
  color: #0c9dbe;
}
</style>