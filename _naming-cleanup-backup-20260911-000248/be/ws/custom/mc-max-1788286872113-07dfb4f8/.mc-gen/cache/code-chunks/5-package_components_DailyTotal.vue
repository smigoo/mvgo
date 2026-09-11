<template>
  <div class="c-monitor-daily-total">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="icon1" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">当日总流量</span>
      </div>
      <div class="c-monitor-time-selector">
        <span class="c-monitor-time-text">24小时</span>
        <span class="c-monitor-arrow-icon">▼</span>
      </div>
    </div>

    <!-- 统计卡片容器 -->
    <div class="c-monitor-stats-container" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-stat-value">34,620</div>
        <img :src="icon2" class="c-monitor-stat-icon" alt="装饰图标" />
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-stat-card">
        <div class="c-monitor-stat-label">江阴大桥</div>
        <div class="c-monitor-stat-value">82,379</div>
        <img :src="icon2" class="c-monitor-stat-icon" alt="装饰图标" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量（由系统自动注入）
const icon1 = ref(null)
const icon2 = ref(null)
const bg1 = ref(null)

// 接收父组件传递的资源
defineProps({
  resources: {
    type: Object,
    default: () => ({})
  }
})

// 监听资源变化
const props = defineProps(['resources'])
if (props.resources) {
  icon1.value = props.resources.icon1
  icon2.value = props.resources.icon2
  bg1.value = props.resources.bg1
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
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
  flex-shrink: 0;
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
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-time-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  height: 30px;
}

.c-monitor-time-text {
  font-size: 14px;
  color: #333333;
  line-height: 22px;
}

.c-monitor-arrow-icon {
  font-size: 10px;
  color: #a8abb2;
}

.c-monitor-stats-container {
  display: flex;
  gap: 16px;
  padding: 12px;
  min-height: 91px;
  flex-shrink: 0;
}

.c-monitor-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
}

.c-monitor-stat-label {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-align: center;
}

.c-monitor-stat-value {
  font-size: 24px;
  font-weight: 900;
  color: #0c9dbe;
  line-height: 28px;
  text-align: center;
}

.c-monitor-stat-icon {
  position: absolute;
  width: 77px;
  height: 52px;
  bottom: 0;
  right: 50%;
  transform: translateX(50%);
  pointer-events: none;
}
</style>
