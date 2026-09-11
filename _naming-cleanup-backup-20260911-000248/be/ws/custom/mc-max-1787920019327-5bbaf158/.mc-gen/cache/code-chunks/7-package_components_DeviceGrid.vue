<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="device in deviceList"
      :key="device.id"
      class="c-monitor-device-card"
    >
      <div class="c-monitor-device-icon-wrapper">
        <div class="c-monitor-device-icon-bg">
          <div class="c-monitor-device-icon-circle-outer"></div>
          <div class="c-monitor-device-icon-circle-inner"></div>
          <div class="c-monitor-device-icon-dot-1"></div>
          <div class="c-monitor-device-icon-dot-2"></div>
          <div class="c-monitor-device-icon-dot-3"></div>
        </div>
        <div class="c-monitor-device-icon-content">
          <component :is="device.iconComponent" />
        </div>
      </div>
      <div class="c-monitor-device-info">
        <div class="c-monitor-device-name">{{ device.name }}</div>
        <div class="c-monitor-device-count">{{ device.count }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineAsyncComponent } from 'vue'

// 图标组件映射
const iconComponents = {
  camera: defineAsyncComponent(() => import('./icons/CameraIcon.vue')),
  robot: defineAsyncComponent(() => import('./icons/RobotIcon.vue')),
  detector: defineAsyncComponent(() => import('./icons/DetectorIcon.vue')),
  light: defineAsyncComponent(() => import('./icons/LightIcon.vue')),
  lidar: defineAsyncComponent(() => import('./icons/LidarIcon.vue')),
  wind: defineAsyncComponent(() => import('./icons/WindIcon.vue')),
  temp: defineAsyncComponent(() => import('./icons/TempIcon.vue')),
  phone: defineAsyncComponent(() => import('./icons/PhoneIcon.vue')),
  height: defineAsyncComponent(() => import('./icons/HeightIcon.vue')),
  co2: defineAsyncComponent(() => import('./icons/Co2Icon.vue')),
  pressure: defineAsyncComponent(() => import('./icons/PressureIcon.vue')),
  water: defineAsyncComponent(() => import('./icons/WaterIcon.vue'))
}

// 设备列表数据
const deviceList = ref([
  { id: 1, name: '摄像机', count: '(2/484)', iconComponent: iconComponents.camera },
  { id: 2, name: '烟道机器人', count: '(0/484)', iconComponent: iconComponents.robot },
  { id: 3, name: 'CO/VI检测器', count: '(0/484)', iconComponent: iconComponents.detector },
  { id: 4, name: '光照度变送器', count: '(0/484)', iconComponent: iconComponents.light },
  { id: 5, name: '激光雷达', count: '(0/484)', iconComponent: iconComponents.lidar },
  { id: 6, name: '风速风向仪', count: '(1/484)', iconComponent: iconComponents.wind },
  { id: 7, name: '温湿度传感器', count: '(0/484)', iconComponent: iconComponents.temp },
  { id: 8, name: '紧急电话', count: '(0/484)', iconComponent: iconComponents.phone },
  { id: 9, name: '超高检测器', count: '(0/484)', iconComponent: iconComponents.height },
  { id: 10, name: 'CO2传感器', count: '(0/484)', iconComponent: iconComponents.co2 },
  { id: 11, name: '压力传感器', count: '(0/484)', iconComponent: iconComponents.pressure },
  { id: 12, name: '水质监测设备', count: '(0/484)', iconComponent: iconComponents.water }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 11px;
  width: 100%;
  height: 100%;
  padding: 11px;
  box-sizing: border-box;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  box-sizing: border-box;
}

.c-monitor-device-icon-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-device-icon-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.c-monitor-device-icon-circle-outer {
  position: absolute;
  width: 27px;
  height: 27px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(85, 158, 255, 0.2) 0%, rgba(85, 158, 255, 0.05) 100%);
}

.c-monitor-device-icon-circle-inner {
  position: absolute;
  width: 23px;
  height: 23px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0.1) 100%);
}

.c-monitor-device-icon-dot-1,
.c-monitor-device-icon-dot-2,
.c-monitor-device-icon-dot-3 {
  position: absolute;
  width: 1.3px;
  height: 1.3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
}

.c-monitor-device-icon-dot-1 {
  top: 6px;
  left: 8px;
}

.c-monitor-device-icon-dot-2 {
  top: 8px;
  right: 6px;
}

.c-monitor-device-icon-dot-3 {
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.c-monitor-device-icon-content {
  position: absolute;
  width: 16px;
  height: 16px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-device-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: rgba(51, 51, 51, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-device-count {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18.75px;
  color: rgba(51, 51, 51, 1);
}
</style>
```