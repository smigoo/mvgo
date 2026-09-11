<template>
  <div class="c-monitor-device-grid">
    <div 
      v-for="(device, index) in deviceList" 
      :key="index"
      class="c-monitor-device-item"
    >
      <div class="c-monitor-device-icon-wrapper">
        <img 
          v-if="device.icon" 
          :src="device.icon" 
          class="c-monitor-device-icon" 
          alt=""
        />
      </div>
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-label">{{ device.label }}</div>
        <div class="c-monitor-device-count">({{ device.online }}/{{ device.total }})</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const deviceList = ref([
  { label: '摄像机', online: 2, total: 484, icon: icon1 },
  { label: '风速风向仪', online: 1, total: 484, icon: null },
  { label: '超高检测器', online: 0, total: 484, icon: null },
  { label: '烟雾机器人', online: 0, total: 484, icon: icon2 },
  { label: '激光雷达', online: 0, total: 484, icon: null },
  { label: 'CO/传感器', online: 0, total: 484, icon: null },
  { label: 'CO/VI检测器', online: 0, total: 484, icon: null },
  { label: '温湿度传感器', online: 0, total: 484, icon: null },
  { label: '压力传感器', online: 0, total: 484, icon: null },
  { label: '光照度变送器', online: 0, total: 484, icon: null },
  { label: '紧急电话', online: 0, total: 484, icon: null },
  { label: '水质监测设备', online: 0, total: 484, icon: null }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  width: 100%;
  height: 100%;
}

.c-monitor-device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.c-monitor-device-icon-wrapper {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
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
  gap: 4px;
}

.c-monitor-device-label {
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.c-monitor-device-count {
  font-size: 16px;
  font-weight: 500;
  line-height: 21px;
  text-align: center;
}
</style>
