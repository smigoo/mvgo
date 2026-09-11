<template>
  <div class="c-monitor-main-content">
    <!-- 汇总统计卡片行 -->
    <div class="c-monitor-summary-cards">
      <div class="c-monitor-summary-card c-monitor-summary-card-tunnel">
        <img :src="icon1" class="c-monitor-summary-card-icon" alt="隧道设备" />
        <div class="c-monitor-summary-card-content">
          <div class="c-monitor-summary-card-label">隧道设备</div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-sublabel">总 数:</span>
            <span class="c-monitor-summary-card-value">56302</span>
          </div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-sublabel">异常数:</span>
            <span class="c-monitor-summary-card-value-error">5</span>
          </div>
        </div>
      </div>

      <div class="c-monitor-summary-card c-monitor-summary-card-normal">
        <img :src="icon2" class="c-monitor-summary-card-icon" alt="南北拦线设备" />
        <div class="c-monitor-summary-card-content">
          <div class="c-monitor-summary-card-label">南北拦线设备</div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-sublabel">总 数:</span>
            <span class="c-monitor-summary-card-value">1280</span>
          </div>
          <div class="c-monitor-summary-card-row">
            <span class="c-monitor-summary-card-sublabel">异常数:</span>
            <span class="c-monitor-summary-card-value-warning">3</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 设备类型网格（12项） -->
    <div class="c-monitor-device-grid">
      <div
        v-for="device in devices"
        :key="device.id"
        class="c-monitor-device-item"
        :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <img :src="device.icon" class="c-monitor-device-icon" :alt="device.label" />
        <div class="c-monitor-device-label">{{ device.label }}</div>
        <div class="c-monitor-device-count">
          <span :class="device.error > 0 ? 'c-monitor-device-error' : 'c-monitor-device-normal'">
            {{ device.error }}
          </span>
          <span class="c-monitor-device-total">/{{ device.total }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const devices = ref([
  { id: 'camera', label: '摄像机', icon: icon3, error: 2, total: 484 },
  { id: 'anemometer', label: '风速风向仪', icon: icon4, error: 1, total: 484 },
  { id: 'overheight', label: '超高检测器', icon: icon5, error: 0, total: 484 },
  { id: 'flue-robot', label: '烟道机器人', icon: icon6, error: 0, total: 484 },
  { id: 'laser-radar', label: '激光雷达', icon: icon7, error: 0, total: 484 },
  { id: 'co2-sensor', label: 'CO₂传感器', icon: icon8, error: 0, total: 484 },
  { id: 'covi-detector', label: 'CO/VI检测器', icon: icon9, error: 0, total: 484 },
  { id: 'temp-humidity', label: '温湿度传感器', icon: icon10, error: 0, total: 484 },
  { id: 'pressure-sensor', label: '压力传感器', icon: icon11, error: 0, total: 484 },
  { id: 'illuminance', label: '光照度变送器', icon: icon12, error: 0, total: 484 },
  { id: 'emergency-phone', label: '紧急电话', icon: icon13, error: 0, total: 484 },
  { id: 'water-monitor', label: '水质监测设备', icon: icon14, error: 0, total: 484 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-summary-cards {
  flex-shrink: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-summary-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
}

.c-monitor-summary-card-tunnel {
  background: rgba(25, 144, 255, 0.15);
}

.c-monitor-summary-card-normal {
  background: rgba(255, 255, 255, 0.08);
}

.c-monitor-summary-card-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.c-monitor-summary-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-monitor-summary-card-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.3;
}

.c-monitor-summary-card-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-summary-card-sublabel {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.65);
}

.c-monitor-summary-card-value {
  font-size: calc(@fontSize * 1.143);
  font-weight: bold;
  color: rgba(255, 255, 255, 1);
  line-height: 1.2;
}

.c-monitor-summary-card-value-error {
  font-size: calc(@fontSize * 1);
  font-weight: bold;
  color: rgba(255, 77, 79, 1);
}

.c-monitor-summary-card-value-warning {
  font-size: calc(@fontSize * 1);
  font-weight: bold;
  color: rgba(255, 165, 0, 1);
}

.c-monitor-device-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  overflow-y: auto;
}

.c-monitor-device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  border-radius: 8px;
  gap: 6px;
}

.c-monitor-device-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.c-monitor-device-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  line-height: 1.3;
}

.c-monitor-device-count {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.65);
  text-align: center;
}

.c-monitor-device-error {
  font-size: calc(@fontSize * 0.929);
  font-weight: bold;
  color: rgba(255, 77, 79, 1);
}

.c-monitor-device-normal {
  font-size: calc(@fontSize * 0.929);
  font-weight: bold;
  color: rgba(25, 144, 255, 1);
}

.c-monitor-device-total {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.65);
}
</style>
