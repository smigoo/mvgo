<template>
  <div class="c-monitor-main-content">
    <!-- 垂直Tab栏 -->
    <div class="c-monitor-vertical-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.name"
        :class="['c-monitor-tab-item', { 'c-monitor-tab-item-active': activeTab === tab.name }]"
        @click="handleTabChange(tab.name)"
      >
        <span class="c-monitor-tab-text">{{ tab.name }}</span>
        <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 设备网格列表 -->
    <div class="c-monitor-device-grid">
      <div
        v-for="device in deviceList"
        :key="device.id"
        class="c-monitor-device-card"
        :style="{ backgroundImage: `url(${bg3})` }"
      >
        <img :src="getDeviceIcon(device.id)" class="c-monitor-device-icon" />
        <div class="c-monitor-device-content">
          <div class="c-monitor-device-label">{{ device.name }}</div>
          <div class="c-monitor-device-value">
            <span :class="['c-monitor-device-count', { 'c-monitor-device-count-error': device.current > 0 }]">
              {{ device.current }}
            </span>
            <span class="c-monitor-device-total">/{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Tab配置
const tabs = ref([
  { name: '监控', badge: '3' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
])

const activeTab = ref('监控')

// 设备列表数据
const deviceList = ref([
  { id: 'camera', name: '摄像机', current: 2, total: 484 },
  { id: 'anemometer', name: '风速风向仪', current: 1, total: 484 },
  { id: 'height-detector', name: '超高检测器', current: 0, total: 484 },
  { id: 'chimney-robot', name: '烟道机器人', current: 0, total: 484 },
  { id: 'lidar', name: '激光雷达', current: 0, total: 484 },
  { id: 'co2-sensor', name: 'CO₂传感器', current: 0, total: 484 },
  { id: 'covi-detector', name: 'CO/VI检测器', current: 0, total: 484 },
  { id: 'temp-humidity', name: '温湿度传感器', current: 0, total: 484 },
  { id: 'pressure-sensor', name: '压力传感器', current: 0, total: 484 },
  { id: 'illuminance', name: '光照度变送器', current: 0, total: 484 },
  { id: 'emergency-phone', name: '紧急电话', current: 0, total: 484 },
  { id: 'water-monitor', name: '水质监测设备', current: 0, total: 484 }
])

// 图标映射
const iconMap = {
  'camera': icon3,
  'anemometer': icon4,
  'height-detector': icon5,
  'chimney-robot': icon6,
  'lidar': icon7,
  'co2-sensor': icon8,
  'covi-detector': icon9,
  'temp-humidity': icon10,
  'pressure-sensor': icon11,
  'illuminance': icon12,
  'emergency-phone': icon13,
  'water-monitor': icon14
}

const getDeviceIcon = (deviceId) => {
  return iconMap[deviceId] || ''
}

const handleTabChange = (tabName) => {
  activeTab.value = tabName
  // TODO: 根据tab切换更新设备列表数据
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-content {
  display: flex;
  flex-direction: row;
  gap: 8px;
  flex: 317 1 0;
  min-height: 0;
}

.c-monitor-vertical-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
}

.c-monitor-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  cursor: pointer;
  position: relative;
  transition: all 0.3s;
  background: transparent;
}

.c-monitor-tab-item-active {
  background: rgba(25, 144, 255, 0.25);
}

.c-monitor-tab-text {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.14;
  writing-mode: vertical-rl;
  text-align: center;
  white-space: nowrap;
}

.c-monitor-tab-item-active .c-monitor-tab-text {
  color: rgba(255, 255, 255, 1);
  font-weight: 700;
}

.c-monitor-tab-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: calc(@fontSize * 0.857);
  line-height: 14px;
  color: #ffffff;
  background: #ff5050;
  border-radius: 7px;
  text-align: center;
}

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex: 1;
  min-width: 0;
  align-content: start;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 4px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  min-height: 64px;
}

.c-monitor-device-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  margin-bottom: 4px;
}

.c-monitor-device-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.c-monitor-device-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  line-height: 1.5;
}

.c-monitor-device-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-monitor-device-count {
  font-size: calc(@fontSize * 0.857);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  font-family: 'Roboto', sans-serif;
}

.c-monitor-device-count-error {
  color: rgba(255, 80, 80, 1);
}

.c-monitor-device-total {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.6);
  font-family: 'Roboto', sans-serif;
}
</style>