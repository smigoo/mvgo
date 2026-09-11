<template>
  <div class="c-monitor-daily-total">
    <!-- 标题栏 -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片区 -->
    <div class="c-monitor-stat-cards" :style="{ backgroundImage: `url(${bg1})` }">
      <!-- 隧道卡片 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-card-icon-wrapper">
          <img :src="bgm" class="c-monitor-card-icon" alt="tunnel" />
        </div>
        <div class="c-monitor-card-label">江阴靖江长江隧道</div>
        <div class="c-monitor-card-value">34,620</div>
      </div>

      <!-- 大桥卡片 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-card-icon-wrapper">
          <img :src="bgm" class="c-monitor-card-icon" alt="bridge" />
        </div>
        <div class="c-monitor-card-label">江阴大桥</div>
        <div class="c-monitor-card-value">82,379</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 时间范围选择
const timeRange = ref('24h')

// Props 接收（如果父组件需要传递数据）
const props = defineProps({
  tunnelFlow: {
    type: Number,
    default: 34620
  },
  bridgeFlow: {
    type: Number,
    default: 82379
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
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
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-time-selector {
  width: 100px;
}

:deep(.ant-select-selector) {
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  height: 30px;
}

:deep(.ant-select-selection-item) {
  font-size: 14px;
  color: #333333;
  line-height: 20px;
}

.c-monitor-stat-cards {
  display: flex;
  gap: 16px;
  padding: 16px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 8px;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  min-height: 80px;
}

.c-monitor-card-icon-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 62px;
  height: 62px;
  opacity: 0.2;
  z-index: 0;
}

.c-monitor-card-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-monitor-card-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 0.65);
  line-height: 18px;
  position: relative;
  z-index: 1;
}

.c-monitor-card-value {
  font-size: 24px;
  font-weight: 900;
  color: #1990ff;
  line-height: 28px;
  position: relative;
  z-index: 1;
}
</style>
