<template>
  <div class="c-monitor-section-daily-total">
    <!-- 区域标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title-wrapper">
        <img :src="icon1" class="c-monitor-section-icon" alt="" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 流量统计卡片容器 -->
    <div class="c-monitor-stats-container" :style="statsContainerStyle">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card c-monitor-stat-tunnel">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">{{ stats.tunnel }}</div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card c-monitor-stat-bridge">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">{{ stats.bridge }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'


import { ref, computed, watch, inject} from 'vue'

// 注入 componentApi（如果需要调用接口）
const componentApi = inject('componentApi', null)

// 时间范围选择
const timeRange = ref('24h')

// 统计数据
const stats = ref({
  tunnel: '34,620',
  bridge: '82,379'
})

// 背景图样式（使用模板绑定）
const statsContainerStyle = computed(() => ({
  backgroundImage: `url(${bg1})`,
  backgroundSize: '100% auto',
  backgroundPosition: 'center top',
  backgroundRepeat: 'no-repeat'
}))

// 加载数据
const loadData = async () => {
  if (!componentApi) {
    console.warn('[SectionDailyTotal] componentApi 未注入，使用默认数据')
    return
  }

  try {
    const res = await componentApi.getCommonApiFindList({ timeRange: timeRange.value }, 'dailyTraffic')
    if (res && res.length > 0) {
      stats.value = {
        tunnel: res[0].tunnelFlow || '34,620',
        bridge: res[0].bridgeFlow || '82,379'
      }
    }
  } catch (err) {
    console.error('[SectionDailyTotal] 数据加载失败:', err)
  }
}

// 监听时间范围变化
watch(timeRange, () => {
  loadData()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-section-daily-total {
flex: 1 1 0;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  flex-shrink: 0;
}

.c-monitor-section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
}

.c-monitor-time-selector {
  width: 100px;
  flex-shrink: 0;
}

:deep(.ant-select-selector) {
  background: transparent;
  border-color: rgba(25, 144, 255, 0.3);
  border-radius: 4px;
}

:deep(.ant-select-selection-item) {
  color: #333333;
  font-size: calc(var(--fontSize, 14px) * 1);
}

.c-monitor-stats-container {
  width: 100%;
  display: flex;
  gap: 16px;
  padding: 20px 16px;
  box-sizing: border-box;
  min-height: 91px;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;}

.c-monitor-stat-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
}

.c-monitor-stat-value {
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  line-height: 1.17;
  font-family: 'Roboto', sans-serif;
}

.c-monitor-stat-tunnel .c-monitor-stat-value {
  color: #006fe3;
}

.c-monitor-stat-bridge .c-monitor-stat-value {
  color: #0c9dbe;
}
</style>