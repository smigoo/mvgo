<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1788253519416-53cc7d76-content">
      <!-- 左侧垂直导航栏 -->
      <div class="c-mc-lite-1788253519416-53cc7d76-sidebar">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.name"
          class="c-mc-lite-1788253519416-53cc7d76-tab"
          :class="{ 'c-mc-lite-1788253519416-53cc7d76-active': activeTab === index }"
          @click="activeTab = index"
        >
          <span class="c-mc-lite-1788253519416-53cc7d76-tab-text">{{ tab.name }}</span>
          <div
            v-if="tab.badge"
            class="c-mc-lite-1788253519416-53cc7d76-badge"
          >
            {{ tab.badge }}
          </div>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="c-mc-lite-1788253519416-53cc7d76-main">
        <!-- 顶部统计栏 -->
        <div class="c-mc-lite-1788253519416-53cc7d76-header">
          <span class="c-mc-lite-1788253519416-53cc7d76-title">设备监测</span>
          <span class="c-mc-lite-1788253519416-53cc7d76-stat">设备类型<span class="c-mc-lite-1788253519416-53cc7d76-number">28</span></span>
          <span class="c-mc-lite-1788253519416-53cc7d76-stat">设备总数<span class="c-mc-lite-1788253519416-53cc7d76-number">68562</span></span>
          <span class="c-mc-lite-1788253519416-53cc7d76-stat">完好率<span class="c-mc-lite-1788253519416-53cc7d76-number">98%</span></span>
        </div>

        <!-- 两个横向卡片 -->
        <div class="c-mc-lite-1788253519416-53cc7d76-cards">
          <div class="c-mc-lite-1788253519416-53cc7d76-card c-mc-lite-1788253519416-53cc7d76-card-primary">
            <div class="c-mc-lite-1788253519416-53cc7d76-card-icon">
              <div class="c-mc-lite-1788253519416-53cc7d76-icon-circle">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <path d="M20 10 L20 30 M15 15 L25 15 M15 25 L25 25" stroke="#fff" stroke-width="2" fill="none"/>
                </svg>
              </div>
            </div>
            <div class="c-mc-lite-1788253519416-53cc7d76-card-content">
              <div class="c-mc-lite-1788253519416-53cc7d76-card-title">隧道设备</div>
              <div class="c-mc-lite-1788253519416-53cc7d76-card-stats">
                <span>总 数:<span class="c-mc-lite-1788253519416-53cc7d76-large">56302</span></span>
                <span>异常数:<span class="c-mc-lite-1788253519416-53cc7d76-error">5</span></span>
              </div>
            </div>
            <div class="c-mc-lite-1788253519416-53cc7d76-arrow"></div>
          </div>

          <div class="c-mc-lite-1788253519416-53cc7d76-card c-mc-lite-1788253519416-53cc7d76-card-secondary">
            <div class="c-mc-lite-1788253519416-53cc7d76-card-icon">
              <div class="c-mc-lite-1788253519416-53cc7d76-icon-circle">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <ellipse cx="20" cy="20" rx="12" ry="8" stroke="#fff" stroke-width="2" fill="none"/>
                </svg>
              </div>
            </div>
            <div class="c-mc-lite-1788253519416-53cc7d76-card-content">
              <div class="c-mc-lite-1788253519416-53cc7d76-card-title">南北横缝设备</div>
              <div class="c-mc-lite-1788253519416-53cc7d76-card-stats">
                <span>总 数:<span class="c-mc-lite-1788253519416-53cc7d76-large">1280</span></span>
                <span>异常数:<span class="c-mc-lite-1788253519416-53cc7d76-error">3</span></span>
              </div>
            </div>
            <div class="c-mc-lite-1788253519416-53cc7d76-arrow"></div>
          </div>
        </div>

        <!-- 设备网格区域 -->
        <div class="c-mc-lite-1788253519416-53cc7d76-grid">
          <div
            v-for="device in devices"
            :key="device.name"
            class="c-mc-lite-1788253519416-53cc7d76-device-card"
          >
            <div class="c-mc-lite-1788253519416-53cc7d76-device-name">{{ device.name }}</div>
            <div class="c-mc-lite-1788253519416-53cc7d76-device-icon">
              <div class="c-mc-lite-1788253519416-53cc7d76-cylinder">
                <div class="c-mc-lite-1788253519416-53cc7d76-cylinder-top"></div>
                <div class="c-mc-lite-1788253519416-53cc7d76-cylinder-body"></div>
              </div>
              <component :is="device.icon" class="c-mc-lite-1788253519416-53cc7d76-device-svg" />
            </div>
            <div class="c-mc-lite-1788253519416-53cc7d76-device-stats">
              (<span class="c-mc-lite-1788253519416-53cc7d76-error">{{ device.error }}</span>/<span class="c-mc-lite-1788253519416-53cc7d76-total">{{ device.total }}</span>)
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(0)

const tabs = [
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
]

const devices = [
  { name: '摄像机', error: 2, total: 484, icon: 'CameraIcon' },
  { name: '风速风向仪', error: 1, total: 484, icon: 'WindIcon' },
  { name: '超高检测器', error: 0, total: 484, icon: 'HeightIcon' },
  { name: '烟道机器人', error: 0, total: 484, icon: 'RobotIcon' },
  { name: '激光雷达', error: 0, total: 484, icon: 'RadarIcon' },
  { name: 'CO₂传感器', error: 0, total: 484, icon: 'CO2Icon' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: 'COIcon' },
  { name: '温湿度传感器', error: 0, total: 484, icon: 'TempIcon' },
  { name: '压力传感器', error: 0, total: 484, icon: 'PressureIcon' },
  { name: '光照度变送器', error: 0, total: 484, icon: 'LightIcon' },
  { name: '紧急电话', error: 0, total: 484, icon: 'PhoneIcon' },
  { name: '水质监测设备', error: 0, total: 484, icon: 'WaterIcon' }
]

const CameraIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="5" y="10" width="20" height="12" rx="2" fill="currentColor"/><circle cx="15" cy="16" r="4" fill="#fff"/></svg>`
}

const WindIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 10 Q15 8 25 10 M5 15 Q15 17 25 15 M5 20 Q15 18 25 20" stroke="currentColor" stroke-width="2" fill="none"/></svg>`
}

const HeightIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="8" y="5" width="14" height="20" rx="2" fill="currentColor"/><rect x="12" y="10" width="6" height="8" fill="#fff"/></svg>`
}

const RobotIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="8" y="8" width="14" height="14" rx="2" fill="currentColor"/><circle cx="13" cy="14" r="2" fill="#fff"/><circle cx="17" cy="14" r="2" fill="#fff"/></svg>`
}

const RadarIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 15 L20 10" stroke="currentColor" stroke-width="2"/></svg>`
}

const CO2Icon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><text x="5" y="20" font-size="12" fill="currentColor">CO₂</text></svg>`
}

const COIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><text x="8" y="20" font-size="12" fill="currentColor">CO</text></svg>`
}

const TempIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="12" y="5" width="6" height="15" rx="3" fill="currentColor"/><circle cx="15" cy="22" r="4" fill="currentColor"/></svg>`
}

const PressureIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 15 L15 8" stroke="currentColor" stroke-width="2"/></svg>`
}

const LightIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="12" r="5" fill="currentColor"/><path d="M15 17 L15 23 M10 20 L20 20" stroke="currentColor" stroke-width="2"/></svg>`
}

const PhoneIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><path d="M10 8 Q8 8 8 10 L8 20 Q8 22 10 22 L20 22 Q22 22 22 20 L22 10 Q22 8 20 8 Z" stroke="currentColor" stroke-width="2" fill="none"/></svg>`
}

const WaterIcon = {
  template: `<svg width="30" height="30" viewBox="0 0 30 30"><path d="M15 5 Q10 12 10 18 Q10 23 15 23 Q20 23 20 18 Q20 12 15 5 Z" fill="currentColor"/></svg>`
}
</script>

<style scoped>
.c-mc-lite-1788253519416-53cc7d76-content {
  width: 100%;
  height: 100%;
  display: flex;
  background: #A5ADB5;
  font-family: Arial, sans-serif;
}

/* 左侧导航栏 */
.c-mc-lite-1788253519416-53cc7d76-sidebar {
  width: 8%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 15px 8px;
}

.c-mc-lite-1788253519416-53cc7d76-tab {
  background: #3B9EFF;
  border-radius: 8px;
  padding: 12px 8px;
  cursor: pointer;
  position: relative;
  text-align: center;
  transition: background 0.3s;
}

.c-mc-lite-1788253519416-53cc7d76-tab:hover {
  background: #2d8ce8;
}

.c-mc-lite-1788253519416-53cc7d76-tab-text {
  color: #fff;
  font-size: 14px;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
}

.c-mc-lite-1788253519416-53cc7d76-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4d4f;
  color: #fff;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  min-width: 20px;
  text-align: center;
  writing-mode: horizontal-tb;
}

/* 主内容区域 */
.c-mc-lite-1788253519416-53cc7d76-main {
  flex: 1;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 顶部统计栏 */
.c-mc-lite-1788253519416-53cc7d76-header {
  background: #C8D4DE;
  border-radius: 8px;
  padding: 15px 25px;
  display: flex;
  align-items: center;
  gap: 40px;
}

.c-mc-lite-1788253519416-53cc7d76-title {
  color: #3B9EFF;
  font-size: 28px;
  font-weight: bold;
}

.c-mc-lite-1788253519416-53cc7d76-stat {
  color: #3B9EFF;
  font-size: 16px;
}

.c-mc-lite-1788253519416-53cc7d76-number {
  font-size: 32px;
  font-weight: bold;
  margin-left: 8px;
}

/* 两个横向卡片 */
.c-mc-lite-1788253519416-53cc7d76-cards {
  display: flex;
  gap: 20px;
}

.c-mc-lite-1788253519416-53cc7d76-card {
  flex: 1;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s;
}

.c-mc-lite-1788253519416-53cc7d76-card:hover {
  transform: translateY(-2px);
}

.c-mc-lite-1788253519416-53cc7d76-card-primary {
  background: linear-gradient(135deg, #3B9EFF 0%, #2d8ce8 100%);
}

.c-mc-lite-1788253519416-53cc7d76-card-secondary {
  background: linear-gradient(135deg, #7fc4ff 0%, #5fb0ff 100%);
}

.c-mc-lite-1788253519416-53cc7d76-card-icon {
  flex-shrink: 0;
}

.c-mc-lite-1788253519416-53cc7d76-icon-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.c-mc-lite-1788253519416-53cc7d76-card-content {
  flex: 1;
  color: #fff;
}

.c-mc-lite-1788253519416-53cc7d76-card-title {
  font-size: 18px;
  margin-bottom: 10px;
}

.c-mc-lite-1788253519416-53cc7d76-card-stats {
  display: flex;
  gap: 20px;
  font-size: 16px;
}

.c-mc-lite-1788253519416-53cc7d76-large {
  font-size: 36px;
  font-weight: bold;
  margin-left: 8px;
}

.c-mc-lite-1788253519416-53cc7d76-error {
  color: #ff4d4f;
  font-weight: bold;
}

.c-mc-lite-1788253519416-53cc7d76-arrow {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: rgba(255, 255, 255, 0.15);
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

/* 设备网格 */
.c-mc-lite-1788253519416-53cc7d76-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  flex: 1;
}

.c-mc-lite-1788253519416-53cc7d76-device-card {
  background: #C8D4DE;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.c-mc-lite-1788253519416-53cc7d76-device-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.c-mc-lite-1788253519416-53cc7d76-device-name {
  color: #3B9EFF;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
  margin-bottom: 8px;
}

.c-mc-lite-1788253519416-53cc7d76-device-icon {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 10px 0;
}

.c-mc-lite-1788253519416-53cc7d76-cylinder {
  position: absolute;
  width: 100%;
  height: 100%;
}

.c-mc-lite-1788253519416-53cc7d76-cylinder-top {
  position: absolute;
  top: 15%;
  left: 15%;
  width: 70%;
  height: 20%;
  background: linear-gradient(180deg, #e8f4ff 0%, #b8d8f5 100%);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.c-mc-lite-1788253519416-53cc7d76-cylinder-body {
  position: absolute;
  top: 25%;
  left: 15%;
  width: 70%;
  height: 60%;
  background: linear-gradient(90deg, #d0e5f5 0%, #e8f4ff 50%, #d0e5f5 100%);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);
}

.c-mc-lite-1788253519416-53cc7d76-device-svg {
  position: relative;
  z-index: 1;
  color: #3B9EFF;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.c-mc-lite-1788253519416-53cc7d76-device-stats {
  color: #666;
  font-size: 16px;
  margin-top: 8px;
}

.c-mc-lite-1788253519416-53cc7d76-total {
  color: #3B9EFF;
  font-weight: bold;
}
</style>