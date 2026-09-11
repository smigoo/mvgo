<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="(device, index) in devices"
      :key="index"
      class="c-monitor-device-card"
    >
      <div class="c-monitor-device-icon">
        <div class="c-monitor-device-icon-shape"></div>
      </div>
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-name">{{ device.name }}</div>
        <div class="c-monitor-device-value">
          <span :class="device.abnormal > 0 ? 'c-monitor-device-abnormal' : 'c-monitor-device-normal'">
            ({{ device.abnormal }}
          </span>
          <span class="c-monitor-device-total">/{{ device.total }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const devices = ref([
  { name: '摄像机', abnormal: 2, total: 484 },
  { name: '风速风向仪', abnormal: 1, total: 484 },
  { name: '超高检测器', abnormal: 0, total: 484 },
  { name: '烟道机器人', abnormal: 0, total: 484 },
  { name: '激光雷达', abnormal: 0, total: 484 },
  { name: 'CO2传感器', abnormal: 0, total: 484 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484 },
  { name: '温湿度传感器', abnormal: 0, total: 484 },
  { name: '压力传感器', abnormal: 0, total: 484 },
  { name: '光照度变送器', abnormal: 0, total: 484 },
  { name: '紧急电话', abnormal: 0, total: 484 },
  { name: '水质监测设备', abnormal: 0, total: 484 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  height: 100%;
  align-content: start;
}

.c-monitor-device-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 4px;
  box-sizing: border-box;
  height: 64px;
}

.c-monitor-device-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(25, 144, 255, 0.15), rgba(8, 163, 165, 0.15));
  border-radius: 50%;
}

.c-monitor-device-icon-shape {
  width: 16px;
  height: 16px;
  background: rgba(25, 144, 255, 0.8);
  border-radius: 2px;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.c-monitor-device-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-device-value {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  display: flex;
}

.c-monitor-device-abnormal {
  color: #f53f3f;
}

.c-monitor-device-normal {
  color: rgba(8, 163, 165, 1);
}

.c-monitor-device-total {
  color: rgba(25, 144, 255, 1);
}
</style>