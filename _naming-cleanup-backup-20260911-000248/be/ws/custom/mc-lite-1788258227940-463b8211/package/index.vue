<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部：标题 + 统计条 -->
      <div class="c-equipment-monitor-header">
        <h1 class="c-equipment-monitor-title">设备监测</h1>
        <div class="c-equipment-monitor-stats">
          <span class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-icon">≡</span>
            设备类型<span class="c-equipment-monitor-stat-value">28</span>
          </span>
          <span class="c-equipment-monitor-stat-item">
            设备总数<span class="c-equipment-monitor-stat-value">68562</span>
          </span>
          <span class="c-equipment-monitor-stat-item">
            完好率<span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-success">98%</span>
          </span>
        </div>
      </div>

      <!-- 统计卡片行 -->
      <div class="c-equipment-monitor-summary-cards">
        <div class="c-equipment-monitor-summary-card c-equipment-monitor-card-primary">
          <div class="c-equipment-monitor-card-icon">
            <div class="c-equipment-monitor-icon-tunnel"></div>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-stats">
              <span class="c-equipment-monitor-card-label">总数:</span>
              <span class="c-equipment-monitor-card-number">56302</span>
            </div>
            <div class="c-equipment-monitor-card-bottom">
              <span class="c-equipment-monitor-card-title">隧道设备</span>
              <span class="c-equipment-monitor-card-stats">
                <span class="c-equipment-monitor-card-label">异常数:</span>
                <span class="c-equipment-monitor-card-number c-equipment-monitor-error">5</span>
              </span>
            </div>
          </div>
        </div>

        <div class="c-equipment-monitor-summary-card c-equipment-monitor-card-secondary">
          <div class="c-equipment-monitor-card-icon">
            <div class="c-equipment-monitor-icon-road"></div>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-stats">
              <span class="c-equipment-monitor-card-label">总数:</span>
              <span class="c-equipment-monitor-card-number">1280</span>
            </div>
            <div class="c-equipment-monitor-card-bottom">
              <span class="c-equipment-monitor-card-title">南北接线设备</span>
              <span class="c-equipment-monitor-card-stats">
                <span class="c-equipment-monitor-card-label">异常数:</span>
                <span class="c-equipment-monitor-card-number c-equipment-monitor-error">3</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主体：左侧导航 + 设备网格 -->
      <div class="c-equipment-monitor-body">
        <div class="c-equipment-monitor-sidebar">
          <div
            v-for="(nav, index) in navItems"
            :key="index"
            class="c-equipment-monitor-nav-btn"
            :class="{ 'is-active': nav.active }"
            @click="handleNavClick(nav)"
          >
            <span class="c-equipment-monitor-nav-text">{{ nav.label }}</span>
            <span v-if="nav.badge" class="c-equipment-monitor-badge">{{ nav.badge }}</span>
            <span v-if="nav.count" class="c-equipment-monitor-count">{{ nav.count }}</span>
          </div>
        </div>

        <div class="c-equipment-monitor-grid">
          <div
            v-for="(device, index) in devices"
            :key="index"
            class="c-equipment-monitor-device-card"
            @click="handleDeviceClick(device)"
          >
            <div class="c-equipment-monitor-device-icon">
              <div class="c-equipment-monitor-icon-base"></div>
              <div class="c-equipment-monitor-icon-symbol" :class="`c-equipment-monitor-icon-${device.iconType}`"></div>
            </div>
            <div class="c-equipment-monitor-device-info">
              <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
              <div class="c-equipment-monitor-device-status">
                (<span :class="device.error > 0 ? 'c-equipment-monitor-error' : 'c-equipment-monitor-normal'">{{ device.error }}</span>/{{ device.total }})
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
  { label: '监控', active: true, badge: '3', count: '3/3740' },
  { label: '照明', active: false, badge: '3', count: '' },
  { label: '通风', active: false, badge: '', count: '' },
  { label: '供配电', active: false, badge: '', count: '' },
  { label: '消防', active: false, badge: '', count: '' },
  { label: '交通诱导', active: false, badge: '', count: '' }
])

const devices = ref([
  { name: '摄像机', error: 2, total: 484, iconType: 'camera' },
  { name: '风速风向仪', error: 1, total: 484, iconType: 'wind' },
  { name: '超高检测器', error: 0, total: 484, iconType: 'height' },
  { name: '烟道机器人', error: 0, total: 484, iconType: 'robot' },
  { name: '激光雷达', error: 0, total: 484, iconType: 'radar' },
  { name: 'CO₂传感器', error: 0, total: 484, iconType: 'co2' },
  { name: 'CO/VI检测器', error: 0, total: 484, iconType: 'co' },
  { name: '温湿度传感器', error: 0, total: 484, iconType: 'temp' },
  { name: '压力传感器', error: 0, total: 484, iconType: 'pressure' },
  { name: '光照度变送器', error: 0, total: 484, iconType: 'light' },
  { name: '紧急电话', error: 0, total: 484, iconType: 'phone' },
  { name: '水质监测设备', error: 0, total: 484, iconType: 'water' }
])

const handleNavClick = (nav) => {
  navItems.value.forEach(item => {
    item.active = item.label === nav.label
  })
  console.log('导航点击:', nav.label)
}

const handleDeviceClick = (device) => {
  console.log('设备点击:', device.name)
}
</script>

<style scoped>
.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #E9F3FC 0%, #F5FAFE 100%);
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 顶部标题 + 统计条 */
.c-equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.c-equipment-monitor-title {
  font-size: 16px;
  font-weight: bold;
  color: #2D9CDB;
  margin: 0;
  white-space: nowrap;
}

.c-equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.c-equipment-monitor-stat-item {
  font-size: 10px;
  color: #2D3748;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.c-equipment-monitor-stat-icon {
  color: #2D9CDB;
  font-size: 11px;
  font-weight: bold;
}

.c-equipment-monitor-stat-value {
  font-size: 14px;
  font-weight: bold;
  color: #2D9CDB;
  margin-left: 2px;
}

.c-equipment-monitor-stat-success {
  color: #27AE60;
}

/* 统计卡片行 */
.c-equipment-monitor-summary-cards {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.c-equipment-monitor-summary-card {
  flex: 1;
  min-width: 0;
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(45, 156, 219, 0.15);
}

.c-equipment-monitor-card-primary {
  background: linear-gradient(135deg, #3E9BF0 0%, #5FB4F5 100%);
  color: #fff;
}

.c-equipment-monitor-card-secondary {
  background: linear-gradient(135deg, #D6EBFB 0%, #E8F4FD 100%);
  color: #1F2937;
}

.c-equipment-monitor-card-icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-equipment-monitor-icon-tunnel {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  position: relative;
}

.c-equipment-monitor-icon-tunnel::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 6px;
  border: 2px solid #3E9BF0;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
}

.c-equipment-monitor-icon-road {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  position: relative;
}

.c-equipment-monitor-icon-road::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 2px;
  background: #7FB8E8;
  box-shadow: 0 -3px 0 #7FB8E8, 0 3px 0 #7FB8E8;
}

.c-equipment-monitor-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-equipment-monitor-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.c-equipment-monitor-card-title {
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.c-equipment-monitor-card-stats {
  display: flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}

.c-equipment-monitor-card-label {
  font-size: 9px;
  font-weight: 500;
  opacity: 0.85;
}

.c-equipment-monitor-card-number {
  font-size: 13px;
  font-weight: bold;
}

.c-equipment-monitor-card-primary .c-equipment-monitor-card-number {
  color: #fff;
}

.c-equipment-monitor-card-secondary .c-equipment-monitor-card-number {
  color: #2D9CDB;
}

/* 主体：导航 + 网格 */
.c-equipment-monitor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
}

/* 左侧导航栏（仅与网格区同高） */
.c-equipment-monitor-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 30px;
  flex-shrink: 0;
  min-height: 0;
}

.c-equipment-monitor-nav-btn {
  flex: 1;
  min-height: 0;
  position: relative;
  background: #C7E4FA;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-nav-btn.is-active {
  background: linear-gradient(180deg, #3E9BF0 0%, #2B8FE8 100%);
}

.c-equipment-monitor-nav-btn:hover {
  filter: brightness(1.05);
}

.c-equipment-monitor-nav-text {
  font-size: 9px;
  font-weight: 500;
  color: #1F5C8B;
  writing-mode: vertical-rl;
  text-align: center;
  letter-spacing: 0;
  line-height: 1.1;
}

.c-equipment-monitor-nav-btn.is-active .c-equipment-monitor-nav-text {
  color: #fff;
}

.c-equipment-monitor-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #E74C3C;
  color: #fff;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  font-size: 8px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.c-equipment-monitor-count {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid #E74C3C;
  color: #E74C3C;
  border-radius: 6px;
  padding: 0 3px;
  font-size: 8px;
  font-weight: bold;
  white-space: nowrap;
  z-index: 1;
}

/* 设备网格区 */
.c-equipment-monitor-grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.c-equipment-monitor-device-card {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #CFE3F2;
  border-radius: 6px;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(45, 156, 219, 0.08);
}

.c-equipment-monitor-device-card:hover {
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px rgba(45, 156, 219, 0.18);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-icon-base {
  position: absolute;
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #FFFFFF 0%, #DCEEFB 100%);
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(45, 156, 219, 0.2);
}

.c-equipment-monitor-icon-symbol {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  background: #2D9CDB;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-icon-symbol::before {
  content: '';
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 1px;
}

.c-equipment-monitor-device-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.c-equipment-monitor-device-name {
  font-size: 10px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-equipment-monitor-device-status {
  font-size: 12px;
  font-weight: bold;
  color: #2D9CDB;
  white-space: nowrap;
}

.c-equipment-monitor-error {
  color: #E74C3C;
}

.c-equipment-monitor-normal {
  color: #2D9CDB;
}
</style>
