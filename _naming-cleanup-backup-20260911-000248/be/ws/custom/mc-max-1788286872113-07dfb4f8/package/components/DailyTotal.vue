<template>
  <div class="c-monitor-daily-total">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="icon1" class="c-monitor-title-icon" alt="" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <a-select v-model:value="timeRange" class="c-monitor-time-selector">
        <a-select-option value="24h">24小时</a-select-option>
        <a-select-option value="7d">7天</a-select-option>
        <a-select-option value="30d">30天</a-select-option>
      </a-select>
    </div>

    <!-- 统计卡片区域 -->
    <div 
      class="c-monitor-stats-container"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-card-label">江阴靖江长江隧道</div>
        <div class="c-monitor-card-value">34,620</div>
        <img :src="icon2" class="c-monitor-card-icon" alt="" />
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-card-label">江阴大桥</div>
        <div class="c-monitor-card-value">82,379</div>
        <img :src="icon3" class="c-monitor-card-icon" alt="" />
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'
const icon2 = icon1
const icon3 = icon1


import { ref} from 'vue'

// 时间范围选择
const timeRange = ref('24h')

// Props 接收（如果需要从父组件传递配置）
defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})
</script>

<style lang="less" scoped>
@colorTextBase: #333333;

@import '../../resources/styles/index.less';

.c-monitor-daily-total {
flex: 1 1 0;

  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.c-monitor-title-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: @colorTextBase;
  line-height: 24px;
}

.c-monitor-time-selector {
  width: 100px;
  
  :deep(.ant-select-selector) {
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    height: 30px;
  }
  
  :deep(.ant-select-selection-item) {
    font-size: calc(var(--fontSize, 14px) * 1);
    color: #333333;
    line-height: 28px;
  }
  
  :deep(.ant-select-arrow) {
    color: #a8abb2;
  }
}

.c-monitor-stats-container {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  position: relative;
  min-height: 91px;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
  min-height: 0;}

.c-monitor-card-label {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-card-value {
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  line-height: 28px;
}

.c-monitor-stat-card:first-child .c-monitor-card-value {
  color: #006fe3;
}

.c-monitor-stat-card:last-child .c-monitor-card-value {
  color: #0c9dbe;
}

.c-monitor-card-icon {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 77px;
  height: 52px;
  opacity: 0.5;
  pointer-events: none;
}
</style>