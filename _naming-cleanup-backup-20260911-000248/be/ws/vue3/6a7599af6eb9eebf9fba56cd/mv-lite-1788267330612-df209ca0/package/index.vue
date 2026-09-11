<template>
  <div class="equipment-monitor">
    <!-- 顶部统计栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-title">设备监测</div>
      <div class="equipment-monitor-header-stats">
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-label">设备类型</span>
          <span class="equipment-monitor-header-stat-value">28</span>
        </div>
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-label">设备总数</span>
          <span class="equipment-monitor-header-stat-value">68562</span>
        </div>
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-label">完好率</span>
          <span class="equipment-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </div>

    <!-- 统计卡片区 -->
    <div class="equipment-monitor-cards">
      <div class="equipment-monitor-card card-primary">
        <div class="equipment-monitor-card-icon">
          <div class="equipment-monitor-card-icon-circle">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 6C13.79 6 12 7.79 12 10C12 10.74 12.2 11.43 12.54 12.03L8 21H10L12 17H20L22 21H24L19.46 12.03C19.8 11.43 20 10.74 20 10C20 7.79 18.21 6 16 6ZM16 8C17.1 8 18 8.9 18 10C18 11.1 17.1 12 16 12C14.9 12 14 11.1 14 10C14 8.9 14.9 8 16 8ZM13.54 15H18.46L17.24 17.5H14.76L13.54 15Z" fill="white"/>
            </svg>
          </div>
        </div>
        <div class="equipment-monitor-card-content">
          <div class="equipment-monitor-card-total">
            <span class="equipment-monitor-card-label">总</span>
            <span class="equipment-monitor-card-label">数:</span>
            <span class="equipment-monitor-card-number">56302</span>
          </div>
          <div class="equipment-monitor-card-info">
            <span class="equipment-monitor-card-name">隧道设备</span>
            <span class="equipment-monitor-card-abnormal">异常数:<span class="equipment-monitor-card-error">5</span></span>
          </div>
        </div>
      </div>

      <div class="equipment-monitor-card card-secondary">
        <div class="equipment-monitor-card-icon">
          <div class="equipment-monitor-card-icon-circle">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 10C11.58 10 8 13.58 8 18C8 19.08 8.24 20.09 8.64 21H23.36C23.76 20.09 24 19.08 24 18C24 13.58 20.42 10 16 10ZM16 12C18.21 12 20 13.79 20 16C20 18.21 18.21 20 16 20C13.79 20 12 18.21 12 16C12 13.79 13.79 12 16 12ZM16 14C14.9 14 14 14.9 14 16C14 17.1 14.9 18 16 18C17.1 18 18 17.1 18 16C18 14.9 17.1 14 16 14Z" fill="white"/>
            </svg>
          </div>
        </div>
        <div class="equipment-monitor-card-content">
          <div class="equipment-monitor-card-total">
            <span class="equipment-monitor-card-label">总</span>
            <span class="equipment-monitor-card-label">数:</span>
            <span class="equipment-monitor-card-number">1280</span>
          </div>
          <div class="equipment-monitor-card-info">
            <span class="equipment-monitor-card-name">南北接线<br>设备</span>
            <span class="equipment-monitor-card-abnormal">异常数:<span class="equipment-monitor-card-error">3</span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航栏 -->
      <div class="equipment-monitor-sidebar">
        <button 
          v-for="(item, index) in navItems" 
          :key="index"
          class="equipment-monitor-sidebar-btn"
          :class="{ active: activeNav === index }"
          @click="activeNav = index"
        >
          <span class="equipment-monitor-sidebar-badge" v-if="item.badge">{{ item.badge }}</span>
          {{ item.label }}
        </button>
      </div>

      <!-- 设备网格 -->
      <div class="equipment-monitor-grid">
        <div 
          v-for="(device, index) in devices" 
          :key="index"
          class="equipment-monitor-device"
        >
          <div class="equipment-monitor-device-icon">
            <div class="equipment-monitor-device-icon-base"></div>
            <div class="equipment-monitor-device-icon-main" :style="{ backgroundColor: device.iconColor }">
              <component :is="device.icon" />
            </div>
          </div>
          <div class="equipment-monitor-device-name">{{ device.name }}</div>
          <div class="equipment-monitor-device-status">
            (<span :class="{ 'error-text': device.error > 0 }">{{ device.error }}</span>/{{ device.total }})
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeNav = ref(0)

const navItems = [
  { label: '监控', badge: '3/3740' },
  { label: '照明', badge: '3' },
  { label: '通风', badge: '' },
  { label: '供配电', badge: '' },
  { label: '消防', badge: '' },
  { label: '交通诱导', badge: '' }
]

const devices = [
  { name: '摄像机', error: 2, total: 484, icon: 'IconCamera', iconColor: '#3B9EFF' },
  { name: '风速风向仪', error: 1, total: 484, icon: 'IconWind', iconColor: '#3B9EFF' },
  { name: '超高检测器', error: 0, total: 484, icon: 'IconHeight', iconColor: '#3B9EFF' },
  { name: '烟道机器人', error: 0, total: 484, icon: 'IconRobot', iconColor: '#5BA3FF' },
  { name: '激光雷达', error: 0, total: 484, icon: 'IconRadar', iconColor: '#3B9EFF' },
  { name: 'CO₂传感器', error: 0, total: 484, icon: 'IconCO2', iconColor: '#3B9EFF' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: 'IconCOVI', iconColor: '#5BA3FF' },
  { name: '温湿度传感器', error: 0, total: 484, icon: 'IconTemp', iconColor: '#3B9EFF' },
  { name: '压力传感器', error: 0, total: 484, icon: 'IconPressure', iconColor: '#3B9EFF' },
  { name: '光照度变送器', error: 0, total: 484, icon: 'IconLight', iconColor: '#5BA3FF' },
  { name: '紧急电话', error: 0, total: 484, icon: 'IconPhone', iconColor: '#3B9EFF' },
  { name: '水质监测设备', error: 0, total: 484, icon: 'IconWater', iconColor: '#3B9EFF' }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E4EEF9;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

/* 顶部统计栏 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 10px;
  height: 36px;
  flex-shrink: 0;
}

.equipment-monitor-header-title {
  font-size: 15px;
  font-weight: 500;
  color: #3B9EFF;
  flex-shrink: 0;
}

.equipment-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.equipment-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.equipment-monitor-header-stat-label {
  font-size: 12px;
  color: #4A5568;
}

.equipment-monitor-header-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #3B9EFF;
}

/* 统计卡片区 */
.equipment-monitor-cards {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.equipment-monitor-card {
  flex: 1;
  min-width: 0;
  height: 78px;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.equipment-monitor-card::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 18px 78px 0;
}

.card-primary {
  background: linear-gradient(135deg, #4AA3FF 0%, #2B8BF5 100%);
}

.card-primary::after {
  border-color: transparent #5FB3FF transparent transparent;
}

.card-secondary {
  background: linear-gradient(135deg, #7DC4FF 0%, #5AAFFF 100%);
}

.card-secondary::after {
  border-color: transparent #8DD0FF transparent transparent;
}

.equipment-monitor-card-icon {
  flex-shrink: 0;
}

.equipment-monitor-card-icon-circle {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}

.equipment-monitor-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2px 0;
}

.equipment-monitor-card-total {
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1;
}

.equipment-monitor-card-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 400;
}

.equipment-monitor-card-number {
  font-size: 16px;
  font-weight: 600;
  color: #FFFFFF;
  margin-left: 2px;
}

.equipment-monitor-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.equipment-monitor-card-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.3;
}

.equipment-monitor-card-abnormal {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
}

.equipment-monitor-card-error {
  color: #FF3B3B;
  font-weight: 600;
}

/* 主内容区 */
.equipment-monitor-main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  overflow: hidden;
}

/* 左侧导航栏 */
.equipment-monitor-sidebar {
  width: 32px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 14px;
  overflow-y: auto;
  overflow-x: visible;
}

.equipment-monitor-sidebar-btn {
  writing-mode: vertical-rl;
  white-space: nowrap;
  height: 48px;
  padding: 5px 6px;
  background: linear-gradient(180deg, #4AA3FF 0%, #2B8BF5 100%);
  border: none;
  border-radius: 4px;
  color: #FFFFFF;
  font-size: 10px;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  font-weight: 400;
}

.equipment-monitor-sidebar-btn:hover {
  background: linear-gradient(180deg, #5AB3FF 0%, #3B9BFF 100%);
}

.equipment-monitor-sidebar-btn.active {
  background: linear-gradient(180deg, #2B8BF5 0%, #1B7BE5 100%);
}

.equipment-monitor-sidebar-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  background: #FF3B3B;
  color: #FFFFFF;
  font-size: 8px;
  padding: 1px 4px;
  border-radius: 8px;
  writing-mode: horizontal-tb;
  white-space: nowrap;
  font-weight: 500;
  z-index: 10;
  min-width: 14px;
  text-align: center;
  line-height: 1.3;
}

/* 设备网格 */
.equipment-monitor-grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  align-content: start;
}

.equipment-monitor-device {
  background: #D4DBE1;
  border-radius: 6px;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #C4CDD6;
  min-height: 0;
}

.equipment-monitor-device-icon {
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.equipment-monitor-device-icon-base {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 8px;
  background: linear-gradient(180deg, rgba(155, 168, 179, 0.4) 0%, rgba(155, 168, 179, 0.2) 100%);
  border-radius: 50%;
}

.equipment-monitor-device-icon-main {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
}

.equipment-monitor-device-name {
  font-size: 10px;
  color: #4A5568;
  text-align: center;
  line-height: 1.3;
  font-weight: 400;
}

.equipment-monitor-device-status {
  font-size: 12px;
  color: #22D3EE;
  font-weight: 500;
}

.error-text {
  color: #FF3B3B;
}
</style>