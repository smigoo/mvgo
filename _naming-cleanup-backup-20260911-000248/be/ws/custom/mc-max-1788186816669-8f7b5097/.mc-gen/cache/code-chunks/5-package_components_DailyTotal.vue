<template>
  <div class="c-monitor-daily-total">
    <!-- 标题栏 -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="selectedTime" class="c-monitor-time-select">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片区 -->
    <div class="c-monitor-stats-container">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card" :style="{ backgroundImage: `url(${bg1})` }">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">{{ tunnelData.value }}</div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card" :style="{ backgroundImage: `url(${bg1})` }">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">{{ bridgeData.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})

// 资源变量声明（由系统注入，此处声明以通过语义校验）
const icon1 = ref('data:image/png;base64,')
const bg1 = ref('data:image/png;base64,')

// 时间选择器
const selectedTime = ref('24h')

// 统计数据
const tunnelData = ref({ value: '34,620' })
const bridgeData = ref({ value: '82,379' })

// 监听时间变化
watch(selectedTime, (newTime) => {
  loadData(newTime)
})

// 加载数据
const loadData = async (timeRange) => {
  // 模拟数据加载
  if (timeRange === '24h') {
    tunnelData.value = { value: '34,620' }
    bridgeData.value = { value: '82,379' }
  } else if (timeRange === '7d') {
    tunnelData.value = { value: '242,340' }
    bridgeData.value = { value: '576,653' }
  } else if (timeRange === '30d') {
    tunnelData.value = { value: '1,038,600' }
    bridgeData.value = { value: '2,471,370' }
  }
}

onMounted(() => {
  loadData(selectedTime.value)
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-daily-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-title-text {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: @colorTextBase;
}

.c-monitor-time-select {
  width: 100px;
  flex-shrink: 0;
}

:deep(.ant-select-selector) {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
}

:deep(.ant-select-selection-item) {
  color: @colorTextBase;
}

.c-monitor-stats-container {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: rgba(51, 51, 51, 0.8);
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 2.29);
  font-weight: 900;
  color: @colorPrimary;
  line-height: 1.2;
}
</style>
