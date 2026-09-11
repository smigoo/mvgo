<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="device in deviceList"
      :key="device.id"
      class="c-monitor-device-card"
    >
      <div class="c-monitor-device-icon-wrapper">
        <img :src="device.icon" class="c-monitor-device-icon" :alt="device.name" />
      </div>
      <div class="c-monitor-device-info">
        <span class="c-monitor-device-name">{{ device.name }}</span>
        <span class="c-monitor-device-value">{{ device.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const deviceList = ref([
  { id: 'device-1', name: '摄像机', value: '(2/484)', icon: icon3 },
  { id: 'device-2', name: '风速风向仪', value: '(1/484)', icon: icon4 },
  { id: 'device-3', name: '超高检测器', value: '(0/484)', icon: icon5 },
  { id: 'device-4', name: '烟雾机器人', value: '(0/484)', icon: icon6 },
  { id: 'device-5', name: '激光雷达', value: '(0/484)', icon: icon7 },
  { id: 'device-6', name: 'CO2传感器', value: '(0/484)', icon: icon8 },
  { id: 'device-7', name: 'CO/VI检测器', value: '(0/484)', icon: icon9 },
  { id: 'device-8', name: '温湿度传感器', value: '(0/484)', icon: icon10 },
  { id: 'device-9', name: '压力传感器', value: '(0/484)', icon: icon11 },
  { id: 'device-10', name: '光照度变送器', value: '(0/484)', icon: icon12 },
  { id: 'device-11', name: '紧急电话', value: '(0/484)', icon: icon13 },
  { id: 'device-12', name: '水质监测设备', value: '(0/484)', icon: icon14 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: rgba(255, 255, 255, 1);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.15);
    transform: translateY(-2px);
  }
}

.c-monitor-device-icon-wrapper {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
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
  gap: 4px;
}

.c-monitor-device-name {
  font-size: calc(@fontSize * 0.857);
  color: rgba(51, 51, 51, 1);
  text-align: center;
  line-height: 1.3;
}

.c-monitor-device-value {
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: rgba(24, 144, 255, 1);
  text-align: center;
}
</style>
