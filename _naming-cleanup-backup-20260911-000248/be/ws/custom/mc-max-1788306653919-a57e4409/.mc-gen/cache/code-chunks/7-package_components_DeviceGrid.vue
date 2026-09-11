<template>
  <div class="c-monitor-device-grid-wrapper">
    <div class="c-monitor-device-grid">
      <div
        v-for="(device, index) in devices"
        :key="device.id"
        class="c-monitor-device-card"
      >
        <div class="c-monitor-device-card-inner">
          <div class="c-monitor-device-icon-wrapper">
            <img :src="device.icon" :alt="device.name" class="c-monitor-device-icon" />
          </div>
          <div class="c-monitor-device-info">
            <span class="c-monitor-device-name">{{ device.name }}</span>
            <span class="c-monitor-device-value">{{ device.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 设备数据
const devices = ref([
  { id: 1, name: '摄像机', value: '(2/484)', icon: icon3 },
  { id: 2, name: '风速风向仪', value: '(1/484)', icon: icon8 },
  { id: 3, name: '超高检测器', value: '(0/484)', icon: icon11 },
  { id: 4, name: '烟雾机器人', value: '(0/484)', icon: icon4 },
  { id: 5, name: '激光雷达', value: '(0/484)', icon: icon7 },
  { id: 6, name: 'CO2传感器', value: '(0/484)', icon: icon12 },
  { id: 7, name: 'CO/VI检测器', value: '(0/484)', icon: icon5 },
  { id: 8, name: '温湿度传感器', value: '(0/484)', icon: icon9 },
  { id: 9, name: '压力传感器', value: '(0/484)', icon: icon13 },
  { id: 10, name: '光照度变送器', value: '(0/484)', icon: icon6 },
  { id: 11, name: '紧急电话', value: '(0/484)', icon: icon10 },
  { id: 12, name: '水质监测设备', value: '(0/484)', icon: icon14 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
}

.c-monitor-device-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  padding: 8px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 2px 6px rgba(24, 144, 255, 0.15);
    transform: translateY(-1px);
  }
}

.c-monitor-device-card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-device-icon-wrapper {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-monitor-device-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.c-monitor-device-name {
  font-size: calc(@fontSize * 0.857);
  color: #333333;
  line-height: 1.3;
}

.c-monitor-device-value {
  font-size: calc(@fontSize * 1.143);
  color: #1990ff;
  font-weight: 500;
  line-height: 1.3;
}
</style>
