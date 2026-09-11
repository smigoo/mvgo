<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部标题栏 -->
      <div class="c-equipment-monitor-header">
        <div class="c-equipment-monitor-title">设备监测</div>
        <div class="c-equipment-monitor-stats">
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-icon">≡</span>
            <span class="c-equipment-monitor-stat-label">设备类型</span>
            <span class="c-equipment-monitor-stat-value">28</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备总数</span>
            <span class="c-equipment-monitor-stat-value">68562</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">完好率</span>
            <span class="c-equipment-monitor-stat-value">98%</span>
          </div>
        </div>
      </div>

      <!-- 主体区域：左侧导航 + 右侧内容 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧导航栏 -->
        <div class="c-equipment-monitor-nav">
          <div class="c-equipment-monitor-nav-item" v-for="(item, index) in navItems" :key="index">
            <span class="c-equipment-monitor-nav-badge" v-if="item.badge">{{ item.badge }}</span>
            <span class="c-equipment-monitor-nav-text">{{ item.label }}</span>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-equipment-monitor-right">
          <!-- 统计卡片区 -->
          <div class="c-equipment-monitor-summary">
            <div class="c-equipment-monitor-card c-equipment-monitor-card-primary">
              <div class="c-equipment-monitor-card-icon">
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <circle cx="20" cy="20" r="18" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
                  <path d="M20 12 L16 18 L24 18 Z" fill="white"/>
                  <rect x="18" y="18" width="4" height="8" fill="white"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-card-content">
                <div class="c-equipment-monitor-card-title">隧道设备</div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">总 数:</span>
                  <span class="c-equipment-monitor-card-value">56302</span>
                </div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">异常数:</span>
                  <span class="c-equipment-monitor-card-value c-equipment-monitor-card-value-error">5</span>
                </div>
              </div>
            </div>

            <div class="c-equipment-monitor-card c-equipment-monitor-card-secondary">
              <div class="c-equipment-monitor-card-icon">
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <ellipse cx="20" cy="20" rx="16" ry="12" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
                  <path d="M12 20 L20 15 L28 20 L20 25 Z" fill="white"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-card-content">
                <div class="c-equipment-monitor-card-title">雨北掉缆设备</div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">总 数:</span>
                  <span class="c-equipment-monitor-card-value">1280</span>
                </div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">异常数:</span>
                  <span class="c-equipment-monitor-card-value c-equipment-monitor-card-value-error">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 设备网格 -->
          <div class="c-equipment-monitor-grid">
            <div class="c-equipment-monitor-device-card" v-for="device in devices" :key="device.name">
              <div class="c-equipment-monitor-device-icon">
                <div class="c-equipment-monitor-device-base"></div>
                <div class="c-equipment-monitor-device-symbol">
                  <component :is="device.icon" />
                </div>
              </div>
              <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
              <div class="c-equipment-monitor-device-status" :class="{ 'is-error': device.abnormal > 0 }">
                ({{ device.abnormal }}/{{ device.total }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const navItems = ref([
  { label: '监控', badge: '3/3740' },
  { label: '照明', badge: '' },
  { label: '通风', badge: '' },
  { label: '供配电', badge: '' },
  { label: '消防', badge: '' },
  { label: '交通诱导', badge: '' }
])

const devices = ref([
  { name: '摄像机', abnormal: 2, total: 484, icon: 'CameraIcon' },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: 'WindIcon' },
  { name: '超高检测器', abnormal: 0, total: 484, icon: 'HeightIcon' },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: 'RobotIcon' },
  { name: '激光雷达', abnormal: 0, total: 484, icon: 'RadarIcon' },
  { name: 'CO₂传感器', abnormal: 0, total: 484, icon: 'Co2Icon' },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: 'CoIcon' },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: 'TempIcon' },
  { name: '压力传感器', abnormal: 0, total: 484, icon: 'PressureIcon' },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: 'LightIcon' },
  { name: '紧急电话', abnormal: 0, total: 484, icon: 'PhoneIcon' },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: 'WaterIcon' }
])
</script>

<script>
// Icon components
const CameraIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="4" y="8" width="16" height="10" rx="2" fill="#3B9EFF"/><circle cx="12" cy="13" r="3" fill="white"/></svg>' }
const WindIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 12 L16 12 M8 8 L14 8 M10 16 L16 16" stroke="#3B9EFF" stroke-width="2" fill="none"/></svg>' }
const HeightIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="8" y="6" width="8" height="12" fill="#3B9EFF"/><path d="M12 6 L12 18 M9 9 L15 9 M9 15 L15 15" stroke="white" stroke-width="1.5"/></svg>' }
const RobotIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="8" y="10" width="8" height="8" rx="2" fill="#3B9EFF"/><circle cx="10" cy="13" r="1" fill="white"/><circle cx="14" cy="13" r="1" fill="white"/><path d="M9 16 L15 16" stroke="white" stroke-width="1.5"/></svg>' }
const RadarIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8" fill="none" stroke="#3B9EFF" stroke-width="2"/><path d="M12 12 L16 8" stroke="#3B9EFF" stroke-width="2"/></svg>' }
const Co2Icon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><text x="12" y="16" text-anchor="middle" font-size="10" fill="#3B9EFF" font-weight="bold">CO₂</text></svg>' }
const CoIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><text x="12" y="16" text-anchor="middle" font-size="10" fill="#3B9EFF" font-weight="bold">CO</text></svg>' }
const TempIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="10" y="6" width="4" height="10" rx="2" fill="#3B9EFF"/><circle cx="12" cy="17" r="3" fill="#3B9EFF"/></svg>' }
const PressureIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="6" fill="#3B9EFF"/><path d="M12 9 L12 15 M9 12 L15 12" stroke="white" stroke-width="2"/></svg>' }
const LightIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="4" fill="#3B9EFF"/><path d="M12 4 L12 6 M12 18 L12 20 M4 12 L6 12 M18 12 L20 12" stroke="#3B9EFF" stroke-width="2"/></svg>' }
const PhoneIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 6 L8 18 L16 18 L16 6 Z" fill="#3B9EFF"/><rect x="10" y="15" width="4" height="1" fill="white"/></svg>' }
const WaterIcon = { template: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 6 C9 10, 9 14, 12 18 C15 14, 15 10, 12 6 Z" fill="#3B9EFF"/></svg>' }

export default {
  components: {
    CameraIcon,
    WindIcon,
    HeightIcon,
    RobotIcon,
    RadarIcon,
    Co2Icon,
    CoIcon,
    TempIcon,
    PressureIcon,
    LightIcon,
    PhoneIcon,
    WaterIcon
  }
}
</script>

<style scoped>
.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  background: #A8B5C0;
  color: #2C3E50;
  padding: 10px 0 10px 20px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部标题栏 */
.c-equipment-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-right: 20px;
}

.c-equipment-monitor-title {
  font-size: 16px;
  font-weight: 600;
  color: #3B9EFF;
}

.c-equipment-monitor-stats {
  display: flex;
  gap: 20px;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #2C3E50;
}

.c-equipment-monitor-stat-icon {
  font-size: 16px;
  color: #3B9EFF;
  font-weight: bold;
}

.c-equipment-monitor-stat-label {
  font-size: 13px;
}

.c-equipment-monitor-stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #3B9EFF;
}

/* 主体区域 */
.c-equipment-monitor-main {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航栏 */
.c-equipment-monitor-nav {
  display: grid;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 8px;
  width: 43px;
  min-height: 0;
}

.c-equipment-monitor-nav-item {
  position: relative;
  background: linear-gradient(135deg, #2B7FD8 0%, #3B9EFF 100%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.c-equipment-monitor-nav-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 158, 255, 0.3);
}

.c-equipment-monitor-nav-text {
  writing-mode: vertical-lr;
  text-orientation: upright;
  font-size: 11px;
  color: white;
  font-weight: 500;
  letter-spacing: 2px;
}

.c-equipment-monitor-nav-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #FF4D4F;
  color: white;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
}

/* 右侧内容区 */
.c-equipment-monitor-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 20px;
}

/* 统计卡片区 */
.c-equipment-monitor-summary {
  display: flex;
  gap: 10px;
}

.c-equipment-monitor-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 4px;
  position: relative;
  clip-path: polygon(0 0, 100% 0, 95% 100%, 0 100%);
}

.c-equipment-monitor-card-primary {
  background: linear-gradient(135deg, #2B7FD8 0%, #3B9EFF 100%);
}

.c-equipment-monitor-card-secondary {
  background: rgba(184, 212, 232, 0.6);
}

.c-equipment-monitor-card-icon {
  flex-shrink: 0;
}

.c-equipment-monitor-card-content {
  flex: 1;
  color: white;
}

.c-equipment-monitor-card-secondary .c-equipment-monitor-card-content {
  color: #2C3E50;
}

.c-equipment-monitor-card-title {
  font-size: 11px;
  margin-bottom: 4px;
  opacity: 0.9;
}

.c-equipment-monitor-card-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  margin-top: 2px;
}

.c-equipment-monitor-card-label {
  font-size: 11px;
  opacity: 0.9;
}

.c-equipment-monitor-card-value {
  font-size: 14px;
  font-weight: 600;
}

.c-equipment-monitor-card-value-error {
  color: #FF4D4F;
}

/* 设备网格 */
.c-equipment-monitor-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, min-content);
  gap: 8px 10px;
  align-content: start;
}

.c-equipment-monitor-device-card {
  background: rgba(184, 212, 232, 0.5);
  border-radius: 4px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.c-equipment-monitor-device-card:hover {
  transform: translateY(-2px);
  background: rgba(184, 212, 232, 0.7);
  box-shadow: 0 4px 8px rgba(59, 158, 255, 0.2);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-device-base {
  position: absolute;
  bottom: 0;
  width: 44px;
  height: 20px;
  background: linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.2) 100%);
  border-radius: 50% 50% 0 0 / 30% 30% 0 0;
  border: 1px solid rgba(255,255,255,0.3);
  border-bottom: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.c-equipment-monitor-device-symbol {
  position: relative;
  z-index: 1;
}

.c-equipment-monitor-device-name {
  font-size: 11px;
  font-weight: 400;
  color: #2C3E50;
  text-align: center;
  line-height: 1.3;
}

.c-equipment-monitor-device-status {
  font-size: 13px;
  font-weight: 600;
  color: #22D3EE;
}

.c-equipment-monitor-device-status.is-error {
  color: #FF4D4F;
}
</style>