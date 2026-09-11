<template>
  <div class="c-monitor-equipment-grid" :style="{ backgroundImage: `url(${bg3})` }">
    <div
      v-for="(card, index) in equipmentCards"
      :key="index"
      class="c-monitor-equipment-card"
    >
      <!-- 图标容器 -->
      <div class="c-monitor-card-icon-wrapper">
        <img :src="icon2" class="c-monitor-card-icon" alt="设备图标" />
      </div>

      <!-- 设备信息 -->
      <div class="c-monitor-card-info">
        <div class="c-monitor-card-name">{{ card.name }}</div>
        <div
          :class="[
            'c-monitor-card-count',
            { 'c-monitor-card-count--warning': card.hasWarning }
          ]"
        >
          {{ card.count }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量（系统注入）
const bg3 = 'data:image/png;base64,...'  // 系统自动注入
const icon2 = 'data:image/png;base64,...'  // 系统自动注入

// 12 个设备卡片数据
const equipmentCards = ref([
  { name: '摄像机', count: '(2/484)', hasWarning: true },
  { name: '风速风向仪', count: '(1/484)', hasWarning: true },
  { name: '超高检测器', count: '(0/484)', hasWarning: false },
  { name: '烟雾机器人', count: '(0/484)', hasWarning: false },
  { name: '激光雷达', count: '(0/484)', hasWarning: false },
  { name: 'CO传感器', count: '(0/484)', hasWarning: false },
  { name: 'CO/VI检测器', count: '(0/484)', hasWarning: false },
  { name: '温湿度传感器', count: '(0/484)', hasWarning: false },
  { name: '压力传感器', count: '(0/484)', hasWarning: false },
  { name: '光照度变送器', count: '(0/484)', hasWarning: false },
  { name: '紧急电话', count: '(0/484)', hasWarning: false },
  { name: '水质监测设备', count: '(0/484)', hasWarning: false }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-equipment-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  flex: 1;
  min-height: 0;
}

.c-monitor-equipment-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(245, 248, 251, 0.8);
  border-radius: 8px;
  transition: all 0.3s;
  cursor: pointer;

  &:hover {
    background: rgba(245, 248, 251, 0.95);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.c-monitor-card-icon-wrapper {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(115, 186, 249, 0.1);
  border-radius: 50%;
}

.c-monitor-card-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.c-monitor-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-card-name {
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-card-count {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #666666;
  line-height: 21px;

  &--warning {
    color: rgba(255, 76, 76, 1);
  }
}
</style>
