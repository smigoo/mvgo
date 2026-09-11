<template>
  <div class="c-monitor-daily-total-flow">
    <div class="c-monitor-section-header">
      <div class="c-monitor-header-left">
        <img :src="icon1" class="c-monitor-header-icon" alt="icon" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <div class="c-monitor-header-right">
        <a-select v-model:value="selectedTimeRange" class="c-monitor-time-selector">
          <a-select-option value="24h">24小时</a-select-option>
          <a-select-option value="7d">7天</a-select-option>
          <a-select-option value="30d">30天</a-select-option>
        </a-select>
      </div>
    </div>

    <div class="c-monitor-flow-cards" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
      <div class="c-monitor-flow-card c-monitor-tunnel-card">
        <span class="c-monitor-card-label">江阴靖江长江隧道</span>
        <span class="c-monitor-card-value">34,620</span>
      </div>
      <div class="c-monitor-flow-divider"></div>
      <div class="c-monitor-flow-card c-monitor-bridge-card">
        <span class="c-monitor-card-label">江阴大桥</span>
        <span class="c-monitor-card-value">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'

import { ref, watch} from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const selectedTimeRange = ref('24h')

const timeRangeOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

const loadData = async () => {
  console.log('[DailyTotalFlow] 加载数据，时间范围:', selectedTimeRange.value)
}

watch(selectedTimeRange, () => {
  loadData()
})
</script>

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-daily-total-flow {
height: 100%;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.c-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-header-right {
  margin-left: auto;
}

.c-monitor-time-selector {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: transparent;
  border-color: rgba(51, 51, 51, 0.2);
  color: #333333;
}

.c-monitor-flow-cards {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  position: relative;
}

.c-monitor-flow-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.c-monitor-tunnel-card {
  align-items: flex-end;
}

.c-monitor-bridge-card {
  align-items: flex-start;
}

.c-monitor-card-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
}

.c-monitor-card-value {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.17;
}

.c-monitor-tunnel-card .c-monitor-card-value {
  color: #006fe3;
}

.c-monitor-bridge-card .c-monitor-card-value {
  color: #0c9dbe;
}

.c-monitor-flow-divider {
  width: 1px;
  height: 52px;
  background: rgba(51, 51, 51, 0.15);
}
</style>