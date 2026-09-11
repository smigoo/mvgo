<template>
  <div class="c-monitor-section c-monitor-daily-total">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img v-if="titleIcon" :src="titleIcon" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-time-selector">
        <a-select v-model:value="timeRange" class="c-monitor-select" :options="timeOptions" />
      </div>
    </div>

    <!-- 统计卡片容器 -->
    <div 
      class="c-monitor-stats-container"
      :style="glowBg ? { backgroundImage: `url(${glowBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
    >
      <!-- 江阴靖江长江隧道卡片 -->
      <div class="c-monitor-stat-card c-monitor-tunnel">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">{{ tunnelData.value }}</div>
        <div 
          class="c-monitor-stat-decoration"
          :style="glowBg ? { backgroundImage: `url(${glowBg})`, backgroundSize: 'auto 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
        />
      </div>

      <!-- 江阴大桥卡片 -->
      <div class="c-monitor-stat-card c-monitor-bridge">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">{{ bridgeData.value }}</div>
        <div 
          class="c-monitor-stat-decoration"
          :style="glowBg ? { backgroundImage: `url(${glowBg})`, backgroundSize: 'auto 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  glowBg: { type: String, default: '' },
  titleIcon: { type: String, default: '' }
})

// 时间范围选择
const timeRange = ref('24h')
const timeOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

// 统计数据
const tunnelData = ref({ value: '34,620' })
const bridgeData = ref({ value: '82,379' })

// 数据加载（根据时间范围）
const loadData = async () => {
  // 根据 timeRange 加载不同数据
  // 此处为 Mock 数据演示
  if (timeRange.value === '24h') {
    tunnelData.value = { value: '34,620' }
    bridgeData.value = { value: '82,379' }
  } else if (timeRange.value === '7d') {
    tunnelData.value = { value: '242,340' }
    bridgeData.value = { value: '576,653' }
  } else {
    tunnelData.value = { value: '1,038,600' }
    bridgeData.value = { value: '2,471,370' }
  }
}

// 监听时间范围变化
watch(timeRange, () => {
  loadData()
})

onMounted(() => {
  loadData()
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  flex: 110 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
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

.c-monitor-time-selector {
  flex-shrink: 0;
}

.c-monitor-select {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  color: @colorTextBase;
}

.c-monitor-stats-container {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 16px;
  position: relative;
  overflow: hidden;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 1.14);
  font-weight: 500;
  color: @colorTextBase;
  margin-bottom: 8px;
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 1.71);
  font-weight: 900;
  line-height: 1.17;
}

.c-monitor-tunnel .c-monitor-stat-value {
  color: rgba(0, 111, 227, 1);
}

.c-monitor-bridge .c-monitor-stat-value {
  color: rgba(12, 157, 190, 1);
}

.c-monitor-stat-decoration {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 191px;
  height: 80px;
  z-index: -1;
  pointer-events: none;
}
</style>
