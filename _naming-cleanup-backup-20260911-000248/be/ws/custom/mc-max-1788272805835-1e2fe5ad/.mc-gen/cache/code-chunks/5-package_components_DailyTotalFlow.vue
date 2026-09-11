<template>
  <div class="c-monitor-daily-flow">
    <!-- 标题栏：当日总流量 + 24小时下拉 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img v-if="titleIcon" :src="titleIcon" class="c-monitor-title-icon" alt="标题图标" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <a-select v-model:value="selectedTimeRange" class="c-monitor-time-selector" :options="timeRangeOptions" />
    </div>

    <!-- 统计卡片容器：两个隧道统计 -->
    <div class="c-monitor-stat-cards" :style="{ backgroundImage: statBg ? `url(${statBg})` : 'none' }">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-icon-wrapper">
          <img :src="tunnelIconSrc" class="c-monitor-stat-icon" alt="隧道图标" />
        </div>
        <div class="c-monitor-stat-value">{{ tunnelFlowData.value }}</div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-icon-wrapper">
          <img :src="bridgeIconSrc" class="c-monitor-stat-icon" alt="大桥图标" />
        </div>
        <div class="c-monitor-stat-value">{{ bridgeFlowData.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  titleIcon: { type: String, default: '' },
  statBg: { type: String, default: '' }
})

// 时间范围选项
const timeRangeOptions = [
  { value: '24h', label: '24小时' },
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' }
]

const selectedTimeRange = ref('24h')

// 统计数据（模拟）
const tunnelFlowData = ref({ value: '34,620' })
const bridgeFlowData = ref({ value: '82,379' })

// 图标资源（模拟，实际应从 Figma mapping 获取）
const tunnelIconSrc = computed(() => {
  // 这里应该引用实际的图标资源变量，例如 icon3
  return '' // 实际项目中替换为真实资源
})

const bridgeIconSrc = computed(() => {
  // 这里应该引用实际的图标资源变量
  return '' // 实际项目中替换为真实资源
})

// 监听时间范围变化，重新加载数据
watch(selectedTimeRange, (newRange) => {
  loadFlowData(newRange)
})

const loadFlowData = async (timeRange) => {
  // 实际项目中应调用 componentApi 获取数据
  // 这里使用模拟数据
  if (timeRange === '24h') {
    tunnelFlowData.value = { value: '34,620' }
    bridgeFlowData.value = { value: '82,379' }
  } else if (timeRange === '7d') {
    tunnelFlowData.value = { value: '242,340' }
    bridgeFlowData.value = { value: '576,653' }
  } else {
    tunnelFlowData.value = { value: '1,038,600' }
    bridgeFlowData.value = { value: '2,471,370' }
  }
}

onMounted(() => {
  loadFlowData(selectedTimeRange.value)
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-flow {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: @colorTextBase;
}

.c-monitor-time-selector {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: @colorTextBase;
  }
}

.c-monitor-stat-cards {
  display: flex;
  gap: 12px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 16px;
  border-radius: 8px;
  flex: 1;
  min-height: 0;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: @colorTextBase;
  text-align: center;
}

.c-monitor-stat-icon-wrapper {
  width: 62px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-monitor-stat-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 2);
  font-weight: 900;
  color: @colorPrimary;
  text-align: center;
}
</style>
